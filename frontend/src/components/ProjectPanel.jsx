import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api.js";

export default function ProjectPanel({ token, onSessionExpired }) {
  const [name, setName] = useState("");
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

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
              <strong>{project.name}</strong>
              <span>{project.archived ? "Archived" : "Active"}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="project-empty">You haven't created or joined a project yet.</p>
      )}
    </section>
  );
}
