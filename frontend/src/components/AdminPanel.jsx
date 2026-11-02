import { useEffect, useState } from "react";
import { featureRequest, queryString } from "../lib/sprint2-api.js";
const events = [
  "LOGIN_FAILED",
  "ROLE_CHANGED",
  "ACCOUNT_DEACTIVATED",
  "ACCOUNT_REACTIVATED",
  "TASK_DELETED",
  "PROJECT_ARCHIVED",
  "PROJECT_ROLE_CHANGED",
  "PROJECT_MEMBER_REMOVED",
];
export default function AdminPanel({ token, userId, onSessionExpired }) {
  const [users, setUsers] = useState([]),
    [entries, setEntries] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [filters, setFilters] = useState({ event: "", from: "", to: "" });
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      featureRequest("/admin/users", token),
      featureRequest("/admin/audit" + queryString(filters), token),
    ])
      .then(([a, b]) => {
        if (!cancelled) {
          setUsers(a.users);
          setEntries(b.entries);
          setError("");
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
          setUsers([]);
          setEntries([]);
          if (e.status === 401) onSessionExpired();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, revision, filters, onSessionExpired]);
  async function update(user, body) {
    if (
      body.active === false &&
      !window.confirm(
        `Deactivate ${user.name}? Their sessions will be invalidated.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await featureRequest(`/admin/users/${user.id}`, token, {
        method: "PATCH",
        body,
      });
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e.message);
      if (e.status === 401) onSessionExpired();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="feature-stack">
      {error && <p role="alert">{error}</p>}
      <section className="feature-card">
        <h2>User management</h2>
        <p className="meta">
          System roles do not grant project ownership. Historical data is
          preserved.
        </p>
        <div className="feature-table-wrap">
          <table className="feature-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>System role</th>
                <th>Account</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      aria-label={`System role for ${u.name}`}
                      value={u.role}
                      disabled={busy || u.id === userId}
                      onChange={(e) => update(u, { role: e.target.value })}
                    >
                      {["MEMBER", "OWNER", "ADMIN"].map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      disabled={busy || u.id === userId}
                      onClick={() => update(u, { active: !u.active })}
                    >
                      {u.active ? "Deactivate" : "Reactivate"} {u.name}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="feature-card">
        <h2>Security audit</h2>
        <p className="meta">
          Newest first, maximum 1,000 entries. Failed-login actor:
          unauthenticated.
        </p>
        <div className="feature-controls">
          <label>
            Event
            <select
              value={filters.event}
              onChange={(e) =>
                setFilters({ ...filters, event: e.target.value })
              }
            >
              <option value="">All events</option>
              {events.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          {["from", "to"].map((k) => (
            <label key={k}>
              {k === "from" ? "From date" : "To date"}
              <input
                type="date"
                value={filters[k]}
                onChange={(e) =>
                  setFilters({ ...filters, [k]: e.target.value })
                }
              />
            </label>
          ))}
        </div>
        <ol className="feature-history">
          {entries.map((v) => (
            <li key={v.id}>
              <strong>{v.event}</strong>
              <span>Actor: {v.actorId || "Unauthenticated"}</span>
              <span>Target: {v.targetId || "—"}</span>
              <time>{new Date(v.createdAt).toLocaleString()}</time>
            </li>
          ))}
        </ol>
        {!entries.length && <p>No audit events in this range.</p>}
      </section>
    </div>
  );
}
