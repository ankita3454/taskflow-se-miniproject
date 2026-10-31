// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import TaskWorkspace from "./TaskWorkspace.jsx";
import { api } from "../lib/api.js";

vi.mock("../lib/api.js", () => ({
    api: {
      projects: vi.fn(),
      projectTasks: vi.fn(),
      createTask: vi.fn(),
      changeTaskStatus: vi.fn(),
      projectMembers: vi.fn(),
      assignTask: vi.fn(),
  },
}));

const project = {
  id: "project-1",
  name: "Project One",
  archived: false,
};

function createdTask(title, id) {
  return {
    id,
    title,
    status: "TODO",
    priority: "MEDIUM",
    description: "",
    dueDate: null,
    timeEstimate: null,
  };
}

function enterTitle(title) {
  fireEvent.change(screen.getByLabelText(/title/i), {
    target: { name: "title", value: title },
  });
}

async function submitTask() {
  fireEvent.click(screen.getByRole("button", { name: /create task/i }));
}

beforeEach(() => {
  vi.clearAllMocks();

  let keyNumber = 0;
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => `test-key-${++keyNumber}`),
  });

  api.projects.mockResolvedValue({ projects: [project] });
  api.projectTasks.mockResolvedValue({ tasks: [] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TaskWorkspace idempotency", () => {
  it("reuses the same key when retrying an unchanged submission after a network failure", async () => {
    api.createTask
      .mockRejectedValueOnce(new TypeError("Network error"))
      .mockResolvedValueOnce({ task: createdTask("Retry task", "task-retry") });

    render(
      <TaskWorkspace
        token="test-token"
        onSessionExpired={vi.fn()}
      />,
    );

    enterTitle("Retry task");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /create task/i }),
      ).toBeEnabled();
    });

    await submitTask();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Network error",
    );

    await submitTask();

    await waitFor(() => {
      expect(api.createTask).toHaveBeenCalledTimes(2);
    });

    const firstCall = api.createTask.mock.calls[0];
    const secondCall = api.createTask.mock.calls[1];

    expect(firstCall[0]).toEqual(secondCall[0]);
    expect(firstCall[2]).toBe("test-key-1");
    expect(secondCall[2]).toBe("test-key-1");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Task created successfully.",
    );
  });

  it("generates a new key for a separate intentional submission after success", async () => {
    api.createTask
      .mockResolvedValueOnce({ task: createdTask("Repeated task", "task-repeated-1") })
      .mockResolvedValueOnce({ task: createdTask("Repeated task", "task-repeated-2") });

    render(
      <TaskWorkspace
        token="test-token"
        onSessionExpired={vi.fn()}
      />,
    );

    enterTitle("Repeated task");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /create task/i }),
      ).toBeEnabled();
    });

    await submitTask();

    await waitFor(() => {
      expect(api.createTask).toHaveBeenCalledTimes(1);
    });

    // The form resets after success; entering the same title again
    // represents a new intentional task-creation attempt.
    enterTitle("Repeated task");
    await submitTask();

    await waitFor(() => {
      expect(api.createTask).toHaveBeenCalledTimes(2);
    });

    expect(api.createTask.mock.calls[0][2]).toBe("test-key-1");
    expect(api.createTask.mock.calls[1][2]).toBe("test-key-2");
  });

  it("generates a new key if the payload changes after a failed submission", async () => {
    api.createTask
      .mockRejectedValueOnce(new TypeError("Network error"))
      .mockResolvedValueOnce({ task: createdTask("Updated task", "task-updated") });

    render(
      <TaskWorkspace
        token="test-token"
        onSessionExpired={vi.fn()}
      />,
    );

    enterTitle("Original task");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /create task/i }),
      ).toBeEnabled();
    });

    await submitTask();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Network error",
    );

    enterTitle("Updated task");
    await submitTask();

    await waitFor(() => {
      expect(api.createTask).toHaveBeenCalledTimes(2);
    });

    expect(api.createTask.mock.calls[0][2]).toBe("test-key-1");
    expect(api.createTask.mock.calls[1][2]).toBe("test-key-2");
    expect(api.createTask.mock.calls[0][0].title).toBe("Original task");
    expect(api.createTask.mock.calls[1][0].title).toBe("Updated task");
  });

