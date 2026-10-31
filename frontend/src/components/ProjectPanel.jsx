import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api.js";

export default function ProjectPanel({ token, userId, onSessionExpired }) {
  const [name, setName] = useState("");
  const [projects, setProjects] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [inviteEmails, setInviteEmails] = useState({});
  const [inviteMessages, setInviteMessages] = useState({});
  const [error, setError] = useState("");
  const [invitationError, setInvitationError] = useState("");
  const [responseMessage, setResponseMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingInvitations, setLoadingInvitations] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(null);
  const [responding, setResponding] = useState(null);

  useEffect(() => {
    let cancelled = false;

    api
      .projects(token)
      .then(({ projects: fetchedProjects }) => {
        if (!cancelled) setProjects(fetchedProjects);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          onSessionExpired();
          return;
        }
        setError(err instanceof ApiError ? err.message : "Could not load projects.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    api
      .invitations(token)
      .then(({ invitations: received }) => {
        if (!cancelled) setInvitations(received);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          onSessionExpired();
          return;
        }
        setInvitationError(
          err instanceof ApiError ? err.message : "Could not load invitations.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingInvitations(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, onSessionExpired]);

  async function handleCreate(event) {
    event.preventDefault();
    setError("");
    setCreating(true);

    try {
      const { project } = await api.createProject(token, name);
      setProjects((current) => [project, ...current]);
      setName("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not create project.");
    } finally {
      setCreating(false);
    }
  }

  async function handleInvite(event, projectId) {
    event.preventDefault();
    setError("");
    setInviteMessages((current) => ({ ...current, [projectId]: "" }));
    setSendingInvite(projectId);

    try {
      const { invitation } = await api.inviteMember(
        token,
        projectId,
        inviteEmails[projectId] || "",
      );
      setInviteEmails((current) => ({ ...current, [projectId]: "" }));
      setInviteMessages((current) => ({
        ...current,
        [projectId]: `Invitation sent to ${invitation.invitedEmail}.`,
      }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setInviteMessages((current) => ({
        ...current,
        [projectId]: err instanceof ApiError ? err.message : "Could not send invitation.",
      }));
    } finally {
      setSendingInvite(null);
    }
  }

  async function handleInvitationResponse(invitationId, response) {
    setInvitationError("");
    setResponseMessage("");
    setResponding(invitationId);

    try {
      const { invitation } = await api.respondToInvitation(token, invitationId, response);
      setInvitations((current) => current.filter((item) => item.id !== invitationId));
      if (response === "accept") {
        const { projects: updatedProjects } = await api.projects(token);
        setProjects(updatedProjects);
      }
      setResponseMessage(
        response === "accept"
          ? `You joined ${invitation.project.name}.`
          : `You declined the invitation to ${invitation.project.name}.`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setInvitationError(
        err instanceof ApiError ? err.message : "Could not respond to invitation.",
      );
    } finally {
      setResponding(null);
    }
  }

  return (
    <section className="project-panel" aria-labelledby="projects-heading">
      <h2 id="projects-heading">Your projects</h2>

      <form onSubmit={handleCreate} className="auth-form project-form">
        <label htmlFor="project-name">Project name</label>
        <input
          id="project-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />

        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}

        <button type="submit" disabled={creating}>
          {creating ? "Creating..." : "Create project"}
        </button>
      </form>

      {loading ? (
        <p role="status">Loading projects...</p>
      ) : projects.length > 0 ? (
        <ul className="project-list">
          {projects.map((project) => (
            <li className="project-card" key={project.id}>
              <div className="project-summary">
                <strong>{project.name}</strong>
                <span>{project.archived ? "Archived" : "Active"}</span>
              </div>
              {project.ownerId === userId && (
                <form
                  className="invite-form"
                  onSubmit={(event) => handleInvite(event, project.id)}
                >
                  <label htmlFor={`invite-email-${project.id}`}>Invite by email</label>
                  <div className="invite-controls">
                    <input
                      id={`invite-email-${project.id}`}
                      type="email"
                      maxLength={150}
                      required
                      value={inviteEmails[project.id] || ""}
                      onChange={(event) =>
                        setInviteEmails((current) => ({
                          ...current,
                          [project.id]: event.target.value,
                        }))
                      }
                    />
                    <button type="submit" disabled={sendingInvite === project.id}>
                      {sendingInvite === project.id ? "Sending..." : "Invite"}
                    </button>
                  </div>
                  {inviteMessages[project.id] && (
                    <p role="status" className="form-status">
                      {inviteMessages[project.id]}
                    </p>
                  )}
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="project-empty">You haven't created or joined a project yet.</p>
      )}

      <section className="invitation-inbox" aria-labelledby="invitations-heading">
        <h2 id="invitations-heading">Project invitations</h2>
        {responseMessage && (
          <p role="status" className="form-status">
            {responseMessage}
          </p>
        )}
        {invitationError && (
          <p role="alert" className="form-error">
            {invitationError}
          </p>
        )}
        {loadingInvitations ? (
          <p role="status">Loading invitations...</p>
        ) : invitations.length > 0 ? (
          <ul className="project-list">
            {invitations.map((invitation) => (
              <li className="project-card invitation-card" key={invitation.id}>
                <div className="project-summary">
                  <strong>{invitation.project.name}</strong>
                  <span>Invited by {invitation.invitedBy.name}</span>
                </div>
                <div className="invitation-actions">
                  <button
                    type="button"
                    disabled={responding !== null}
                    onClick={() => handleInvitationResponse(invitation.id, "accept")}
                  >
                    {responding === invitation.id ? "Saving..." : "Accept"}
                  </button>
                  <button
                    type="button"
                    disabled={responding !== null}
                    onClick={() => handleInvitationResponse(invitation.id, "decline")}
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="project-empty">You have no pending invitations.</p>
        )}
      </section>
    </section>
  );
}
