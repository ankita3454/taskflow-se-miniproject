// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import TaskExplorer from "./TaskExplorer.jsx";
import { api } from "../lib/api.js";
import { featureRequest } from "../lib/sprint2-api.js";
vi.mock("../lib/api.js", () => ({
  api: { projects: vi.fn(), projectMembers: vi.fn() },
}));
vi.mock("../lib/sprint2-api.js", () => ({
  featureRequest: vi.fn(),
  queryString: (o) =>
    "?" +
    new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString(),
}));
const task = {
  id: "t1",
  projectId: "p1",
  title: "Shared task",
  description: "Description",
  status: "IN_REVIEW",
  priority: "HIGH",
  assigneeId: "member",
  taskTags: [],
  blockers: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  api.projects.mockResolvedValue({
    projects: [{ id: "p1", name: "Project", ownerId: "owner" }],
  });
  api.projectMembers.mockResolvedValue({ members: [] });
  featureRequest.mockImplementation(async (p) =>
    p.includes("task-query")
      ? { tasks: [task] }
      : p.endsWith("/history")
        ? { comments: [], activities: [] }
        : { tags: [] },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("switches list/Kanban views and restores session view on remount", async () => {
  const props = { token: "t", userId: "owner", onSessionExpired: vi.fn() };
  const view = render(<TaskExplorer {...props} />);
  await screen.findByText("Shared task");
  fireEvent.change(screen.getByLabelText("Search title or description"), {
    target: { value: "Shared" },
  });
  fireEvent.change(screen.getByLabelText("Priority", { exact: true }), {
    target: { value: "HIGH" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Kanban view" }));
  expect(
    screen.getByRole("heading", { name: "IN REVIEW" }),
  ).toBeInTheDocument();
  view.unmount();
  render(<TaskExplorer {...props} />);
  expect(screen.getByRole("button", { name: "Kanban view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByLabelText("Search title or description")).toHaveValue(
    "Shared",
  );
  expect(screen.getByLabelText("Priority", { exact: true })).toHaveValue(
    "HIGH",
  );
  await screen.findByText("Shared task");
});
it("cancelled deletion preserves the task and sends no DELETE", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<TaskExplorer token="t" userId="owner" onSessionExpired={vi.fn()} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Details: Shared task" }),
  );
  fireEvent.click(screen.getByRole("button", { name: /delete task/i }));
  expect(window.confirm).toHaveBeenCalledOnce();
  expect(
    featureRequest.mock.calls.some(([, , o]) => o?.method === "DELETE"),
  ).toBe(false);
});
it("shows a blocked completion error without changing the displayed status", async () => {
  const original = featureRequest.getMockImplementation();
  featureRequest.mockImplementation((p, t, o) =>
    o?.method === "PATCH"
      ? Promise.reject(new Error("Complete blocking tasks first"))
      : original(p, t, o),
  );
  render(<TaskExplorer token="t" userId="owner" onSessionExpired={vi.fn()} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Details: Shared task" }),
  );
  fireEvent.change(screen.getByLabelText("Change task status"), {
    target: { value: "DONE" },
  });
  await waitFor(() =>
    expect(
      screen
        .getAllByRole("alert")
        .some((e) => e.textContent.includes("Complete blocking tasks first")),
    ).toBe(true),
  );
  expect(screen.getByLabelText("Change task status")).toHaveValue("IN_REVIEW");
});
