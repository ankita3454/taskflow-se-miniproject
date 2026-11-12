// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
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

it("recovers from invalid persisted filter state", async () => {
  sessionStorage.setItem("taskflow.explorer.owner", "{not-json");
  render(<TaskExplorer token="t" userId="owner" onSessionExpired={vi.fn()} />);
  expect(await screen.findByText("Shared task")).toBeInTheDocument();
  expect(screen.getByLabelText("Priority", { exact: true })).toHaveValue("");
});

it("shows assignee status controls and blocker details to a non-owner assignee", async () => {
  const assignedTask = {
    ...task,
    status: "IN_PROGRESS",
    assigneeId: "member",
  };
  const otherTask = { ...task, id: "t2", title: "Another task", status: "TODO" };
  featureRequest.mockImplementation(async (path) =>
    path.includes("task-query")
      ? { tasks: [assignedTask, otherTask] }
      : path.endsWith("/history")
        ? { comments: [], activities: [] }
        : { tags: [] },
  );
  render(<TaskExplorer token="t" userId="member" onSessionExpired={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Details: Shared task" }));
  expect(screen.getByLabelText("Change task status")).toHaveValue("IN_PROGRESS");
  expect(screen.getAllByRole("option", { name: "IN_REVIEW" }).length).toBeGreaterThan(0);
  expect(screen.queryByRole("button", { name: "Delete task permanently" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Blocked by"), {
    target: { value: "t2" },
  });
  expect(screen.getByRole("button", { name: "Add dependency" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Add dependency" }));
  await waitFor(() => expect(featureRequest).toHaveBeenCalledWith(
    "/tasks/t1/dependencies",
    "t",
    { method: "POST", body: { blockerId: "t2" } },
  ));
});

it("adds and applies tags, removes task tags, and edits task fields", async () => {
  const taggedTask = {
    ...task,
    taskTags: [{ tag: { id: "tag-1", name: "Urgent" } }],
    blockers: [{ blocker: { id: "blocker", title: "Blocking task", status: "TODO" } }],
  };
  const otherTask = { ...task, id: "t2", title: "Another task" };
  featureRequest.mockImplementation(async (path, _token, options) => {
    if (path.includes("task-query")) return { tasks: [taggedTask, otherTask] };
    if (path.endsWith("/tags") && !options) {
      return { tags: [{ id: "tag-1", name: "Urgent" }] };
    }
    if (path.endsWith("/history")) return { comments: [], activities: [] };
    if (options?.method === "POST" && path.endsWith("/tags")) {
      return { tag: { id: "tag-1", name: "Urgent" } };
    }
    return {};
  });
  render(<TaskExplorer token="t" userId="owner" onSessionExpired={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Details: Shared task" }));
  expect(screen.getByText("Blocking task — TODO")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Apply project tag"), {
    target: { value: "tag-1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Remove Urgent" }));
  fireEvent.change(screen.getByLabelText("New tag"), {
    target: { value: "New tag" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create and apply tag" }));
  await waitFor(() => expect(featureRequest).toHaveBeenCalledWith(
    "/tasks/t1/tags/tag-1",
    "t",
    { method: "PUT" },
  ));
  fireEvent.change(screen.getByLabelText("title"), {
    target: { value: "Updated task" },
  });
  fireEvent.change(screen.getByLabelText("timeEstimate"), {
    target: { value: "2.5" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save task details" }));
  await waitFor(() => expect(featureRequest).toHaveBeenCalledWith(
    "/tasks/t1",
    "t",
    expect.objectContaining({
      method: "PATCH",
      body: expect.objectContaining({
        title: "Updated task",
        timeEstimate: 2.5,
      }),
    }),
  ));
});

it("handles an inaccessible project without retaining its task list", async () => {
  const expired = vi.fn();
  api.projects.mockRejectedValue(
    Object.assign(new Error("Access denied"), { status: 403 }),
  );
  render(<TaskExplorer token="t" userId="owner" onSessionExpired={expired} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Access denied");
  expect(screen.queryByText("Shared task")).not.toBeInTheDocument();
  expect(expired).not.toHaveBeenCalled();
});

it("shows archived project labels and handles unassigned in-progress tasks", async () => {
  const unassigned = {
    ...task,
    status: "IN_PROGRESS",
    assigneeId: null,
    description: "",
  };
  api.projects.mockResolvedValue({
    projects: [{ id: "p1", name: "Project", ownerId: "owner", archived: true }],
  });
  featureRequest.mockImplementation(async (path) =>
    path.includes("task-query")
      ? { tasks: [unassigned] }
      : path.endsWith("/history")
        ? { comments: [], activities: [] }
        : { tags: [] },
  );
  render(<TaskExplorer token="t" userId="owner" onSessionExpired={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Details: Shared task" }));
  expect(screen.getByRole("option", { name: "Project (archived)" })).toBeInTheDocument();
  expect(screen.getByLabelText("Change task status")).toHaveDisplayValue("IN_PROGRESS");
  expect(screen.getAllByRole("option", { name: "TODO" }).length).toBeGreaterThan(0);
  expect(screen.getByText("Shared task", { selector: "strong" })).toBeInTheDocument();
});

it("creates a new project tag and sends null for blank optional task fields", async () => {
  const createdTag = { id: "new-tag", name: "Fresh" };
  featureRequest.mockImplementation(async (path, _token, options) => {
    if (path.includes("task-query")) return { tasks: [task] };
    if (path.endsWith("/tags") && !options) return { tags: [] };
    if (path.endsWith("/history")) return { comments: [], activities: [] };
    if (options?.method === "POST" && path.endsWith("/tags")) {
      return { tag: createdTag };
    }
    return {};
  });
  render(<TaskExplorer token="t" userId="owner" onSessionExpired={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Details: Shared task" }));
  fireEvent.change(screen.getByLabelText("New tag"), {
    target: { value: "Fresh" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create and apply tag" }));
  await waitFor(() => expect(featureRequest).toHaveBeenCalledWith(
    "/tasks/t1/tags/new-tag",
    "t",
    { method: "PUT" },
  ));
  fireEvent.click(screen.getByRole("button", { name: "Save task details" }));
  await waitFor(() => expect(featureRequest).toHaveBeenCalledWith(
    "/tasks/t1",
    "t",
    expect.objectContaining({
      method: "PATCH",
      body: expect.objectContaining({ dueDate: null, timeEstimate: null }),
    }),
  ));
});

it("expires the session when project loading returns 401", async () => {
  const expired = vi.fn();
  api.projects.mockRejectedValue(
    Object.assign(new Error("Expired"), { status: 401 }),
  );
  render(<TaskExplorer token="t" userId="owner" onSessionExpired={expired} />);
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
});

it("clears queried tasks when access is revoked", async () => {
  featureRequest.mockImplementation((path) =>
    path.includes("task-query")
      ? Promise.reject(Object.assign(new Error("Project removed"), { status: 404 }))
      : Promise.resolve({ tags: [] }),
  );
  render(<TaskExplorer token="t" userId="owner" onSessionExpired={vi.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Project removed");
  expect(screen.queryByText("Shared task")).not.toBeInTheDocument();
});

it("reports project tag loading errors", async () => {
  let rejectTags;
  featureRequest.mockImplementation((path) => {
    if (path.includes("task-query")) return Promise.resolve({ tasks: [task] });
    if (path.endsWith("/tags")) {
      return new Promise((_resolve, reject) => {
        rejectTags = reject;
      });
    }
    return Promise.resolve({ comments: [], activities: [] });
  });
  render(<TaskExplorer token="t" userId="owner" onSessionExpired={vi.fn()} />);
  expect(await screen.findByText("Shared task")).toBeInTheDocument();
  await waitFor(() => expect(rejectTags).toBeTypeOf("function"));
  await act(async () => { rejectTags(new Error("Tags unavailable")); });
  expect(await screen.findByRole("alert")).toHaveTextContent("Tags unavailable");
});

it("deletes a task after owner confirmation", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<TaskExplorer token="t" userId="owner" onSessionExpired={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Details: Shared task" }));
  fireEvent.click(screen.getByRole("button", { name: /delete task/i }));
  await waitFor(() => expect(featureRequest).toHaveBeenCalledWith(
    "/tasks/t1",
    "t",
    { method: "DELETE" },
  ));
  await waitFor(() => expect(screen.queryByRole("region", { name: "Task details for Shared task" })).not.toBeInTheDocument());
});

it("keeps an empty project list idle without querying tasks", async () => {
  api.projects.mockResolvedValue({ projects: [] });
  render(<TaskExplorer token="t" userId="owner" onSessionExpired={vi.fn()} />);
  await waitFor(() => expect(screen.getByLabelText("Browse project").children).toHaveLength(0));
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(featureRequest).not.toHaveBeenCalled();
});

it("ignores project results that arrive after the explorer unmounts", async () => {
  let resolveProjects;
  api.projects.mockImplementation(() => new Promise((resolve) => {
    resolveProjects = resolve;
  }));
  const view = render(<TaskExplorer token="t" userId="owner" onSessionExpired={vi.fn()} />);
  await waitFor(() => expect(resolveProjects).toBeTypeOf("function"));
  view.unmount();
  await act(async () => {
    resolveProjects({
      projects: [{ id: "p1", name: "Project", ownerId: "owner" }],
    });
  });
});

it("does not duplicate a tag that already exists in the project", async () => {
  const existingTag = { id: "tag-1", name: "Urgent" };
  featureRequest.mockImplementation(async (path, _token, options) => {
    if (path.includes("task-query")) return { tasks: [task] };
    if (path.endsWith("/tags") && !options) return { tags: [existingTag] };
    if (path.endsWith("/history")) return { comments: [], activities: [] };
    if (options?.method === "POST" && path.endsWith("/tags")) {
      return { tag: existingTag };
    }
    return {};
  });
  render(<TaskExplorer token="t" userId="owner" onSessionExpired={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Details: Shared task" }));
  fireEvent.change(screen.getByLabelText("New tag"), {
    target: { value: "Urgent" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create and apply tag" }));
  await waitFor(() => expect(featureRequest).toHaveBeenCalledWith(
    "/tasks/t1/tags/tag-1",
    "t",
    { method: "PUT" },
  ));
});
