// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import TaskConversation from "./TaskConversation.jsx";
import { featureRequest } from "../lib/sprint2-api.js";

vi.mock("../lib/sprint2-api.js", () => ({
  featureRequest: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  featureRequest.mockResolvedValue({ comments: [], activities: [] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("shows a recoverable history error and still permits comments", async () => {
  featureRequest
    .mockRejectedValueOnce(new Error("History unavailable"))
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({
      comments: [{
        id: "c1",
        authorName: "Avery",
        body: "Ready",
        createdAt: "2026-01-01T00:00:00Z",
      }],
      activities: [],
    });
  render(<TaskConversation taskId="t1" token="token" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("History unavailable");
  fireEvent.change(screen.getByLabelText("New comment"), {
    target: { value: "Ready" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
  expect(await screen.findByText("Ready")).toBeInTheDocument();
  expect(featureRequest).toHaveBeenCalledWith("/tasks/t1/comments", "token", {
    method: "POST",
    body: { body: "Ready" },
  });
});

it("does not start another history load after unmount", async () => {
  vi.useFakeTimers();
  const view = render(<TaskConversation taskId="t1" token="token" />);
  await act(async () => { await Promise.resolve(); });
  view.unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(featureRequest).toHaveBeenCalledTimes(1);
});
