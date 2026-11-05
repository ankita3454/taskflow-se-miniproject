import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { featureRequest } from "../lib/sprint2-api.js";
export function TodayPanel({ token, onSessionExpired }) {
  const [tasks, setTasks] = useState([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true,
      sequence = 0;
    async function load() {
      const n = ++sequence;
      try {
        const r = await featureRequest("/dashboard/today", token);
        if (active && n === sequence) {
          setTasks(r.tasks);
          setError("");
          setLoading(false);
        }
      } catch (e) {
        if (active && n === sequence) {
          setError(e.message);
          setLoading(false);
          if (e.status === 401) {
            setTasks([]);
            onSessionExpired();
          }
        }
      }
    }
    load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token, onSessionExpired]);
  return (
    <section className="feature-card">
      <h2>Your Today view</h2>
      <p className="meta">
        Your assigned, unfinished tasks: overdue, due today (UTC), or In Review.
      </p>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">Loading your tasks…</p>
      ) : !tasks.length ? (
        <p>No tasks need your attention today.</p>
      ) : (
        <ul className="feature-task-list">
          {tasks.map((t) => (
            <li className="feature-task" key={t.id}>
              <strong>{t.title}</strong>
              <p>{t.project.name}</p>
              <p>
                {t.status.replaceAll("_", " ")} · Due:{" "}
                {t.dueDate?.slice(0, 10) || "No due date"}
              </p>
              <a href="#/explorer">Open task browser</a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
export default function DashboardPanel({
  token,
  userId,
  onSessionExpired,
  projectRevision = 0,
}) {
  const [projects, setProjects] = useState([]),
    [id, setId] = useState(""),
    [snapshot, setData] = useState(null),
    [error, setError] = useState(""),
    [dates, setDates] = useState({ start: "", end: "" }),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const fail = useCallback(
    (e) => {
      setError(e.message);
      if (e.status === 401) onSessionExpired();
      if (e.status === 401 || e.status === 403 || e.status === 404)
        setData(null);
    },
    [onSessionExpired],
  );
  useEffect(() => {
    let active = true;
    api
      .projects(token)
      .then((r) => {
        if (active) {
          setProjects(r.projects);
          setId((v) =>
            r.projects.some((p) => p.id === v) ? v : r.projects[0]?.id || "",
          );
        }
      })
      .catch((e) => {
        if (active) fail(e);
      });
    return () => {
      active = false;
    };
  }, [token, projectRevision, fail]);
  useEffect(() => {
    let active = true,
      sequence = 0;
    async function load() {
      if (!id) return;
      const n = ++sequence;
      try {
        const r = await featureRequest(`/projects/${id}/dashboard`, token);
        if (active && n === sequence) {
          setData(r);
          setError("");
        }
      } catch (e) {
        if (active && n === sequence) fail(e);
      }
    }
    load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, token, revision, fail]);
  async function configure(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await featureRequest(`/projects/${id}/sprint`, token, {
        method: "PUT",
        body: dates,
      });
      setRevision((v) => v + 1);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function csv() {
    setBusy(true);
    try {
      const text = await featureRequest(`/projects/${id}/tasks.csv`, token, {
        csv: true,
      });
      const url = URL.createObjectURL(
          new Blob(["\uFEFF", text], { type: "text/csv;charset=utf-8" }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = "taskflow-tasks.csv";
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const data = snapshot?.project.id === id ? snapshot : null;
  const owner = data?.project.ownerId === userId;
  return (
    <div className="feature-stack">
      <section className="feature-card">
        <label>
          Dashboard project
          <select value={id} onChange={(e) => setId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {error && <p role="alert">{error}</p>}
        {!id ? (
          <p>No projects available.</p>
        ) : !data ? (
          <p role="status">Loading dashboard…</p>
        ) : (
          <div data-dashboard-ready="true">
            <div className="feature-metrics">
              <article>
                <span>Completion</span>
                <strong>{data.completion}%</strong>
              </article>
              <article>
                <span>Overdue</span>
                <strong>{data.overdue}</strong>
              </article>
              <article>
                <span>Done / total</span>
                <strong>
                  {data.done} / {data.total}
                </strong>
              </article>
            </div>
            <h3>Open-task workload</h3>
            <ul className="feature-history">
              {data.workload.map((m) => (
                <li key={m.userId}>
                  <strong>{m.name}</strong>
                  <span>{m.open} open tasks</span>
                </li>
              ))}
            </ul>
            <h3>Sprint burndown</h3>
            {data.burndown ? (
              <Burndown data={data.burndown} />
            ) : (
              <p>
                No sprint dates configured. The Owner can set explicit product
                sprint dates below.
              </p>
            )}
            {owner && (
              <>
                <form className="feature-controls" onSubmit={configure}>
                  {["start", "end"].map((k) => (
                    <label key={k}>
                      Sprint {k} (UTC)
                      <input
                        type="date"
                        required
                        value={dates[k]}
                        onChange={(e) =>
                          setDates({ ...dates, [k]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                  <button disabled={busy}>Save sprint dates</button>
                </form>
                <button disabled={busy} onClick={csv}>
                  Export project tasks as CSV
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
function Burndown({ data }) {
  const max = Math.max(data.scopeCount, 1),
    points = (key) =>
      data.days
        .map((d, i) =>
          d[key] === null
            ? null
            : `${35 + (i / Math.max(1, data.days.length - 1)) * 730},${230 - (d[key] / max) * 195}`,
        )
        .filter(Boolean)
        .join(" ");
  return (
    <div>
      <p>
        {data.start} – {data.end} ·{" "}
        {data.current
          ? "Current sprint"
          : "Configured sprint is not currently active"}{" "}
        · {data.scopeCount} tasks due in this range
      </p>
      <svg
        className="feature-chart"
        viewBox="0 0 800 270"
        role="img"
        aria-label="Sprint burndown: planned remaining by due date and actual remaining reconstructed from activity history"
      >
        <path d="M35 25V230H775" fill="none" stroke="currentColor" />
        <polyline
          points={points("plannedRemaining")}
          fill="none"
          stroke="#c79c43"
          strokeWidth="3"
          strokeDasharray="6 5"
        />
        <polyline
          points={points("actualRemaining")}
          fill="none"
          stroke="#68a6c4"
          strokeWidth="3"
        />
        <text x="35" y="255" fill="currentColor">
          {data.start}
        </text>
        <text x="665" y="255" fill="currentColor">
          {data.end}
        </text>
      </svg>
      <p className="meta">
        Gold: planned remaining by due date. Blue: actual remaining from
        recorded status events; future actual points are not invented. Scope
        recalculates from existing tasks due within the configured range.
      </p>
      <details>
        <summary>Burndown values</summary>
        <div className="feature-table-wrap">
          <table className="feature-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Planned remaining</th>
                <th>Actual remaining</th>
              </tr>
            </thead>
            <tbody>
              {data.days.map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td>{d.plannedRemaining}</td>
                  <td>{d.actualRemaining ?? "Future"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
