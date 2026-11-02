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
