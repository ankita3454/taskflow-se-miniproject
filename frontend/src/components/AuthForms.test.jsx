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
import LoginForm from "./LoginForm.jsx";
import RegisterForm from "./RegisterForm.jsx";
import { ApiError, api } from "../lib/api.js";

vi.mock("../lib/api.js", () => ({
  ApiError: class ApiError extends Error {
    constructor(status, code, message) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  api: { login: vi.fn(), register: vi.fn() },
}));

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
});

describe("LoginForm", () => {
  it("submits credentials, forwards the result, and switches to registration", async () => {
    const user = { id: "user-1" };
    const loggedIn = vi.fn();
    const switchForm = vi.fn();
    api.login.mockResolvedValue({ token: "token", user });
    render(
      <LoginForm
        notice="Session expired"
        onLoggedIn={loggedIn}
        onSwitchToRegister={switchForm}
      />,
    );
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "a@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(api.login).toHaveBeenCalledWith(
      "a@example.test",
      "password",
    ));
    expect(loggedIn).toHaveBeenCalledWith("token", user);
    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    expect(switchForm).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("Session expired");
  });

  it("shows API and generic login errors", async () => {
    api.login.mockRejectedValueOnce(new ApiError(401, "INVALID", "Invalid credentials"));
    render(<LoginForm onLoggedIn={vi.fn()} onSwitchToRegister={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "a@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "bad" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid credentials");

    api.login.mockRejectedValueOnce(new Error("network"));
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Login failed."));
  });
});

describe("RegisterForm", () => {
  it("submits registration and switches to login", async () => {
    const user = { id: "user-2" };
    const registered = vi.fn();
    const switchForm = vi.fn();
    api.register.mockResolvedValue({ token: "token", user });
    render(<RegisterForm onRegistered={registered} onSwitchToLogin={switchForm} />);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "New User" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    await waitFor(() => expect(api.register).toHaveBeenCalledWith(
      "New User",
      "new@example.test",
      "password123",
    ));
    expect(registered).toHaveBeenCalledWith("token", user);
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(switchForm).toHaveBeenCalledOnce();
  });

  it("shows API and generic registration errors", async () => {
    api.register.mockRejectedValueOnce(
      new ApiError(409, "EMAIL_IN_USE", "Email already registered"),
    );
    render(<RegisterForm onRegistered={vi.fn()} onSwitchToLogin={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "New User" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email already registered");

    api.register.mockRejectedValueOnce(new Error("network"));
    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Registration failed."));
  });
});
