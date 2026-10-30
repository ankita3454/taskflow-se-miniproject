// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
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
