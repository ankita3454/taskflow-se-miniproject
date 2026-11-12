// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import DashboardPanel, { TodayPanel } from "./DashboardPanel.jsx";
import { api } from "../lib/api.js";
import { featureRequest } from "../lib/sprint2-api.js";
vi.mock("../lib/api.js", () => ({ api: { projects: vi.fn() } }));
vi.mock("../lib/sprint2-api.js", () => ({ featureRequest: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  api.projects.mockResolvedValue({
    projects: [{ id: "p", ownerId: "owner", name: "Project" }],
  });
  featureRequest.mockResolvedValue({
    project: { id: "p", ownerId: "owner" },
    completion: 50,
    overdue: 1,
    total: 4,
    done: 2,
    workload: [{ userId: "member", name: "Member", open: 2 }],
    burndown: null,
  });
});
afterEach(cleanup);
it("shows real metrics and explicit sprint setup, with export restricted to owner", async () => {
  render(
    <DashboardPanel token="t" userId="member" onSessionExpired={vi.fn()} />,
  );
  expect(await screen.findByText("50%")).toBeInTheDocument();
  expect(screen.getByText("2 / 4")).toBeInTheDocument();
  expect(screen.getByText("2 open tasks")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /export/i }),
  ).not.toBeInTheDocument();
});
it("clears dashboard values when access is denied", async () => {
  featureRequest.mockRejectedValue(
    Object.assign(new Error("Access revoked"), { status: 403 }),
  );
  render(
    <DashboardPanel token="t" userId="owner" onSessionExpired={vi.fn()} />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Access revoked");
  expect(document.querySelector("[data-dashboard-ready]")).toBeNull();
});
it("renders personal Today tasks and empty state", async () => {
  featureRequest.mockResolvedValue({
    tasks: [
      {
        id: "t",
        title: "Due work",
        status: "IN_REVIEW",
        dueDate: null,
        project: { name: "Project" },
      },
    ],
  });
  render(<TodayPanel token="t" onSessionExpired={vi.fn()} />);
  expect(await screen.findByText("Due work")).toBeInTheDocument();
  expect(screen.getByText(/No due date/)).toBeInTheDocument();
});

it("renders an empty dashboard when the user has no projects", async () => {
  api.projects.mockResolvedValue({ projects: [] });
  render(<DashboardPanel token="t" userId="member" onSessionExpired={vi.fn()} />);
  expect(await screen.findByText("No projects available.")).toBeInTheDocument();
  expect(featureRequest).not.toHaveBeenCalled();
});

it("lets an Owner configure sprint dates and export the project CSV", async () => {
  const createObjectURL = vi.fn(() => "blob:test");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL,
    revokeObjectURL,
  });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(<DashboardPanel token="t" userId="owner" onSessionExpired={vi.fn()} />);

  await screen.findByText("50%");
  fireEvent.change(screen.getByLabelText("Sprint start (UTC)"), {
    target: { value: "2026-01-01" },
  });
  fireEvent.change(screen.getByLabelText("Sprint end (UTC)"), {
    target: { value: "2026-01-14" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save sprint dates" }));
  await waitFor(() => {
    expect(featureRequest).toHaveBeenCalledWith("/projects/p/sprint", "t", {
      method: "PUT",
      body: { start: "2026-01-01", end: "2026-01-14" },
    });
  });

  fireEvent.click(screen.getByRole("button", { name: "Export project tasks as CSV" }));
  await waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce());
  expect(click).toHaveBeenCalledOnce();
  expect(featureRequest).toHaveBeenCalledWith("/projects/p/tasks.csv", "t", {
    csv: true,
  });
  vi.unstubAllGlobals();
});

it("shows errors for project loading and expires an unauthorized session", async () => {
  const expired = vi.fn();
  api.projects.mockRejectedValue(
    Object.assign(new Error("Session expired"), { status: 401 }),
  );
  render(<DashboardPanel token="t" userId="owner" onSessionExpired={expired} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Session expired");
  expect(expired).toHaveBeenCalledOnce();
});

it("handles sprint setup failures and expires the session on 401", async () => {
  const expired = vi.fn();
  render(<DashboardPanel token="t" userId="owner" onSessionExpired={expired} />);
  await screen.findByText("50%");
  featureRequest.mockRejectedValueOnce(
    Object.assign(new Error("Session expired"), { status: 401 }),
  );
  fireEvent.change(screen.getByLabelText("Sprint start (UTC)"), {
    target: { value: "2026-01-01" },
  });
  fireEvent.change(screen.getByLabelText("Sprint end (UTC)"), {
    target: { value: "2026-01-14" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save sprint dates" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Session expired");
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
});

it("renders the burndown chart and future points as Future", async () => {
  featureRequest.mockResolvedValue({
    project: { id: "p", ownerId: "owner" },
    completion: 50,
    overdue: 0,
    total: 2,
    done: 1,
    workload: [],
    burndown: {
      start: "2026-01-01",
      end: "2026-01-02",
      current: false,
      scopeCount: 2,
      days: [
        { date: "2026-01-01", plannedRemaining: 2, actualRemaining: 1 },
        { date: "2026-01-02", plannedRemaining: 0, actualRemaining: null },
      ],
    },
  });
  render(<DashboardPanel token="t" userId="owner" onSessionExpired={vi.fn()} />);
  expect(await screen.findByText(/Configured sprint is not currently active/)).toBeInTheDocument();
  fireEvent.click(screen.getByText("Burndown values"));
  expect(screen.getByText("Future")).toBeInTheDocument();
});

it("shows the Today empty state and expires a session error", async () => {
  featureRequest.mockResolvedValueOnce({ tasks: [] });
  const expired = vi.fn();
  const view = render(<TodayPanel token="t" onSessionExpired={expired} />);
  expect(await screen.findByText("No tasks need your attention today.")).toBeInTheDocument();
  view.unmount();

  featureRequest.mockRejectedValueOnce(
    Object.assign(new Error("Expired"), { status: 401 }),
  );
  render(<TodayPanel token="t" onSessionExpired={expired} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Expired");
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
});

it("clears dashboard data when the selected project is no longer available", async () => {
  const expired = vi.fn();
  render(<DashboardPanel token="t" userId="owner" onSessionExpired={expired} />);
  await screen.findByText("50%");
  featureRequest.mockRejectedValueOnce(
    Object.assign(new Error("Project removed"), { status: 404 }),
  );
  fireEvent.change(screen.getByLabelText("Sprint start (UTC)"), {
    target: { value: "2026-01-01" },
  });
  fireEvent.change(screen.getByLabelText("Sprint end (UTC)"), {
    target: { value: "2026-01-14" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save sprint dates" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Project removed");
  expect(expired).not.toHaveBeenCalled();
});

it("shows a recoverable non-auth error for the personal Today view", async () => {
  featureRequest.mockRejectedValueOnce(new Error("Offline"));
  render(<TodayPanel token="t" onSessionExpired={vi.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
  expect(screen.getByText("No tasks need your attention today.")).toBeInTheDocument();
});
