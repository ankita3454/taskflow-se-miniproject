import { afterEach, describe, expect, it, vi } from "vitest";
import { featureRequest, queryString } from "./sprint2-api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("featureRequest", () => {
  it("sends a bearer token and JSON body using the requested method", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ saved: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await featureRequest(
      "/projects/p/archive",
      "token",
      { method: "POST", body: { archived: true } },
    );

    expect(result).toEqual({ saved: true });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/projects\/p\/archive$/),
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: expect.any(String),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ archived: true }),
      }),
    );
  });

  it("omits an undefined request body and returns null for no-content responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);
    expect(await featureRequest("/empty", undefined)).toBeNull();
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeTruthy();
  });

  it("returns text for successful CSV responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "title,status\nTask,DONE",
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      featureRequest("/tasks.csv", "token", { csv: true }),
    ).resolves.toBe("title,status\nTask,DONE");
  });

  it("falls back when the response body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => { throw new Error("not JSON"); },
      }),
    );
    await expect(featureRequest("/failure", "token")).rejects.toMatchObject({
      message: "Request failed. Please try again.",
      status: 502,
    });
  });

  it("uses the API error message when a JSON error is provided", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: "Forbidden" } }),
      }),
    );
    await expect(featureRequest("/private", "token")).rejects.toMatchObject({
      message: "Forbidden",
      status: 403,
    });
  });
});

describe("queryString", () => {
  it("omits empty and nullish values, encodes the rest, and returns no question mark when empty", () => {
    expect(queryString({
      search: "two words",
      empty: "",
      nil: null,
      missing: undefined,
      zero: 0,
      enabled: false,
    })).toBe("?search=two+words&zero=0&enabled=false");
    expect(queryString({ empty: "", nil: null, missing: undefined })).toBe("");
  });
});
