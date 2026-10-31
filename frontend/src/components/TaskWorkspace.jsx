
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";

const emptyFields = {
  title: "",
  description: "",
  priority: "MEDIUM",
  dueDate: "",
  timeEstimate: "",
};

const allowedTransitions = {
  TODO: ["IN_PROGRESS"],
  IN_PROGRESS: ["IN_REVIEW"],
  IN_REVIEW: ["IN_PROGRESS", "DONE"],
  DONE: [],
};

export default function TaskWorkspace({ token, userId, onSessionExpired }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [assigningTaskId, setAssigningTaskId] = useState(null);
  const [fields, setFields] = useState(emptyFields);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingTaskIds, setUpdatingTaskIds] = useState([]);

  // Retains the idempotency key for a submission that may need retrying.
  const pendingSubmission = useRef(null);

  const selectedProject = projects.find(
    (project) => project.id === projectId,
  );

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
        if (!cancelled) {
          setLoadingProjects(false);
        }
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
        setLoadingTasks(false);
        return;
      }

      setLoadingTasks(true);
      setError("");

      try {
        const result = await api.projectTasks(projectId, token);

        if (!cancelled) {
          setTasks(result.tasks);
        }
      } catch (err) {
        if (cancelled) return;

        if (err.status === 401) {
          onSessionExpired();
        } else {
          setError(err.message);
          setTasks([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingTasks(false);
        }
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
      if (!projectId || !userId || selectedProject?.ownerId !== userId) {
        setMembers([]);
        setLoadingMembers(false);
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
  }, [projectId, token, userId, selectedProject?.ownerId, onSessionExpired]);

  function updateField(event) {
    const { name, value } = event.target;

    // A changed payload must not reuse the previous submission's key.
    pendingSubmission.current = null;

    setFields((current) => ({
      ...current,
      [name]: value,
    }));

    setFieldErrors((current) => ({
      ...current,
      [name]: "",
    }));

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
        fields.timeEstimate === ""
          ? null
          : Number(fields.timeEstimate),
    };

    const payloadSignature = JSON.stringify(payload);

    // Reuse the key for an unchanged submission after a failed request.
    // Generate a new key if the payload changes.
    if (
      !pendingSubmission.current ||
      pendingSubmission.current.payloadSignature !== payloadSignature
    ) {
      pendingSubmission.current = {
        payloadSignature,
        key: crypto.randomUUID(),
      };
    }

    const idempotencyKey = pendingSubmission.current.key;

    setSaving(true);
    try {
      const result = await api.createTask(
        payload,
        token,
        idempotencyKey,
      );
      // Clear the key only after successful creation.
      pendingSubmission.current = null;

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
      // Keep the pending key so an unchanged submission can be retried.
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(task, nextStatus) {
    setError("");
    setNotice("");

    setUpdatingTaskIds((current) =>
      current.includes(task.id) ? current : [...current, task.id],
    );

    try {
      const result = await api.changeTaskStatus(
        task.id,
        nextStatus,
        token,
      );

      setTasks((current) =>
        current.map((item) =>
          item.id === task.id ? result.task : item,
        ),
      );

      setNotice(
        `Task status updated to ${nextStatus.replaceAll("_", " ")}.`,
      );
    } catch (err) {
      if (err.status === 401) {
        onSessionExpired();
      } else {
        setError(err.message);
      }
    } finally {
      setUpdatingTaskIds((current) =>
        current.filter((id) => id !== task.id),
      );
    }
  }

  return (
    <section className="task-workspace">
      <h2>Project Tasks</h2>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {notice && (
        <p className="form-status" role="status">
          {notice}
        </p>
      )}

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
            pendingSubmission.current = null;
            setProjectId(event.target.value);
            setNotice("");
            setError("");
          }}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
              {project.archived ? " (Archived)" : ""}
            </option>
          ))}
        </select>
      )}

      {selectedProject?.archived && (
        <p role="status">
          This project is archived; new tasks cannot be created.
        </p>
      )}

      <h3>Create a task</h3>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <label htmlFor="task-title">
          Title (required, max 200 characters)
        </label>

        <input
          id="task-title"
          name="title"
          value={fields.title}
          onChange={updateField}
          maxLength={201}
          required
          aria-invalid={Boolean(fieldErrors.title)}
          aria-describedby={
            fieldErrors.title ? "task-title-error" : undefined
          }
        />

        {fieldErrors.title && (
          <p id="task-title-error" className="form-error">
            {fieldErrors.title}
          </p>
        )}

        <label htmlFor="task-description">
          Description (max 2000 characters)
        </label>

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

        <label htmlFor="task-time-estimate">
          Time estimate in hours (optional)
        </label>

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
          {tasks.map((task) => {
            const transitions = [
              ...(allowedTransitions[task.status] || []),
              ...(task.status === "IN_PROGRESS" &&
              task.assigneeId == null
                ? ["TODO"]
                : []),
            ];

            return (
              <li key={task.id}>
                <strong>{task.title}</strong>

                <div>
                  <label htmlFor={`task-status-${task.id}`}>
                    Status
                  </label>

                  <select
                    id={`task-status-${task.id}`}
                    aria-label={`Status for ${task.title}`}
                    value={task.status}
                    disabled={updatingTaskIds.includes(task.id)}
                    onChange={(event) =>
                      handleStatusChange(task, event.target.value)
                    }
                  >
                    <option value={task.status}>
                      {task.status.replaceAll("_", " ")}
                    </option>

                    {transitions.map((status) => (
                      <option key={status} value={status}>
                        {status.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>

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
            );
          })}
        </ul>
      )}
    </section>
  );
}
