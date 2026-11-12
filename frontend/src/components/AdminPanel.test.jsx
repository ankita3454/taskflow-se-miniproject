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
import AdminPanel from "./AdminPanel.jsx";
import { featureRequest } from "../lib/sprint2-api.js";
vi.mock("../lib/sprint2-api.js", () => ({
  featureRequest: vi.fn(),
  queryString: () => "",
}));
beforeEach(() => {
  vi.resetAllMocks();
  featureRequest.mockImplementation(async (path) =>
    path === "/admin/users"
      ? {
          users: [
            {
              id: "admin",
              name: "Admin",
              email: "admin@example.test",
              role: "ADMIN",
              active: true,
            },
            {
              id: "member",
              name: "Member",
              email: "member@example.test",
              role: "MEMBER",
              active: true,
            },
          ],
        }
      : { entries: [] },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("prevents self-lockout and cancels deactivation without a request", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<AdminPanel token="t" userId="admin" onSessionExpired={vi.fn()} />);
  expect(await screen.findByLabelText("System role for Admin")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Deactivate Member" }));
  expect(window.confirm).toHaveBeenCalledOnce();
  expect(
    featureRequest.mock.calls.some(([, , o]) => o?.method === "PATCH"),
  ).toBe(false);
});
it("sends role updates and expires an invalid session", async () => {
  render(<AdminPanel token="t" userId="admin" onSessionExpired={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText("System role for Member"), {
    target: { value: "OWNER" },
  });
  await waitFor(() =>
    expect(featureRequest).toHaveBeenCalledWith("/admin/users/member", "t", {
      method: "PATCH",
      body: { role: "OWNER" },
    }),
  );
});
it("clears protected data when the session expires", async () => {
  const expired = vi.fn();
  featureRequest.mockRejectedValue(
    Object.assign(new Error("Expired"), { status: 401 }),
  );
  render(<AdminPanel token="t" userId="admin" onSessionExpired={expired} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Expired");
  expect(expired).toHaveBeenCalledOnce();
  expect(screen.queryByText("member@example.test")).not.toBeInTheDocument();
});

it("reactivates an inactive account without asking for confirmation", async () => {
  featureRequest.mockImplementation(async (path) =>
    path === "/admin/users"
      ? {
          users: [{
            id: "inactive",
            name: "Inactive",
            email: "inactive@example.test",
            role: "MEMBER",
            active: false,
          }],
        }
      : { entries: [] },
  );
  render(<AdminPanel token="t" userId="admin" onSessionExpired={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Reactivate Inactive" }));
  await waitFor(() => expect(featureRequest).toHaveBeenCalledWith(
    "/admin/users/inactive",
    "t",
    { method: "PATCH", body: { active: true } },
  ));
});

it("reports non-401 load failures without expiring the session", async () => {
  const expired = vi.fn();
  featureRequest.mockRejectedValue(new Error("Audit unavailable"));
  render(<AdminPanel token="t" userId="admin" onSessionExpired={expired} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Audit unavailable");
  expect(expired).not.toHaveBeenCalled();
  expect(screen.queryByText("member@example.test")).not.toBeInTheDocument();
});

it("applies event and date filters to the audit request", async () => {
  render(<AdminPanel token="t" userId="admin" onSessionExpired={vi.fn()} />);
  await screen.findByText("Security audit");
  fireEvent.change(screen.getByLabelText("Event"), {
    target: { value: "LOGIN_FAILED" },
  });
  fireEvent.change(screen.getByLabelText("From date"), {
    target: { value: "2026-01-01" },
  });
  fireEvent.change(screen.getByLabelText("To date"), {
    target: { value: "2026-01-31" },
  });
  await waitFor(() => expect(
    featureRequest.mock.calls.filter(([path]) => path === "/admin/audit").length,
  ).toBeGreaterThan(1));
});

it("expires the session when a user update request returns 401", async () => {
  const expired = vi.fn();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  featureRequest.mockImplementation(async (path, _token, options) => {
    if (options?.method === "PATCH") {
      throw Object.assign(new Error("Expired"), { status: 401 });
    }
    return path === "/admin/users"
      ? {
          users: [{
            id: "member",
            name: "Member",
            email: "member@example.test",
            role: "MEMBER",
            active: true,
          }],
        }
      : { entries: [] };
  });
  render(<AdminPanel token="t" userId="admin" onSessionExpired={expired} />);
  fireEvent.click(await screen.findByRole("button", { name: "Deactivate Member" }));
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
});

it("renders authenticated and unauthenticated audit actors and targets", async () => {
  featureRequest.mockImplementation(async (path) =>
    path === "/admin/users"
      ? { users: [] }
      : {
          entries: [
            {
              id: "anonymous",
              event: "LOGIN_FAILED",
              actorId: null,
              targetId: null,
              createdAt: "2026-01-01T00:00:00Z",
            },
            {
              id: "identified",
              event: "ROLE_CHANGED",
              actorId: "admin-id",
              targetId: "member-id",
              createdAt: "2026-01-02T00:00:00Z",
            },
          ],
        },
  );
  render(<AdminPanel token="t" userId="admin" onSessionExpired={vi.fn()} />);
  expect(await screen.findByText("Actor: Unauthenticated")).toBeInTheDocument();
  expect(screen.getByText("Target: —")).toBeInTheDocument();
  expect(screen.getByText("Actor: admin-id")).toBeInTheDocument();
  expect(screen.getByText("Target: member-id")).toBeInTheDocument();
});

it("reports non-authenticated user update failures without ending the session", async () => {
  const expired = vi.fn();
  featureRequest.mockImplementation(async (path, _token, options) => {
    if (options?.method === "PATCH") throw new Error("Update unavailable");
    return path === "/admin/users"
      ? {
          users: [{
            id: "member",
            name: "Member",
            email: "member@example.test",
            role: "MEMBER",
            active: true,
          }],
        }
      : { entries: [] };
  });
  render(<AdminPanel token="t" userId="admin" onSessionExpired={expired} />);
  fireEvent.change(await screen.findByLabelText("System role for Member"), {
    target: { value: "OWNER" },
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Update unavailable",
  );
  expect(expired).not.toHaveBeenCalled();
});
