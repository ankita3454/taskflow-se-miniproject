import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { featureRequest, queryString } from "../lib/sprint2-api.js";
const statuses = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"];
const defaults = {
  q: "",
  status: "",
  priority: "",
  assignee: "",
  tag: "",
  from: "",
  to: "",
  sort: "createdAt",
  direction: "desc",
};
function initial(userId) {
  try {
    return (
      JSON.parse(sessionStorage.getItem(`taskflow.explorer.${userId}`)) || {}
    );
  } catch {
    return {};
  }
}
export default function TaskExplorer({
  token,
  userId,
  onSessionExpired,
  projectRevision = 0,
}) {
  const [saved] = useState(() => initial(userId));
  const [projects, setProjects] = useState([]),
    [projectId, setProjectId] = useState(saved.projectId || ""),
    [filters, setFilters] = useState({ ...defaults, ...saved.filters }),
    [view, setView] = useState(saved.view === "kanban" ? "kanban" : "list"),
    [allTasks, setTasks] = useState([]),
    [tags, setTags] = useState([]),
    [members, setMembers] = useState([]),
    [selected, setSelected] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const sync = useRef({ version: 0, pending: false });
  const tasks = allTasks.filter((task) => task.projectId === projectId);
  const project = projects.find((p) => p.id === projectId),
    owner = project?.ownerId === userId;
  const fail = useCallback(
    (e) => {
      setError(e.message);
      if (e.status === 401) onSessionExpired();
      if (e.status === 403 || e.status === 404) {
        setTasks([]);
        setSelected(null);
      }
    },
    [onSessionExpired],
  );
  useEffect(() => {
    let active = true;
    api
      .projects(token)
      .then(({ projects: p }) => {
        if (active) {
          setProjects(p);
          setProjectId((id) =>
            p.some((x) => x.id === id) ? id : p[0]?.id || "",
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
    try {
      sessionStorage.setItem(
        `taskflow.explorer.${userId}`,
        JSON.stringify({ projectId, filters, view }),
      );
    } catch {
      /* Session storage can be unavailable. */
    }
  }, [projectId, filters, view, userId]);
  const load = useCallback(async () => {
    if (!projectId || sync.current.pending) return;
    const version = ++sync.current.version;
    try {
      const result = await featureRequest(
        `/projects/${projectId}/task-query` + queryString(filters),
        token,
      );
      if (sync.current.version === version && !sync.current.pending) {
        setTasks(result.tasks);
        setError("");
      }
    } catch (e) {
      if (sync.current.version === version) fail(e);
    }
  }, [projectId, filters, token, fail]);
  useEffect(() => {
    sync.current.version++;
    if (!projectId) return;
    let active = true;
    Promise.all([
      featureRequest(`/projects/${projectId}/tags`, token),
      api.projectMembers(projectId, token),
    ])
      .then(([a, b]) => {
        if (active) {
          setTags(a.tags);
          setMembers(b.members);
        }
      })
      .catch((e) => {
        if (active) fail(e);
      });
    return () => {
      active = false;
    };
  }, [projectId, token, fail]);
  useEffect(() => {
    const currentSync = sync.current;
    const start = setTimeout(load, 200),
      timer = setInterval(load, 5000);
    return () => {
      clearTimeout(start);
      clearInterval(timer);
      currentSync.version++;
    };
  }, [load]);
  async function mutate(path, options) {
    sync.current.pending = true;
    sync.current.version++;
    setBusy(true);
    setError("");
    try {
      const result = await featureRequest(path, token, options);
      return result;
    } catch (e) {
      fail(e);
      throw e;
    } finally {
      sync.current.pending = false;
      setBusy(false);
      await load();
    }
  }
  async function remove(task) {
    if (
      !window.confirm(
        `Permanently delete "${task.title}" and its comments/history? This cannot be undone.`,
      )
    )
      return;
    try {
      await mutate(`/tasks/${task.id}`, { method: "DELETE" });
      setSelected(null);
    } catch {
      /* Displayed above. */
    }
  }
  function card(task) {
    return (
      <article className="feature-task" key={task.id}>
        <strong>{task.title}</strong>
        <p>{task.description}</p>
        <p className="meta">
          {task.status.replaceAll("_", " ")} · {task.priority} ·{" "}
          {task.assignee?.name || "Unassigned"}
        </p>
        <p className="meta">
          Due: {task.dueDate?.slice(0, 10) || "No due date"}
        </p>
        <div className="feature-tags">
          {task.taskTags.map(({ tag }) => (
            <span key={tag.id}>{tag.name}</span>
          ))}
        </div>
        <button
          className="secondary-button"
          onClick={() => setSelected(task.id)}
        >
          Details: {task.title}
        </button>
      </article>
    );
  }
  const selectedTask = tasks.find((t) => t.id === selected);
  return (
    <div className="feature-stack">
      {error && <p role="alert">{error}</p>}
      <section className="feature-card">
        <h2>Find and organise tasks</h2>
        <p className="meta">
          Create tasks from the Tasks screen. All filters combine; dates are
          UTC.
        </p>
        <label>
          Browse project
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.archived ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="feature-controls">
          <label>
            Search title or description
            <input
              value={filters.q}
              maxLength={200}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            />
          </label>
          {[
            ["status", "Status", statuses],
            ["priority", "Priority", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]],
          ].map(([key, label, values]) => (
            <label key={key}>
              {label}
              <select
                value={filters[key]}
                onChange={(e) =>
                  setFilters({ ...filters, [key]: e.target.value })
                }
              >
                <option value="">All</option>
                {values.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          ))}
          <label>
            Assignee filter
            <select
              value={filters.assignee}
              onChange={(e) =>
                setFilters({ ...filters, assignee: e.target.value })
              }
            >
              <option value="">All</option>
              <option value="unassigned">Unassigned</option>
              {members.map(({ user }) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tag filter
            <select
              value={filters.tag}
              onChange={(e) => setFilters({ ...filters, tag: e.target.value })}
            >
              <option value="">All tags</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          {["from", "to"].map((k) => (
            <label key={k}>
              {k === "from" ? "Due from" : "Due through"}
              <input
                type="date"
                value={filters[k]}
                onChange={(e) =>
                  setFilters({ ...filters, [k]: e.target.value })
                }
              />
            </label>
          ))}
          <label>
            Sort tasks
            <select
              value={filters.sort}
              onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
            >
              {[
                ["createdAt", "Created"],
                ["dueDate", "Due date"],
                ["priority", "Priority"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Direction
            <select
              value={filters.direction}
              onChange={(e) =>
                setFilters({ ...filters, direction: e.target.value })
              }
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
        </div>
        <div className="feature-controls">
          <button
            className="secondary-button"
            onClick={() => setFilters({ ...defaults })}
          >
            Clear filters
          </button>
          <button
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            List view
          </button>
          <button
            aria-pressed={view === "kanban"}
            onClick={() => setView("kanban")}
          >
            Kanban view
          </button>
        </div>
        <p role="status">{tasks.length} matching tasks</p>
        {view === "kanban" ? (
          <div className="feature-kanban">
            {statuses.map((status) => (
              <section key={status}>
                <h3>{status.replaceAll("_", " ")}</h3>
                {tasks.filter((t) => t.status === status).map(card)}
              </section>
            ))}
          </div>
        ) : (
          <div className="feature-task-list">{tasks.map(card)}</div>
        )}
      </section>
      {selectedTask && (
        <TaskDetails
          key={selectedTask.id}
          task={selectedTask}
          tasks={tasks}
          tags={tags}
          setTags={setTags}
          owner={owner}
          userId={userId}
          busy={busy}
          mutate={mutate}
          onDelete={() => remove(selectedTask)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
function TaskDetails({
  task,
  tasks,
  tags,
  setTags,
  owner,
  userId,
  busy,
  mutate,
  onDelete,
  onClose,
}) {
  const [error, setError] = useState(""),
    [tagName, setTagName] = useState(""),
    [blocker, setBlocker] = useState("");
  const [fields, setFields] = useState({
    title: task.title,
    description: task.description || "",
    priority: task.priority,
    dueDate: task.dueDate?.slice(0, 10) || "",
    timeEstimate: task.timeEstimate ?? "",
  });
  async function run(fn) {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    }
  }
  async function addTag(e) {
    e.preventDefault();
    await run(async () => {
      const { tag } = await mutate(`/projects/${task.projectId}/tags`, {
        method: "POST",
        body: { name: tagName },
      });
      await mutate(`/tasks/${task.id}/tags/${tag.id}`, { method: "PUT" });
      setTags((old) =>
        old.some((t) => t.id === tag.id) ? old : [...old, tag],
      );
      setTagName("");
    });
  }
  const transitions = {
    TODO: ["IN_PROGRESS"],
    IN_PROGRESS: ["IN_REVIEW", ...(!task.assigneeId ? ["TODO"] : [])],
    IN_REVIEW: ["IN_PROGRESS", "DONE"],
    DONE: [],
  };
  return (
    <section
      className="feature-card"
      aria-label={`Task details for ${task.title}`}
    >
      <div className="feature-controls">
        <h2>{task.title}</h2>
        <button className="secondary-button" onClick={onClose}>
          Close details
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {(owner || task.assigneeId === userId) && (
        <label>
          Change task status
          <select
            disabled={busy}
            value={task.status}
            onChange={(e) =>
              run(() =>
                mutate(`/tasks/${task.id}/status`, {
                  method: "PATCH",
                  body: { status: e.target.value },
                }),
              )
            }
          >
            <option>{task.status}</option>
            {transitions[task.status].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      )}
      <h3>Blocking dependencies</h3>
      {task.blockers.length ? (
        <ul>
          {task.blockers.map(({ blocker: b }) => (
            <li key={b.id}>
              {b.title} — {b.status}
            </li>
          ))}
        </ul>
      ) : (
        <p>No blockers.</p>
      )}
      <div className="feature-controls">
        <label>
          Blocked by
          <select value={blocker} onChange={(e) => setBlocker(e.target.value)}>
            <option value="">Choose another task</option>
            {tasks
              .filter((t) => t.id !== task.id)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
          </select>
        </label>
        <button
          disabled={busy || !blocker}
          onClick={() =>
            run(() =>
              mutate(`/tasks/${task.id}/dependencies`, {
                method: "POST",
                body: { blockerId: blocker },
              }),
            )
          }
        >
          Add dependency
        </button>
      </div>
      <h3>Tags</h3>
      <div className="feature-tags">
        {task.taskTags.map(({ tag }) => (
          <button
            key={tag.id}
            disabled={busy}
            onClick={() =>
              run(() =>
                mutate(`/tasks/${task.id}/tags/${tag.id}`, {
                  method: "DELETE",
                }),
              )
            }
          >
            Remove {tag.name}
          </button>
        ))}
      </div>
      <label>
        Apply project tag
        <select
          value=""
          disabled={busy}
          onChange={(e) =>
            run(() =>
              mutate(`/tasks/${task.id}/tags/${e.target.value}`, {
                method: "PUT",
              }),
            )
          }
        >
          <option value="">Choose tag</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <form onSubmit={addTag} className="feature-controls">
        <label>
          New tag
          <input
            required
            maxLength={80}
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
          />
        </label>
        <button disabled={busy}>Create and apply tag</button>
      </form>
      {owner && task.status !== "DONE" && (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(() =>
              mutate(`/tasks/${task.id}`, {
                method: "PATCH",
                body: {
                  ...fields,
                  dueDate: fields.dueDate || null,
                  timeEstimate:
                    fields.timeEstimate === ""
                      ? null
                      : Number(fields.timeEstimate),
                },
              }),
            );
          }}
        >
          <h3>Edit task details</h3>
          {["title", "description", "priority", "dueDate", "timeEstimate"].map(
            (k) => (
              <label key={k}>
                {k}
                <input
                  required={k === "title"}
                  type={
                    k === "dueDate"
                      ? "date"
                      : k === "timeEstimate"
                        ? "number"
                        : "text"
                  }
                  maxLength={
                    k === "title" ? 200 : k === "description" ? 2000 : undefined
                  }
                  min={k === "timeEstimate" ? 0 : undefined}
                  step={k === "timeEstimate" ? "any" : undefined}
                  value={fields[k]}
                  onChange={(e) =>
                    setFields({ ...fields, [k]: e.target.value })
                  }
                />
              </label>
            ),
          )}
          <button disabled={busy}>Save task details</button>
        </form>
      )}
      {owner && (
        <button disabled={busy} onClick={onDelete}>
          Delete task permanently
        </button>
      )}
    </section>
  );
}
