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
import ProfileView from "./ProfileView.jsx";
import { ApiError, api } from "../lib/api.js";

vi.mock("../lib/api.js", () => ({
  ApiError: class ApiError extends Error {
    constructor(status, code, message) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  api: { updateMe: vi.fn(), logout: vi.fn() },
}));

const user = {
  id: "user-1",
  name: "Avery Green",
  email: "avery@example.test",
  role: "MEMBER",
};

function renderProfile(overrides = {}) {
  return render(
    <ProfileView
      token="token"
      user={user}
      onUserUpdated={vi.fn()}
      onLogout={vi.fn()}
      onSessionExpired={vi.fn()}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.updateMe.mockResolvedValue({ user: { ...user, name: "Updated" } });
  api.logout.mockResolvedValue(null);
});
afterEach(cleanup);

describe("ProfileView", () => {
  it("saves a name without sending a blank optional password", async () => {
    const updated = vi.fn();
    renderProfile({ onUserUpdated: updated });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateMe).toHaveBeenCalledWith(
      "token",
      { name: "Updated" },
    ));
    expect(updated).toHaveBeenCalledWith({ ...user, name: "Updated" });
    expect(await screen.findByRole("status")).toHaveTextContent("Profile updated.");
  });

  it("includes a new password and clears it after saving", async () => {
    renderProfile();
    fireEvent.change(screen.getByLabelText("New password (optional)"), {
      target: { value: "new-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateMe).toHaveBeenCalledWith(
      "token",
      { name: user.name, password: "new-password" },
    ));
    expect(screen.getByLabelText("New password (optional)")).toHaveValue("");
  });

  it("expires the session on update 401 and shows API or generic errors", async () => {
    const expired = vi.fn();
    api.updateMe.mockRejectedValueOnce(new ApiError(401, "EXPIRED", "Expired"));
    renderProfile({ onSessionExpired: expired });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(expired).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    api.updateMe.mockRejectedValueOnce(new ApiError(400, "INVALID", "Invalid name"));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid name");

    api.updateMe.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Update failed.");
  });

  it("always logs out locally even when the API logout fails", async () => {
    const logout = vi.fn();
    api.logout.mockRejectedValue(new Error("offline"));
    renderProfile({ onLogout: logout });
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(api.logout).toHaveBeenCalledWith("token"));
    await waitFor(() => expect(logout).toHaveBeenCalledOnce());
  });
});
