// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import App from "./App.jsx";
import { api, ApiError } from "./lib/api.js";
vi.mock("./lib/api.js", () => ({
  ApiError: class ApiError extends Error {
    constructor(status, code, message) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  api: Object.fromEntries(
    [
      "me",
      "login",
      "register",
      "logout",
      "updateMe",
      "projects",
      "createProject",
      "invitations",
      "inviteMember",
      "respondToInvitation",
      "projectTasks",
      "projectMembers",
      "createTask",
      "changeTaskStatus",
      "assignTask",
      "listNotifications",
      "markNotificationRead",
      "markAllNotificationsRead",
    ].map((key) => [key, vi.fn()]),
  ),
}));
const user = {
  id: "user-1",
  name: "Avery Green",
  email: "avery@example.test",
  role: "MEMBER",
};
const project = {
  id: "project-1",
  name: "Launch planning",
  ownerId: user.id,
  archived: false,
};
const task = {
  id: "task-1",
  title: "Plan kickoff",
  status: "TODO",
  priority: "MEDIUM",
  assigneeId: user.id,
  assignee: user,
};
const notification = {
  id: "notification-1",
  body: "Your task was updated.",
  isRead: false,
  createdAt: "2026-10-31T12:00:00Z",
};
async function open(page = "home", authenticated = true) {
  if (authenticated) localStorage.setItem("taskflow.token", "test-token");
  window.history.replaceState(null, "", `/#/${page}`);
  await act(async () => {
    render(<App />);
  });
}
async function navigate(page) {
  await act(async () => {
    window.location.hash = `/${page}`;
    window.dispatchEvent(new Event("hashchange"));
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  api.me.mockResolvedValue({ user });
  api.projects.mockResolvedValue({ projects: [project] });
  api.invitations.mockResolvedValue({ invitations: [] });
  api.projectTasks.mockResolvedValue({ tasks: [task] });
  api.projectMembers.mockResolvedValue({ members: [{ user }] });
  api.listNotifications.mockResolvedValue({ notifications: [notification] });
  api.logout.mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});
describe("UI-only workspace navigation", () => {
  it("shows only the Overview screen instead of stacking all features", async () => {
    await open();
    expect(
      screen.getByRole("heading", { level: 1, name: "Overview" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Overview screen" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Tasks screen" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Profile screen" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Main navigation" }),
    ).toBeInTheDocument();
  });
  it("opens direct links to Tasks and retains existing task controls", async () => {
    await open("tasks");
    expect(
      screen.getByRole("heading", { level: 1, name: "Tasks" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Status for Plan kickoff")).toHaveValue(
      "TODO",
    );
    expect(
      screen.getByLabelText("Assignee for Plan kickoff"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create task" }),
    ).toBeInTheDocument();
  });
  it("keeps an unfinished task draft when moving between screens", async () => {
    await open("tasks");
    fireEvent.change(screen.getByLabelText(/title \(required/i), {
      target: { name: "title", value: "Unfinished idea" },
    });
    await navigate("profile");
    expect(
      screen.getByRole("heading", { level: 1, name: "Your profile" }),
    ).toBeInTheDocument();
    await navigate("tasks");
    expect(screen.getByLabelText(/title \(required/i)).toHaveValue(
      "Unfinished idea",
    );
  });
  it("retains the project form draft across navigation", async () => {
    await open("projects");
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "My new project" },
    });
    await navigate("tasks");
    await navigate("projects");
    expect(screen.getByLabelText("Project name")).toHaveValue("My new project");
  });
  it("updates the task project selector after creating a project", async () => {
    const created = { ...project, id: "project-new", name: "New project" };
    api.createProject.mockResolvedValue({ project: created });
    await open("projects");
    api.projects.mockResolvedValue({ projects: [project, created] });
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: created.name },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    });
    await navigate("tasks");
    expect(
      within(screen.getByLabelText("Project")).getByRole("option", {
        name: created.name,
      }),
    ).toBeInTheDocument();
    expect(api.createProject).toHaveBeenCalledWith("test-token", created.name);
  });
  it("preserves invitation acceptance and updates project selection", async () => {
    const invited = {
      ...project,
      id: "invited-1",
      name: "Invited project",
      ownerId: "another-owner",
    };
    api.invitations.mockResolvedValue({
      invitations: [
        { id: "invite-1", project: invited, invitedBy: { name: "Teammate" } },
      ],
    });
    api.respondToInvitation.mockResolvedValue({
      invitation: { project: invited },
    });
    await open("projects");
    api.projects.mockResolvedValue({ projects: [project, invited] });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    });
    expect(api.respondToInvitation).toHaveBeenCalledWith(
      "test-token",
      "invite-1",
      "accept",
    );
    await navigate("tasks");
    expect(
      within(screen.getByLabelText("Project")).getByRole("option", {
        name: "Invited project",
      }),
    ).toBeInTheDocument();
  });
  it("preserves Owner invitation sending", async () => {
    api.inviteMember.mockResolvedValue({
      invitation: { invitedEmail: "teammate@example.test" },
    });
    await open("projects");
    fireEvent.change(screen.getByLabelText("Invite by email"), {
      target: { value: "teammate@example.test" },
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Invite", exact: true }),
      );
    });
    expect(api.inviteMember).toHaveBeenCalledWith(
      "test-token",
      project.id,
      "teammate@example.test",
    );
    expect(
      screen.getByText("Invitation sent to teammate@example.test."),
    ).toBeInTheDocument();
  });
  it("preserves invitation declining", async () => {
    api.invitations.mockResolvedValue({
      invitations: [
        { id: "decline-1", project, invitedBy: { name: "Teammate" } },
      ],
    });
    api.respondToInvitation.mockResolvedValue({ invitation: { project } });
    await open("projects");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    });
    expect(api.respondToInvitation).toHaveBeenCalledWith(
      "test-token",
      "decline-1",
      "decline",
    );
    expect(
      screen.getByText(`You declined the invitation to ${project.name}.`),
    ).toBeInTheDocument();
  });
  it("preserves optional password changes through the existing profile endpoint", async () => {
    api.updateMe.mockResolvedValue({ user });
    await open("profile");
    fireEvent.change(screen.getByLabelText("New password (optional)"), {
      target: { value: "NewPassword123!" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    });
    expect(api.updateMe).toHaveBeenCalledWith("test-token", {
      name: user.name,
      password: "NewPassword123!",
    });
    expect(screen.getByLabelText("New password (optional)")).toHaveValue("");
  });
  it("uses one notification state for the bell and Notifications screen", async () => {
    await open();
    expect(
      screen.getByRole("button", { name: "Notifications: 1 unread" }),
    ).toBeInTheDocument();
    await navigate("notifications");
    expect(screen.getByText(notification.body)).toBeVisible();
    expect(api.listNotifications).toHaveBeenCalledTimes(1);
    api.markNotificationRead.mockResolvedValue({});
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark as read" }));
    });
    expect(
      screen.getByRole("button", { name: "Notifications: 0 unread" }),
    ).toBeInTheDocument();
    await navigate("home");
    fireEvent.click(
      screen.getByRole("button", { name: "Notifications: 0 unread" }),
    );
    expect(screen.getByText(notification.body)).toBeVisible();
    expect(api.markNotificationRead).toHaveBeenCalledWith(
      "test-token",
      notification.id,
    );
  });
  it("keeps profile saving and system-role information", async () => {
    api.updateMe.mockResolvedValue({
      user: { ...user, name: "Updated Avery" },
    });
    await open("profile");
    expect(screen.getByText(/system role: MEMBER/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Updated Avery" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    });
    expect(api.updateMe).toHaveBeenCalledWith("test-token", {
      name: "Updated Avery",
    });
    expect(screen.getByText("Profile updated.")).toBeInTheDocument();
  });
  it("still calls logout and clears the local session", async () => {
    await open("profile");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    });
    expect(api.logout).toHaveBeenCalledWith("test-token");
    expect(localStorage.getItem("taskflow.token")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Log in to TaskFlow" }),
    ).toBeInTheDocument();
  });
  it("preserves login through the same API", async () => {
    api.login.mockResolvedValue({ token: "new-token", user });
    await open("home", false);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: user.email },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "TestPassword123!" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    });
    expect(api.login).toHaveBeenCalledWith(user.email, "TestPassword123!");
    expect(
      screen.getByRole("navigation", { name: "Main navigation" }),
    ).toBeInTheDocument();
  });
  it("preserves registration and redirects into the same workspace", async () => {
    api.register.mockResolvedValue({ token: "new-token", user });
    await open("home", false);
    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: user.name },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: user.email },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "TestPassword123!" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Register" }));
    });
    expect(api.register).toHaveBeenCalledWith(
      user.name,
      user.email,
      "TestPassword123!",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Overview" }),
    ).toBeInTheDocument();
  });
  it("sends an expired stored session back to login", async () => {
    api.me.mockRejectedValue(new ApiError(401, "UNAUTHENTICATED", "Expired"));
    await open("tasks");
    expect(
      await screen.findByText("Your session has expired. Please log in again."),
    ).toBeInTheDocument();
    expect(localStorage.getItem("taskflow.token")).toBeNull();
  });
  it("falls back safely for unknown screen links", async () => {
    await open("not-a-screen");
    expect(
      screen.getByRole("heading", { level: 1, name: "Overview" }),
    ).toBeInTheDocument();
  });
});

