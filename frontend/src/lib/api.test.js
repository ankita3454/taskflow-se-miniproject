import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api.js";

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