it("updates the displayed status after a successful change", async () => {
  const task = createdTask("Status task", "task-status");

  api.projects.mockResolvedValue({ projects: [project] });
  api.projectTasks.mockResolvedValue({ tasks: [task] });
  api.changeTaskStatus.mockResolvedValue({
    task: { ...task, status: "IN_PROGRESS" },
  });

  render(
    <TaskWorkspace
      api={api}
      token="test-token"
      onSessionExpired={vi.fn()}
    />,
  );

  const statusSelect = await screen.findByRole("combobox", {
    name: "Status for Status task",
  });

  fireEvent.change(statusSelect, {
    target: { value: "IN_PROGRESS" },
  });

  await waitFor(() => {
    expect(api.changeTaskStatus).toHaveBeenCalledWith(
      "task-status",
      "IN_PROGRESS",
      "test-token",
    );
    expect(statusSelect).toHaveValue("IN_PROGRESS");
  });
});

it("preserves the original status and displays an error when a change fails", async () => {
  const task = createdTask("Status task", "task-status");

  api.projects.mockResolvedValue({ projects: [project] });
  api.projectTasks.mockResolvedValue({ tasks: [task] });
  api.changeTaskStatus.mockRejectedValue(
    new Error("Invalid status transition"),
  );

  render(
    <TaskWorkspace
      api={api}
      token="test-token"
      onSessionExpired={vi.fn()}
    />,
  );

  const statusSelect = await screen.findByRole("combobox", {
    name: "Status for Status task",
  });

  fireEvent.change(statusSelect, {
    target: { value: "IN_PROGRESS" },
  });

  expect(
    await screen.findByText("Invalid status transition"),
  ).toBeInTheDocument();

  expect(statusSelect).toHaveValue("TODO");
});

it("expires the session when the status change returns 401", async () => {
  const task = createdTask("Status task", "task-status");
  const onSessionExpired = vi.fn();
  const error = new Error("Authentication required");
  error.status = 401;

  api.projects.mockResolvedValue({ projects: [project] });
  api.projectTasks.mockResolvedValue({ tasks: [task] });
  api.changeTaskStatus.mockRejectedValue(error);

  render(
    <TaskWorkspace
      api={api}
      token="test-token"
      onSessionExpired={onSessionExpired}
    />,
  );

  const statusSelect = await screen.findByRole("combobox", {
    name: "Status for Status task",
  });

  fireEvent.change(statusSelect, {
    target: { value: "IN_PROGRESS" },
  });

  await waitFor(() => {
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  expect(statusSelect).toHaveValue("TODO");
});

});

