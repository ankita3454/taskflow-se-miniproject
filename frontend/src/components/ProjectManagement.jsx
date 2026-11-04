import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { featureRequest } from "../lib/sprint2-api.js";
export default function ProjectManagement({
  token,
  userId,
  onProjectsChanged,
  onSessionExpired,
}) {
  const [projects, setProjects] = useState([]),
    [projectId, setProjectId] = useState(""),
    [membership, setMembers] = useState({ id: "", members: [] }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    api
      .projects(token)
      .then(({ projects }) => {
        if (active) {
          setProjects(projects);
          setProjectId((id) =>
            projects.some((p) => p.id === id) ? id : projects[0]?.id || "",
          );
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          if (e.status === 401) onSessionExpired();
        }
      });
    return () => {
      active = false;
    };
  }, [token, revision, onSessionExpired]);
  useEffect(() => {
    let active = true;
    if (projectId)
      api
        .projectMembers(projectId, token)
        .then((r) => {
          if (active) setMembers({ id: projectId, members: r.members });
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [projectId, revision, token]);
  const members = membership.id === projectId ? membership.members : [];
  const project = projects.find((p) => p.id === projectId),
    owner = project?.ownerId === userId;
  async function action(path, method, body, message) {
    if (!window.confirm(message)) return;
    setBusy(true);
    setError("");
    try {
      await featureRequest(path, token, { method, body });
      setRevision((v) => v + 1);
      onProjectsChanged();
    } catch (e) {
      setError(e.message);
      if (e.status === 401) onSessionExpired();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="feature-card">
      <h2>Project membership and archiving</h2>
      {error && <p role="alert">{error}</p>}
      <label>
        Manage project
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          {projects.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <p className="meta">
        Exactly one Owner. Transferring ownership changes project ownership, not
        system roles.
      </p>
      <ul className="feature-history">
        {members.map(({ user }) => (
          <li key={user.id}>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
            <span>{user.id === project?.ownerId ? "Owner" : "Member"}</span>
            {owner && user.id !== userId && (
              <>
                <button
                  disabled={busy}
                  onClick={() =>
                    action(
                      `/projects/${projectId}/members/${user.id}`,
                      "PATCH",
                      { projectRole: "Owner" },
                      `Transfer ownership to ${user.name}? You become a Member.`,
                    )
                  }
                >
                  Transfer ownership to {user.name}
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    action(
                      `/projects/${projectId}/members/${user.id}`,
                      "DELETE",
                      undefined,
                      `Remove ${user.name}? Existing task attribution is retained, but access is revoked.`,
                    )
                  }
                >
                  Remove {user.name}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {owner && !project.archived && (
        <button
          disabled={busy}
          onClick={() =>
            action(
              `/projects/${projectId}/archive`,
              "POST",
              undefined,
              "Archive this project? Existing data stays viewable; no new tasks can be created.",
            )
          }
        >
          Archive project
        </button>
      )}
      {project?.archived && (
        <p>This project is archived. Existing data remains available.</p>
      )}
    </section>
  );
}
