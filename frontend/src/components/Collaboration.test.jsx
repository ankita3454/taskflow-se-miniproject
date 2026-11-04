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