describe("TaskWorkspace background synchronization", () => {
  const ownerId = "owner-1";
  const member = { id: "member-1", name: "Member One", email: "member@example.test" };
  let task;
  let onSessionExpired;
  function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
  }
  async function mount(props = {}) {
    let view;
    await act(async () => {
      view = render(<TaskWorkspace token="sync-token" userId={ownerId} onSessionExpired={onSessionExpired} {...props} />);
    });
    return view;
  }
  async function poll() {
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  }
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    task = { ...createdTask("Shared task", "shared-1"), assigneeId: member.id, assignee: member };
    onSessionExpired = vi.fn();
    api.projects.mockResolvedValue({ projects: [{ ...project, ownerId }] });
    api.projectTasks.mockResolvedValue({ tasks: [task] });
    api.projectMembers.mockResolvedValue({ members: [{ user: member }] });
  });
  it("refreshes another user's status change without reload or losing form input", async () => {
    await mount();
    enterTitle("Unfinished draft");
    fireEvent.change(screen.getByLabelText(/description/i), { target: { name: "description", value: "Keep my description" } });
    api.projectTasks.mockResolvedValue({ tasks: [{ ...task, status: "IN_REVIEW" }] });
    await poll();
    expect(screen.getByRole("combobox", { name: "Status for Shared task" })).toHaveValue("IN_REVIEW");
    expect(screen.getByLabelText(/title/i)).toHaveValue("Unfinished draft");
    expect(screen.getByLabelText(/description/i)).toHaveValue("Keep my description");
    expect(api.projectTasks).toHaveBeenCalledTimes(2);
  });
  it("ignores an old poll completing after a successful local status change", async () => {
    await mount();
    const stale = deferred();
    api.projectTasks.mockReturnValueOnce(stale.promise);
    await poll();
    api.changeTaskStatus.mockResolvedValue({ task: { ...task, status: "IN_PROGRESS" } });
    await act(async () => { fireEvent.change(screen.getByLabelText("Status for Shared task"), { target: { value: "IN_PROGRESS" } }); });
    await act(async () => { stale.resolve({ tasks: [task] }); });
    expect(screen.getByLabelText("Status for Shared task")).toHaveValue("IN_PROGRESS");
  });
  it("pauses refresh requests during a pending status write and resumes afterwards", async () => {
    await mount();
    const pending = deferred();
    api.changeTaskStatus.mockReturnValueOnce(pending.promise);
    fireEvent.change(screen.getByLabelText("Status for Shared task"), { target: { value: "IN_PROGRESS" } });
    await poll();
    expect(api.projectTasks).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve({ task: { ...task, status: "IN_PROGRESS" } }); });
    api.projectTasks.mockResolvedValue({ tasks: [{ ...task, status: "IN_PROGRESS" }] });
    await poll();
    expect(api.projectTasks).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Status for Shared task")).toHaveValue("IN_PROGRESS");
  });
  it("does not let a stale poll erase a newly created task", async () => {
    await mount();
    const stale = deferred();
    api.projectTasks.mockReturnValueOnce(stale.promise);
    await poll();
    enterTitle("New task");
    api.createTask.mockResolvedValue({ task: createdTask("New task", "new-1") });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Create task" })); });
    await act(async () => { stale.resolve({ tasks: [task] }); });
    expect(screen.getByText("New task")).toBeInTheDocument();
  });
  it("does not let a stale poll undo a successful assignment", async () => {
    task = { ...task, assigneeId: null, assignee: null };
    api.projectTasks.mockResolvedValue({ tasks: [task] });
    await mount();
    const stale = deferred();
    api.projectTasks.mockReturnValueOnce(stale.promise);
    await poll();
    api.assignTask.mockResolvedValue({ task: { ...task, assigneeId: member.id, assignee: member } });
    await act(async () => { fireEvent.change(screen.getByLabelText("Assignee for Shared task"), { target: { value: member.id } }); });
    await act(async () => { stale.resolve({ tasks: [task] }); });
    expect(screen.getByLabelText("Assignee for Shared task")).toHaveValue(member.id);
  });
  it("keeps the last good tasks and draft through a temporary refresh failure", async () => {
    await mount();
    enterTitle("Keep this draft");
    api.projectTasks.mockRejectedValueOnce(new Error("Network unavailable"));
    await poll();
    expect(screen.getByText("Shared task")).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toHaveValue("Keep this draft");
    expect(screen.getByRole("alert")).toHaveTextContent("Could not refresh tasks");
    api.projectTasks.mockResolvedValue({ tasks: [{ ...task, status: "IN_PROGRESS" }] });
    await poll();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Status for Shared task")).toHaveValue("IN_PROGRESS");
  });
  it("stops polling and expires the session on 401", async () => {
    await mount();
    api.projectTasks.mockRejectedValueOnce(Object.assign(new Error("Expired"), { status: 401 }));
    await poll();
    expect(onSessionExpired).toHaveBeenCalledOnce();
    await poll();
    expect(api.projectTasks).toHaveBeenCalledTimes(2);
  });
  it("clears inaccessible task data and stops polling on revoked access", async () => {
    await mount();
    api.projectTasks.mockRejectedValueOnce(Object.assign(new Error("Access revoked"), { status: 403 }));
    await poll();
    expect(screen.queryByText("Shared task")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Access revoked");
    await poll();
    expect(api.projectTasks).toHaveBeenCalledTimes(2);
  });
  it("ignores late responses from a previously selected project", async () => {
    api.projects.mockResolvedValue({ projects: [{ ...project, ownerId }, { ...project, id: "project-2", name: "Project Two", ownerId }] });
    await mount();
    const stale = deferred();
    api.projectTasks.mockReturnValueOnce(stale.promise);
    await poll();
    api.projectTasks.mockResolvedValue({ tasks: [createdTask("Second project task", "second-1")] });
    await act(async () => { fireEvent.change(screen.getByLabelText("Project"), { target: { value: "project-2" } }); });
    await act(async () => { stale.resolve({ tasks: [task] }); });
    expect(screen.getByText("Second project task")).toBeInTheDocument();
    expect(screen.queryByText("Shared task")).not.toBeInTheDocument();
  });
  it("cleans up its timer on unmount", async () => {
    const view = await mount();
    view.unmount();
    await poll();
    expect(api.projectTasks).toHaveBeenCalledTimes(1);
  });
});
