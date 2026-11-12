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
import TaskConversation from "./TaskConversation.jsx";
import ProjectManagement from "./ProjectManagement.jsx";
import { api } from "../lib/api.js";
import { featureRequest } from "../lib/sprint2-api.js";
vi.mock("../lib/api.js", () => ({
  api: { projects: vi.fn(), projectMembers: vi.fn() },
}));
vi.mock("../lib/sprint2-api.js", () => ({ featureRequest: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  api.projects.mockResolvedValue({
    projects: [{ id: "p", name: "Project", ownerId: "owner" }],
  });
  api.projectMembers.mockResolvedValue({
    members: [
      { user: { id: "member", name: "Member", email: "member@example.test" } },
    ],
  });
  featureRequest.mockResolvedValue({ comments: [], activities: [] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("posts literal comment text and offers no edit/delete comment controls", async () => {
  featureRequest.mockResolvedValue({
    comments: [
      {
        id: "c",
        authorName: "Member",
        body: "<img src=x onerror=alert(1)>",
        createdAt: "2026-01-01Z",
      },
    ],
    activities: [],
  });
  render(<TaskConversation taskId="t1" token="token" />);
  expect(
    await screen.findByText("<img src=x onerror=alert(1)>"),
  ).toBeInTheDocument();
  expect(document.querySelector("img")).toBeNull();
  fireEvent.change(screen.getByLabelText("New comment"), {
    target: { value: "Hello @member@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
  await waitFor(() =>
    expect(featureRequest).toHaveBeenCalledWith("/tasks/t1/comments", "token", {
      method: "POST",
      body: { body: "Hello @member@example.test" },
    }),
  );
  expect(
    screen.queryByRole("button", { name: /delete comment/i }),
  ).not.toBeInTheDocument();
});
it("requires confirmation before archive or membership removal", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  render(
    <ProjectManagement
      token="t"
      userId="owner"
      onSessionExpired={vi.fn()}
      onProjectsChanged={vi.fn()}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Remove Member" }));
  fireEvent.click(screen.getByRole("button", { name: "Archive project" }));
  expect(window.confirm).toHaveBeenCalledTimes(2);
  expect(featureRequest).not.toHaveBeenCalled();
});
it("hides owner-only project controls from members", async () => {
  render(
    <ProjectManagement
      token="t"
      userId="member"
      onSessionExpired={vi.fn()}
      onProjectsChanged={vi.fn()}
    />,
  );
  await screen.findByText("member@example.test");
  expect(
    screen.queryByRole("button", { name: "Archive project" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Remove Member" }),
  ).not.toBeInTheDocument();
});

it("transfers ownership and removes a member after confirmation", async () => {
  const changed = vi.fn();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(
    <ProjectManagement
      token="t"
      userId="owner"
      onSessionExpired={vi.fn()}
      onProjectsChanged={changed}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Transfer ownership to Member" }));
  await waitFor(() => expect(featureRequest).toHaveBeenCalledWith(
    "/projects/p/members/member",
    "t",
    { method: "PATCH", body: { projectRole: "Owner" } },
  ));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());

  fireEvent.click(screen.getByRole("button", { name: "Remove Member" }));
  await waitFor(() => expect(featureRequest).toHaveBeenCalledWith(
    "/projects/p/members/member",
    "t",
    { method: "DELETE", body: undefined },
  ));
  expect(changed).toHaveBeenCalledTimes(2);
});

it("archives a project after confirmation and reports action failures", async () => {
  const changed = vi.fn();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(
    <ProjectManagement
      token="t"
      userId="owner"
      onSessionExpired={vi.fn()}
      onProjectsChanged={changed}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Archive project" }));
  await waitFor(() => expect(featureRequest).toHaveBeenCalledWith(
    "/projects/p/archive",
    "t",
    { method: "POST", body: undefined },
  ));
  expect(changed).toHaveBeenCalledOnce();

  featureRequest.mockRejectedValueOnce(new Error("Cannot archive"));
  fireEvent.click(screen.getByRole("button", { name: "Archive project" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Cannot archive");
});

it("expires the session when a project action receives 401", async () => {
  const expired = vi.fn();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  featureRequest.mockRejectedValueOnce(
    Object.assign(new Error("Expired"), { status: 401 }),
  );
  render(
    <ProjectManagement
      token="t"
      userId="owner"
      onSessionExpired={expired}
      onProjectsChanged={vi.fn()}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Archive project" }));
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
  expect(await screen.findByRole("alert")).toHaveTextContent("Expired");
});

it("shows a project member loading failure", async () => {
  api.projectMembers.mockRejectedValueOnce(new Error("Members unavailable"));
  render(
    <ProjectManagement
      token="t"
      userId="owner"
      onSessionExpired={vi.fn()}
      onProjectsChanged={vi.fn()}
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Members unavailable");
});

it("shows archived project state and omits the archive action", async () => {
  api.projects.mockResolvedValue({
    projects: [{ id: "p", name: "Archived", ownerId: "owner", archived: true }],
  });
  render(
    <ProjectManagement
      token="t"
      userId="owner"
      onSessionExpired={vi.fn()}
      onProjectsChanged={vi.fn()}
    />,
  );
  expect(await screen.findByText("This project is archived. Existing data remains available.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Archive project" })).not.toBeInTheDocument();
});

it("expires the session when project loading returns 401", async () => {
  const expired = vi.fn();
  api.projects.mockRejectedValueOnce(
    Object.assign(new Error("Expired"), { status: 401 }),
  );
  render(
    <ProjectManagement
      token="t"
      userId="owner"
      onSessionExpired={expired}
      onProjectsChanged={vi.fn()}
    />,
  );
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
});

it("handles comment history and posting failures", async () => {
  featureRequest.mockRejectedValueOnce(
    Object.assign(new Error("Access denied"), { status: 403 }),
  );
  render(<TaskConversation taskId="t1" token="token" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Access denied");
  expect(screen.queryByText("Private comment")).not.toBeInTheDocument();

  featureRequest.mockResolvedValueOnce({ comments: [], activities: [] });
  featureRequest.mockRejectedValueOnce(new Error("Comment failed"));
  cleanup();
  render(<TaskConversation taskId="t1" token="token" />);
  await screen.findByText("Activity history");
  const post = screen.getByRole("button", { name: "Post comment" });
  expect(post).toBeDisabled();
  fireEvent.change(screen.getByLabelText("New comment"), {
    target: { value: "A comment" },
  });
  fireEvent.click(post);
  expect(await screen.findByRole("alert")).toHaveTextContent("Comment failed");
});

it("clears comment history when history loading returns 401", async () => {
  featureRequest.mockRejectedValueOnce(
    Object.assign(new Error("Expired"), { status: 401 }),
  );
  render(<TaskConversation taskId="t1" token="token" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Expired");
  expect(screen.queryByText("Private comment")).not.toBeInTheDocument();
});

it("renders activity history and clears a comment after a successful post", async () => {
  featureRequest
    .mockResolvedValueOnce({
      comments: [],
      activities: [{
        id: "a1",
        actorName: "Owner",
        field: "status",
        oldValue: "TODO",
        newValue: "DONE",
        createdAt: "2026-01-01T00:00:00Z",
      }],
    })
    .mockResolvedValueOnce({ comments: [], activities: [] })
    .mockResolvedValueOnce({ comments: [], activities: [] });
  render(<TaskConversation taskId="t1" token="token" />);
  expect(await screen.findByText("Owner")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("New comment"), {
    target: { value: "All done" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
  await waitFor(() => expect(featureRequest).toHaveBeenCalledWith(
    "/tasks/t1/comments",
    "token",
    { method: "POST", body: { body: "All done" } },
  ));
  await waitFor(() => expect(screen.getByLabelText("New comment")).toHaveValue(""));
});
