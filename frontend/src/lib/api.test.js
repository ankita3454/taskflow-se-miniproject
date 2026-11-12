import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("api.createTask", () => {
  it("sends the Idempotency-Key header", async () => {
    const mockResponse = {
      ok: true,
      status: 201,
      json: async () => ({
        task: { id: "task-1", title: "Test task" },
      }),
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse),
    );

    const payload = {
      projectId: "project-1",
      title: "Test task",
      description: "",
      priority: "MEDIUM",
      dueDate: null,
      timeEstimate: null,
    };

    await api.createTask(payload, "test-token", "test-idempotency-key");

    expect(fetch).toHaveBeenCalledTimes(1);

    const [, options] = fetch.mock.calls[0];

    expect(options.method).toBe("POST");
    expect(options.headers["Idempotency-Key"]).toBe(
      "test-idempotency-key",
    );
    expect(options.headers.Authorization).toBe("Bearer test-token");
    expect(JSON.parse(options.body)).toEqual(payload);
  });
});

describe("API request handling", () => {
  it("supports empty bodies, missing tokens, and no-content responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);

    expect(await api.logout()).toBeNull();
    const [, options] = fetchMock.mock.calls[0];
    expect(options.method).toBe("POST");
    expect(options.body).toBeUndefined();
    expect(options.headers.Authorization).toBeUndefined();
  });

  it("returns JSON success responses and encodes path parameters", async () => {
    const payload = { tasks: [] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await api.projectTasks("project / one", "token")).toBe(payload);
    expect(fetchMock.mock.calls[0][0]).toContain("project%20%2F%20one");
  });

  it("maps structured API failures and supplies fallbacks for invalid error bodies", async () => {
    const structured = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          fields: { title: "Required" },
        },
      }),
    });
    vi.stubGlobal("fetch", structured);
    await expect(api.createProject("token", "")).rejects.toMatchObject({
      status: 422,
      code: "VALIDATION_ERROR",
      message: "Invalid input",
      fields: { title: "Required" },
    });
    expect(structured.mock.calls[0][1].headers.Authorization).toBeTruthy();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => { throw new Error("not JSON"); },
      }),
    );
    await expect(api.me()).rejects.toMatchObject({
      status: 500,
      code: "UNKNOWN",
      message: "Something went wrong. Please try again.",
      fields: {},
    });
  });

  it("uses error defaults for incomplete JSON API error responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: "", message: "" } }),
      }),
    );
    await expect(api.login("a@example.test", "bad")).rejects.toMatchObject({
      status: 400,
      code: "UNKNOWN",
      message: "Something went wrong. Please try again.",
      fields: {},
    });
    expect(ApiError).toBeDefined();
  });

  it("exposes all resource operations through their expected HTTP methods", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.register("A", "a@example.test", "password");
    await api.updateMe("token", { name: "A" });
    await api.projects("token");
    await api.projectMembers("p/1", "token");
    await api.changeTaskStatus("t/1", "DONE", "token");
    await api.assignTask("t/1", "u/1", "token");
    await api.invitations("token");
    await api.inviteMember("token", "p/1", "a@example.test");
    await api.respondToInvitation("token", "i/1", "accept");
    await api.listNotifications("token");
    await api.getUnreadNotificationCount("token");
    await api.markNotificationRead("token", "n/1");
    await api.markAllNotificationsRead("token");

    expect(fetchMock).toHaveBeenCalledTimes(13);
    expect(fetchMock.mock.calls.map(([, options]) => options.method || "GET")).toEqual([
      "POST", "PATCH", "GET", "GET", "PATCH", "PATCH", "GET",
      "POST", "POST", "GET", "GET", "PATCH", "PATCH",
    ]);
  });
});