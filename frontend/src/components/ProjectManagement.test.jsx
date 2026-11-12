// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ProjectManagement from "./ProjectManagement.jsx";
import { api } from "../lib/api.js";
import { featureRequest } from "../lib/sprint2-api.js";

vi.mock("../lib/api.js", () => ({
  api: { projects: vi.fn(), projectMembers: vi.fn() },
}));
vi.mock("../lib/sprint2-api.js", () => ({
  featureRequest: vi.fn(),
}));

const project = { id: "p1", name: "Project One", ownerId: "owner", archived: false };
const owner = { id: "owner", name: "Owner", email: "owner@example.test" };
const member = { id: "member", name: "Member", email: "member@example.test" };
const renderPanel = (props = {}) =>
  render(
    <ProjectManagement
      token="token"
      userId="owner"
      onProjectsChanged={vi.fn()}
      onSessionExpired={vi.fn()}
      {...props}
    />,
  );

beforeEach(() => {
  vi.resetAllMocks();
  api.projects.mockResolvedValue({ projects: [project] });
  api.projectMembers.mockResolvedValue({ members: [{ user: owner }, { user: member }] });
  featureRequest.mockResolvedValue({});
});
afterEach(cleanup);

it("shows project owners and permits member changes and archive cancellation", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  renderPanel();
  expect(await screen.findByText("member@example.test")).toBeInTheDocument();
  expect(screen.getByText("Owner", { selector: "span" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Archive project" }));
  expect(window.confirm).toHaveBeenCalledOnce();
  expect(featureRequest).not.toHaveBeenCalled();
});

it("archives a project after confirmation and refreshes the parent", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const changed = vi.fn();
  renderPanel({ onProjectsChanged: changed });
  fireEvent.click(await screen.findByRole("button", { name: "Archive project" }));
  await waitFor(() => expect(featureRequest).toHaveBeenCalledWith(
    "/projects/p1/archive",
    "token",
    { method: "POST", body: undefined },
  ));
  expect(changed).toHaveBeenCalledOnce();
});

it("hides owner controls for members and handles archived projects", async () => {
  api.projects.mockResolvedValue({
    projects: [{ ...project, archived: true }],
  });
  renderPanel({ userId: "member" });
  expect(await screen.findByText("This project is archived. Existing data remains available.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Archive project" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Remove Member" })).not.toBeInTheDocument();
});

it("surfaces API errors and expires an unauthorized archive request", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const expired = vi.fn();
  featureRequest.mockRejectedValue(
    Object.assign(new Error("Expired"), { status: 401 }),
  );
  renderPanel({ onSessionExpired: expired });
  fireEvent.click(await screen.findByRole("button", { name: "Archive project" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Expired");
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
});

it("shows the empty state when no projects exist", async () => {
  api.projects.mockResolvedValue({ projects: [] });
  renderPanel();
  expect(await screen.findByRole("combobox", { name: "Manage project" })).toBeEmptyDOMElement();
  expect(screen.queryByRole("button", { name: "Archive project" })).not.toBeInTheDocument();
  expect(api.projectMembers).not.toHaveBeenCalled();
});
