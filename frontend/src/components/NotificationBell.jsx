import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

export default function NotificationBell({ token, onSessionExpired }) {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
        const data = await api.listNotifications(token);

        if (!cancelled) {
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
      setBusy(false);
    }
  }

  async function handleMarkAllRead() {
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
      setBusy(false);
    }
  }

  return (
    <section aria-label="Notifications">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="notification-panel"
        aria-label={`Notifications: ${unreadCount} unread`}
        onClick={() => setIsOpen((current) => !current)}
      >
        🔔 Notifications ({unreadCount})
      </button>

      {error && <p role="alert">{error}</p>}

      {isOpen && (
        <div id="notification-panel">
          <h2>Notifications</h2>

          <p role="status" aria-live="polite">
            {loading ? "Loading notifications..." : `${unreadCount} unread`}
          </p>

          <button
            type="button"
            disabled={loading || busy || unreadCount === 0}
            onClick={handleMarkAllRead}
          >
            Mark all as read
          </button>

          {!loading && notifications.length === 0 && (
            <p>No notifications yet.</p>
          )}

          <ul>
            {notifications.map((notification) => (
              <li key={notification.id}>
                <p>
                  {!notification.isRead && <strong>Unread: </strong>}
                  {notification.body}
                </p>

                <time dateTime={notification.createdAt}>
                  {new Date(notification.createdAt).toLocaleString()}
                </time>

                {!notification.isRead && (
                  <button
                    type="button"
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
      )}
    </section>
  );
}