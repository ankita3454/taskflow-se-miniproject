import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

const emptyFields = {
  title: "",
  description: "",
  priority: "MEDIUM",
  dueDate: "",
  timeEstimate: "",
};

export default function TaskWorkspace({ token, userId, onSessionExpired }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [fields, setFields] = useState(emptyFields);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assigningTaskId, setAssigningTaskId] = useState(null);

  const selectedProject = projects.find((project) => project.id === projectId);

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      setLoadingProjects(true);
      setError("");

      try {
        const result = await api.projects(token);
        if (cancelled) return;

        setProjects(result.projects);
        setProjectId((current) => {
          if (result.projects.some((project) => project.id === current)) {
            return current;
          }

          const activeProject = result.projects.find(
            (project) => !project.archived,
          );

          return (activeProject || result.projects[0])?.id || "";
        });
      } catch (err) {
        if (cancelled) return;

        if (err.status === 401) {
          onSessionExpired();
        } else {
          setError(err.message);
        }
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    }

    loadProjects();

    return () => {
      cancelled = true;
    };
  }, [token, onSessionExpired]);

  useEffect(() => {
    let cancelled = false;

    async function loadTasks() {
      if (!projectId) {
        setTasks([]);
        return;
      }

      setLoadingTasks(true);
      setError("");

      try {
        const result = await api.projectTasks(projectId, token);
        if (!cancelled) setTasks(result.tasks);
      } catch (err) {
        if (cancelled) return;

        if (err.status === 401) {
          onSessionExpired();
        } else {
          setError(err.message);
          setTasks([]);
        }
      } finally {
        if (!cancelled) setLoadingTasks(false);
      }
    }

    loadTasks();

    return () => {
      cancelled = true;
    };
  }, [projectId, token, onSessionExpired]);

  useEffect(() => {
    let cancelled = false;

    async function loadMembers() {
      if (!projectId) {
        setMembers([]);
        return;
      }

      setLoadingMembers(true);
      try {
        const result = await api.projectMembers(projectId, token);
        if (!cancelled) setMembers(result.members);
      } catch (err) {
        if (cancelled) return;
        if (err.status === 401) {
          onSessionExpired();
        } else {
          setError(err.message);
          setMembers([]);
        }
      } finally {
        if (!cancelled) setLoadingMembers(false);
      }
    }

    loadMembers();

    return () => {
      cancelled = true;
    };
  }, [projectId, token, onSessionExpired]);

  function updateField(event) {
    const { name, value } = event.target;

    setFields((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: "" }));
    setError("");
    setNotice("");
  }

  async function handleAssigneeChange(task, assigneeId) {
    if (!assigneeId || assigneeId === task.assigneeId) return;
    setError("");
    setNotice("");
    setAssigningTaskId(task.id);

    try {
      const result = await api.assignTask(task.id, assigneeId, token);
      setTasks((current) =>
        current.map((item) => item.id === task.id ? result.task : item),
      );
      setNotice(`Assigned "${task.title}" to ${result.task.assignee.name}.`);
    } catch (err) {
      if (err.status === 401) {
        onSessionExpired();
      } else {
        setError(err.message);
      }
    } finally {
      setAssigningTaskId(null);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setFieldErrors({});

    if (!projectId) {
      setError("Select a project before creating a task.");
      return;
    }

    const payload = {
      projectId,
      title: fields.title,
      description: fields.description,
      priority: fields.priority,
      dueDate: fields.dueDate || null,
      timeEstimate:
        fields.timeEstimate === "" ? null : Number(fields.timeEstimate),
    };

    setSaving(true);

    try {
      const result = await api.createTask(payload, token);

      setTasks((current) => [result.task, ...current]);
      setFields(emptyFields);
      setNotice("Task created successfully.");
    } catch (err) {
      if (err.status === 401) {
        onSessionExpired();
      } else {
        setError(err.message);
        setFieldErrors(err.fields || {});
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="task-workspace">
      <h2>Project Tasks</h2>

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-status" role="status">{notice}</p>}

      <label htmlFor="task-project">Project</label>
      {loadingProjects ? (
        <p role="status">Loading projects...</p>
      ) : projects.length === 0 ? (
        <p>
          You don't have any projects yet. Create a project first, or ask a
          project owner to add you as a member.
        </p>
      ) : (
        <select
          id="task-project"
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            setNotice("");
            setError("");
          }}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}{project.archived ? " (Archived)" : ""}
            </option>
          ))}
        </select>
      )}

      {selectedProject?.archived && (
        <p role="status">This project is archived; new tasks cannot be created.</p>
      )}

      <h3>Create a task</h3>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <label htmlFor="task-title">Title (required, max 200 characters)</label>
        <input
          id="task-title"
          name="title"
          value={fields.title}
          onChange={updateField}
          maxLength={201}
          required
          aria-invalid={Boolean(fieldErrors.title)}
          aria-describedby={fieldErrors.title ? "task-title-error" : undefined}
        />
        {fieldErrors.title && (
          <p id="task-title-error" className="form-error">
            {fieldErrors.title}
          </p>
        )}

        <label htmlFor="task-description">Description (max 2000 characters)</label>
        <textarea
          id="task-description"
          name="description"
          value={fields.description}
          onChange={updateField}
          maxLength={2001}
          rows={3}
          aria-invalid={Boolean(fieldErrors.description)}
        />
        {fieldErrors.description && (
          <p className="form-error">{fieldErrors.description}</p>
        )}

        <label htmlFor="task-priority">Priority</label>
        <select
          id="task-priority"
          name="priority"
          value={fields.priority}
          onChange={updateField}
          required
        >
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>
        {fieldErrors.priority && (
          <p className="form-error">{fieldErrors.priority}</p>
        )}

        <label htmlFor="task-due-date">Due date (optional)</label>
        <input
          id="task-due-date"
          name="dueDate"
          type="date"
          value={fields.dueDate}
          onChange={updateField}
        />
        {fieldErrors.dueDate && (
          <p className="form-error">{fieldErrors.dueDate}</p>
        )}

        <label htmlFor="task-time-estimate">Time estimate in hours (optional)</label>
        <input
          id="task-time-estimate"
          name="timeEstimate"
          type="number"
          min="0"
          step="0.5"
          value={fields.timeEstimate}
          onChange={updateField}
          aria-invalid={Boolean(fieldErrors.timeEstimate)}
        />
        {fieldErrors.timeEstimate && (
          <p className="form-error">{fieldErrors.timeEstimate}</p>
        )}

        <button
          type="submit"
          disabled={
            saving ||
            loadingProjects ||
            !selectedProject ||
            selectedProject.archived
          }
        >
          {saving ? "Creating..." : "Create task"}
        </button>
      </form>

      <h3>Task list</h3>

      {loadingTasks ? (
        <p role="status">Loading tasks...</p>
      ) : tasks.length === 0 ? (
        <p>No tasks in this project yet.</p>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => (
            <li key={task.id}>
              <strong>{task.title}</strong>
              <span> — {task.status.replaceAll("_", " ")}</span>
              <p>Priority: {task.priority}</p>
              {task.description && <p>{task.description}</p>}
              {task.dueDate && (
                <p>Due: {String(task.dueDate).slice(0, 10)}</p>
              )}
              {task.timeEstimate != null && (
                <p>Estimate: {task.timeEstimate} hours</p>
              )}
              <p>
                Assignee: {task.assignee?.name || "Unassigned"}
              </p>
              {selectedProject?.ownerId === userId && (
                <label className="task-assignee-control">
                  Assign to
                  <select
                    aria-label={`Assignee for ${task.title}`}
                    value={task.assigneeId || ""}
                    onChange={(event) =>
                      handleAssigneeChange(task, event.target.value)
                    }
                    disabled={loadingMembers || assigningTaskId === task.id}
                  >
                    <option value="">Select a project member</option>
                    {members.map(({ user: member }) => (
                      <option key={member.id} value={member.id}>
                        {member.name} ({member.email})
                      </option>
                    ))}
                  </select>
                  {assigningTaskId === task.id && (
                    <span role="status">Saving assignment...</span>
                  )}
                </label>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
