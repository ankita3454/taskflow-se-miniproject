import { createPortal } from "react-dom";
import WorkspaceIcon from "./WorkspaceIcon.jsx";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";

export default function NotificationBell({
  token,
  onSessionExpired,
  panelTarget = null,
}) {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function closePopover() {
      setIsOpen(false);
    }
    window.addEventListener("hashchange", closePopover);
    return () => window.removeEventListener("hashchange", closePopover);
  }, []);

  const mutationVersion = useRef(0);
  const mutationPending = useRef(false);

  const unreadCount = notifications.filter(
    (notification) => !notification.isRead,
  ).length;

  // Refresh during the current session without reloading the page.
  useEffect(() => {
    let cancelled = false;
    let timeoutId;

    async function poll() {
      let sessionExpired = false;

      try {
        if (mutationPending.current) return;
        const version = mutationVersion.current;
        const data = await api.listNotifications(token);

        if (
          !cancelled &&
          !mutationPending.current &&
          version === mutationVersion.current
        ) {
          setNotifications(data.notifications);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          if (err.status === 401) {
            sessionExpired = true;
            onSessionExpired();
          } else {
            setError("Could not refresh notifications. Retrying shortly.");
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);

          if (!sessionExpired) {
            timeoutId = window.setTimeout(poll, 5000);
          }
        }
      }
    }

    void poll();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [token, onSessionExpired]);

  async function handleMarkRead(notificationId) {
    mutationVersion.current += 1;
    mutationPending.current = true;
    setBusy(true);
    setError("");

    try {
      await api.markNotificationRead(token, notificationId);

      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId
            ? { ...notification, isRead: true }
            : notification,
        ),
      );
    } catch (err) {
      if (err.status === 401) {
        onSessionExpired();
      } else {
        setError("Could not mark the notification as read. Please retry.");
      }
    } finally {
      mutationPending.current = false;
      setBusy(false);
    }
  }

  async function handleMarkAllRead() {
    mutationVersion.current += 1;
    mutationPending.current = true;
    setBusy(true);
    setError("");

    try {
      await api.markAllNotificationsRead(token);

      // Fetch the current server state after the update.
      const data = await api.listNotifications(token);
      setNotifications(data.notifications);
    } catch (err) {
      if (err.status === 401) {
        onSessionExpired();
      } else {
        setError("Could not refresh read status. Please retry.");
      }
    } finally {
      mutationPending.current = false;
      setBusy(false);
    }
  }

  const panel = (
    <div id="notification-panel" className="notification-panel">
      <div className="notification-heading">
        <div>
          <h2>Notifications</h2>
          <p role="status" aria-live="polite">
            {loading ? "Loading notifications..." : `${unreadCount} unread`}
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={loading || busy || unreadCount === 0}
          onClick={handleMarkAllRead}
        >
          Mark all as read
        </button>
      </div>
      {!loading && notifications.length === 0 && (
        <div className="notification-empty">
          <WorkspaceIcon name="notifications" size={38} />
          <h3>You're all caught up.</h3>
          <p>No notifications yet.</p>
          <small>Assignments and task updates will appear here.</small>
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <ul className="notification-list">
        {notifications.map((notification) => (
          <li
            key={notification.id}
            className={notification.isRead ? "is-read" : "is-unread"}
          >
            <span className="notification-type-icon">
              <WorkspaceIcon name="tasks" />
            </span>
            <div className="notification-copy">
              <p>
                {!notification.isRead && (
                  <strong className="sr-only">Unread: </strong>
                )}
                {notification.body}
              </p>
              <time dateTime={notification.createdAt}>
                {new Date(notification.createdAt).toLocaleString()}
              </time>
            </div>
            {!notification.isRead && (
              <button
                type="button"
                className="read-button"
                disabled={busy}
                onClick={() => handleMarkRead(notification.id)}
              >
                Mark as read
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <section aria-label="Notifications" className="notification-bell">
      <button
        type="button"
        className="bell-trigger"
        aria-expanded={Boolean(panelTarget) || isOpen}
        aria-controls="notification-panel"
        aria-label={`Notifications: ${unreadCount} unread`}
        onClick={() => setIsOpen((current) => !current)}
      >
        <WorkspaceIcon name="notifications" />
        {unreadCount > 0 && <span className="bell-count">{unreadCount}</span>}
      </button>
      {panelTarget
        ? createPortal(panel, panelTarget)
        : isOpen && (
            <div className="notification-popover">
              {panel}
              <a
                className="notification-all-link"
                href="#/notifications"
                onClick={() => setIsOpen(false)}
              >
                View all notifications <WorkspaceIcon name="arrow" size={16} />
              </a>
            </div>
          )}
      {error && !panelTarget && !isOpen && (
        <p role="alert" className="bell-error">
          {error}
        </p>
      )}
    </section>
  );
}
