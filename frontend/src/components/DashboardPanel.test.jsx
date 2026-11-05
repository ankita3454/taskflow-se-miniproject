// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