describe("Light and dark appearance", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete document.documentElement.dataset.theme;
  });
  it("keeps the original light appearance when no preference is saved", async () => {
    await open("home", false);
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    ).toBeVisible();
  });
  it("switches both ways and saves the choice separately from authentication", async () => {
    await open();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Switch to dark mode" }),
      );
    });
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem("taskflow.theme")).toBe("dark");
    expect(localStorage.getItem("taskflow.token")).toBe("test-token");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Switch to light mode" }),
      );
    });
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem("taskflow.theme")).toBe("light");
  });
  it("restores dark mode after remounting the app", async () => {
    await open();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Switch to dark mode" }),
      );
    });
    cleanup();
    await open();
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(
      screen.getByRole("button", { name: "Switch to light mode" }),
    ).toBeVisible();
  });
  it("retains dark mode across navigation without losing a task draft or fetching again", async () => {
    await open("tasks");
    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: "Keep my draft" },
    });
    const calls = api.projectTasks.mock.calls.length;
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Switch to dark mode" }),
      );
    });
    await navigate("projects");
    await navigate("tasks");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(screen.getByLabelText(/title/i)).toHaveValue("Keep my draft");
    expect(api.projectTasks).toHaveBeenCalledTimes(calls);
    expect(api.createTask).not.toHaveBeenCalled();
  });
  it("uses the saved theme on both login and registration", async () => {
    localStorage.setItem("taskflow.theme", "dark");
    await open("home", false);
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Register", exact: true }),
      );
    });
    expect(
      screen.getByRole("button", { name: "Switch to light mode" }),
    ).toBeVisible();
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });
  it("synchronizes another window's theme selection and storage clearing", async () => {
    await open();
    localStorage.setItem("taskflow.theme", "dark");
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "taskflow.theme",
          newValue: "dark",
        }),
      );
    });
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    localStorage.removeItem("taskflow.theme");
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });
  it("ignores invalid saved theme values", async () => {
    localStorage.setItem("taskflow.theme", "invalid");
    await open();
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });
  it("still switches if saving appearance is blocked", async () => {
    await open("home", false);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Switch to dark mode" }),
      );
    });
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });
  it("falls back to light when reading the preference is blocked", async () => {
    const getItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (key) {
      if (key === "taskflow.theme") throw new Error("Theme storage blocked");
      return getItem.call(this, key);
    });
    await open("home", false);
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });
});
