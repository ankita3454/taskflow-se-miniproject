// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ProjectPanel from "./ProjectPanel.jsx";
import { ApiError, api } from "../lib/api.js";

vi.mock("../lib/api.js", () => ({
  ApiError: class ApiError extends Error {
    constructor(status, code, message) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  api: {
    projects: vi.fn(),
    invitations: vi.fn(),
    createProject: vi.fn(),
    inviteMember: vi.fn(),
    respondToInvitation: vi.fn(),
  },
}));

const project = { id: "p1", name: "Project One", ownerId: "owner", archived: false };
const invitation = {
  id: "i1",
  project,
  invitedBy: { name: "Teammate" },
};

function renderPanel(overrides = {}) {
  return render(
    <ProjectPanel
      token="token"
      userId="owner"
      onSessionExpired={vi.fn()}
      onProjectsChanged={vi.fn()}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.projects.mockResolvedValue({ projects: [project] });
  api.invitations.mockResolvedValue({ invitations: [invitation] });
});
afterEach(cleanup);

describe("ProjectPanel load paths", () => {
  it("shows empty project and invitation states", async () => {
    api.projects.mockResolvedValue({ projects: [] });
    api.invitations.mockResolvedValue({ invitations: [] });
    renderPanel();
    expect(await screen.findByText("You haven't created or joined a project yet.")).toBeInTheDocument();
    expect(screen.getByText("You have no pending invitations.")).toBeInTheDocument();
    expect(screen.getByText("0 projects")).toBeInTheDocument();
  });

  it("labels archived projects distinctly", async () => {
    api.projects.mockResolvedValue({
      projects: [{ ...project, archived: true }],
    });
    renderPanel();
    expect(await screen.findByText("Archived")).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  it("uses generic errors when projects or invitations fail to load", async () => {
    api.projects.mockRejectedValue(new Error("network"));
    api.invitations.mockRejectedValue(new Error("network"));
    renderPanel();
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((node) => node.textContent)).toEqual([
      "Could not load projects.",
      "Could not load invitations.",
    ]);
  });

  it("expires the session when either load request returns 401", async () => {
    const expired = vi.fn();
    api.projects.mockRejectedValue(new ApiError(401, "EXPIRED", "Expired"));
    api.invitations.mockRejectedValue(new ApiError(401, "EXPIRED", "Expired"));
    renderPanel({ onSessionExpired: expired });
    await waitFor(() => expect(expired).toHaveBeenCalledTimes(2));
  });

  it("shows API-provided load errors for projects and invitations", async () => {
    api.projects.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Projects hidden"));
    api.invitations.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Inbox hidden"));
    renderPanel();
    expect(await screen.findByText("Projects hidden")).toBeInTheDocument();
    expect(screen.getByText("Inbox hidden")).toBeInTheDocument();
  });

  it("ignores project and invitation results that arrive after unmount", async () => {
    let resolveProjects;
    let resolveInvitations;
    api.projects.mockImplementation(() => new Promise((resolve) => {
      resolveProjects = resolve;
    }));
    api.invitations.mockImplementation(() => new Promise((resolve) => {
      resolveInvitations = resolve;
    }));
    const view = renderPanel();
    view.unmount();
    await act(async () => {
      resolveProjects({ projects: [project] });
      resolveInvitations({ invitations: [invitation] });
    });
  });

  it("ignores project and invitation errors that arrive after unmount", async () => {
    let rejectProjects;
    let rejectInvitations;
    api.projects.mockImplementation(() => new Promise((_resolve, reject) => {
      rejectProjects = reject;
    }));
    api.invitations.mockImplementation(() => new Promise((_resolve, reject) => {
      rejectInvitations = reject;
    }));
    const view = renderPanel();
    view.unmount();
    await act(async () => {
      rejectProjects(new Error("Late project error"));
      rejectInvitations(new Error("Late inbox error"));
    });
  });
});

describe("ProjectPanel create and invite paths", () => {
  it("creates a project and notifies the parent", async () => {
    const changed = vi.fn();
    api.createProject.mockResolvedValue({
      project: { id: "p2", name: "New project", ownerId: "owner" },
    });
    renderPanel({ onProjectsChanged: changed });
    fireEvent.change(await screen.findByLabelText("Project name"), {
      target: { value: "New project" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect(await screen.findByText("New project")).toBeInTheDocument();
    expect(changed).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Project name")).toHaveValue("");
  });

  it("creates successfully when no optional change callback is supplied", async () => {
    api.createProject.mockResolvedValue({
      project: { id: "p2", name: "Standalone", ownerId: "owner" },
    });
    renderPanel({ onProjectsChanged: undefined });
    fireEvent.change(await screen.findByLabelText("Project name"), {
      target: { value: "Standalone" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect(await screen.findByText("Standalone")).toBeInTheDocument();
  });

  it("uses an empty email value when an invite form is submitted without input", async () => {
    renderPanel();
    const email = await screen.findByLabelText("Invite by email");
    fireEvent.submit(email.closest("form"));
    await waitFor(() => expect(api.inviteMember).toHaveBeenCalledWith(
      "token",
      "p1",
      "",
    ));
  });

  it("shows API and generic project creation errors and handles 401", async () => {
    const expired = vi.fn();
    renderPanel({ onSessionExpired: expired });
    const name = await screen.findByLabelText("Project name");
    api.createProject.mockRejectedValueOnce(new ApiError(400, "INVALID", "Invalid name"));
    fireEvent.change(name, { target: { value: "Bad name" } });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid name");

    api.createProject.mockRejectedValueOnce(new Error("network"));
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not create project."));

    api.createProject.mockRejectedValueOnce(new ApiError(401, "EXPIRED", "Expired"));
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    await waitFor(() => expect(expired).toHaveBeenCalledOnce());
  });

  it("shows invite success, API errors, generic errors, and handles expired sessions", async () => {
    const expired = vi.fn();
    api.inviteMember
      .mockResolvedValueOnce({ invitation: { invitedEmail: "new@example.test" } })
      .mockRejectedValueOnce(new ApiError(400, "INVALID", "Invalid email"))
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce(new ApiError(401, "EXPIRED", "Expired"));
    renderPanel({ onSessionExpired: expired });
    await screen.findByLabelText("Invite by email");
    const email = screen.getByLabelText("Invite by email");
    const submit = () => fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    fireEvent.change(email, { target: { value: "new@example.test" } });
    submit();
    expect(await screen.findByText("Invitation sent to new@example.test.")).toBeInTheDocument();

    fireEvent.change(email, { target: { value: "bad@example.test" } });
    submit();
    expect(await screen.findByText("Invalid email")).toBeInTheDocument();

    submit();
    expect(await screen.findByText("Could not send invitation.")).toBeInTheDocument();

    submit();
    await waitFor(() => expect(expired).toHaveBeenCalledOnce());
  });
});

describe("ProjectPanel invitation responses", () => {
  it("declines an invitation and updates the inbox message", async () => {
    api.respondToInvitation.mockResolvedValue({
      invitation: { project },
    });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Decline" }));
    expect(await screen.findByText("You declined the invitation to Project One.")).toBeInTheDocument();
    await waitFor(() => expect(api.respondToInvitation).toHaveBeenCalledWith(
      "token",
      "i1",
      "decline",
    ));
    expect(screen.getByText("You have no pending invitations.")).toBeInTheDocument();
  });

  it("accepts an invitation, refreshes projects, and notifies the parent", async () => {
    const changed = vi.fn();
    api.respondToInvitation.mockResolvedValue({ invitation: { project } });
    api.projects
      .mockResolvedValueOnce({ projects: [project] })
      .mockResolvedValueOnce({ projects: [project, { ...project, id: "p2" }] });
    renderPanel({ onProjectsChanged: changed });
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
    expect(await screen.findByText("You joined Project One.")).toBeInTheDocument();
    await waitFor(() => expect(api.projects).toHaveBeenCalledTimes(2));
    expect(changed).toHaveBeenCalledOnce();
  });

  it("reports response errors and expires an unauthorized session", async () => {
    const expired = vi.fn();
    api.respondToInvitation
      .mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Not yours"))
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce(new ApiError(401, "EXPIRED", "Expired"));
    renderPanel({ onSessionExpired: expired });
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not yours");
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not respond to invitation."));
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(expired).toHaveBeenCalledOnce());
  });
});
