import { useCallback, useEffect, useState } from "react";
import { featureRequest } from "../lib/sprint2-api.js";
export default function TaskConversation({ taskId, token }) {
  const [history, setHistory] = useState({ comments: [], activities: [] }),
    [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const data = await featureRequest(`/tasks/${taskId}/history`, token);
      setHistory(data);
    } catch (e) {
      setError(e.message);
      if (e.status === 403 || e.status === 401)
        setHistory({ comments: [], activities: [] });
    }
  }, [taskId, token]);
  useEffect(() => {
    let active = true;
    const update = async () => {
      if (active) await load();
    };
    update();
    const timer = setInterval(update, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [load]);
  async function comment(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await featureRequest(`/tasks/${taskId}/comments`, token, {
        method: "POST",
        body: { body },
      });
      setBody("");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="feature-stack">
      <section>
        <h3>Comments</h3>
        <p className="meta">
          Mention active project members using @email. Comments cannot be edited
          or deleted separately.
        </p>
        {error && <p role="alert">{error}</p>}
        <ol className="feature-history">
          {history.comments.map((c) => (
            <li key={c.id}>
              <strong>{c.authorName}</strong>
              <time>{new Date(c.createdAt).toLocaleString()}</time>
              <p>{c.body}</p>
            </li>
          ))}
        </ol>
        <form onSubmit={comment} className="auth-form">
          <label>
            New comment
            <textarea
              required
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <button disabled={busy || !body.trim()}>Post comment</button>
        </form>
      </section>
      <section>
        <h3>Activity history</h3>
        <ol className="feature-history">
          {history.activities.map((a) => (
            <li key={a.id}>
              <strong>{a.actorName}</strong>
              <span>{a.field}</span>
              <span>
                {JSON.stringify(a.oldValue)} → {JSON.stringify(a.newValue)}
              </span>
              <time>{new Date(a.createdAt).toLocaleString()}</time>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
