// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import NotificationBell from './NotificationBell.jsx';
import { api } from '../lib/api.js';
vi.mock('../lib/api.js', () => ({ api: { listNotifications: vi.fn(), markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn() } }));
const item = (id = 'one', isRead = false) => ({ id, isRead, body: `Task ${id}`, createdAt: '2026-10-30T10:00:00Z' });
const expired = Object.assign(new Error('Expired'), { status: 401 });
const tick = async () => { await act(async () => { await Promise.resolve(); }); };
async function mount(onSessionExpired = vi.fn()) {
  const view = render(<NotificationBell token="token" onSessionExpired={onSessionExpired} />);
  await tick(); return view;
}
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); api.listNotifications.mockResolvedValue({ notifications: [] }); api.markNotificationRead.mockResolvedValue({ success: true }); api.markAllNotificationsRead.mockResolvedValue({ updatedCount: 2 }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('shows unread count and notification list', async () => {
  api.listNotifications.mockResolvedValue({ notifications: [item(), item('two', true)] }); await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Notifications: 1 unread' }));
  expect(screen.getByText('Task one')).toBeInTheDocument(); expect(screen.getByText('Task two')).toBeInTheDocument();
});
it('polls every five seconds and displays a new notification without refresh', async () => {
  api.listNotifications.mockResolvedValueOnce({ notifications: [] }).mockResolvedValue({ notifications: [item()] }); await mount();
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.getByRole('button', { name: 'Notifications: 1 unread' })).toBeInTheDocument();
});
it('marks one read and preserves the server state on remount', async () => {
  let read = false;
  api.listNotifications.mockImplementation(async () => ({ notifications: [item('one', read)] }));
  api.markNotificationRead.mockImplementation(async () => { read = true; return { success: true }; });
  const view = await mount(); fireEvent.click(screen.getByRole('button', { name: 'Notifications: 1 unread' }));
  fireEvent.click(screen.getByRole('button', { name: 'Mark as read' })); await tick();
  expect(api.markNotificationRead).toHaveBeenCalledWith('token', 'one');
  expect(screen.getByRole('button', { name: 'Notifications: 0 unread' })).toBeInTheDocument();
  view.unmount(); await mount(); expect(screen.getByRole('button', { name: 'Notifications: 0 unread' })).toBeInTheDocument();
});
it('marks all read and refreshes the server count', async () => {
  api.listNotifications.mockResolvedValueOnce({ notifications: [item(), item('two')] }).mockResolvedValue({ notifications: [item('one', true), item('two', true)] });
  await mount(); fireEvent.click(screen.getByRole('button', { name: 'Notifications: 2 unread' }));
  fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' })); await tick();
  expect(api.markAllNotificationsRead).toHaveBeenCalledWith('token');
  expect(screen.getByRole('button', { name: 'Notifications: 0 unread' })).toBeInTheDocument();
});
it('shows refresh errors and recovers on the next poll', async () => {
  api.listNotifications.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({ notifications: [item()] }); await mount();
  expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh');
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Notifications: 1 unread' })).toBeInTheDocument();
});
it('preserves unread state when marking read fails', async () => {
  api.listNotifications.mockResolvedValue({ notifications: [item()] }); api.markNotificationRead.mockRejectedValue(new Error('Offline'));
  await mount(); fireEvent.click(screen.getByRole('button', { name: 'Notifications: 1 unread' })); fireEvent.click(screen.getByRole('button', { name: 'Mark as read' })); await tick();
  expect(screen.getByRole('alert')).toHaveTextContent('Could not mark'); expect(screen.getByRole('button', { name: 'Notifications: 1 unread' })).toBeInTheDocument();
});
it('expires the session and stops polling on a refresh 401', async () => {
  const callback = vi.fn(); api.listNotifications.mockRejectedValue(expired); await mount(callback);
  expect(callback).toHaveBeenCalledOnce(); await act(async () => { await vi.advanceTimersByTimeAsync(10000); }); expect(api.listNotifications).toHaveBeenCalledTimes(1);
});
it('expires the session when a read request receives 401', async () => {
  const callback = vi.fn(); api.listNotifications.mockResolvedValue({ notifications: [item()] }); api.markNotificationRead.mockRejectedValue(expired);
  await mount(callback); fireEvent.click(screen.getByRole('button', { name: 'Notifications: 1 unread' })); fireEvent.click(screen.getByRole('button', { name: 'Mark as read' })); await tick(); expect(callback).toHaveBeenCalledOnce();
});
it('ignores a stale poll response arriving after marking a notification read', async () => {
  let resolvePoll;
  api.listNotifications.mockResolvedValueOnce({ notifications: [item()] }).mockImplementationOnce(() => new Promise(resolve => { resolvePoll = resolve; }));
  await mount(); fireEvent.click(screen.getByRole('button', { name: 'Notifications: 1 unread' }));
  await act(async () => { vi.advanceTimersByTime(5000); });
  fireEvent.click(screen.getByRole('button', { name: 'Mark as read' })); await tick();
  await act(async () => { resolvePoll({ notifications: [item()] }); });
  expect(screen.getByRole('button', { name: 'Notifications: 0 unread' })).toBeInTheDocument();
});
it('stops polling after unmount', async () => {
  const view = await mount(); view.unmount(); await act(async () => { await vi.advanceTimersByTimeAsync(10000); }); expect(api.listNotifications).toHaveBeenCalledTimes(1);
});
