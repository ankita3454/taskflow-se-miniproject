import { useState } from "react";
import { api, ApiError } from "../lib/api.js";

export default function ProfileView({
  token,
  user,
  onUserUpdated,
  onLogout,
  onSessionExpired,
}) {
  const [name, setName] = useState(user.name);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleSave(event) {
    event.preventDefault();
    setError("");
    setStatus("");
    setSaving(true);

    try {
      const fields = { name };
      if (password) fields.password = password;

      const { user: updated } = await api.updateMe(token, fields);
      onUserUpdated(updated);
      setPassword("");
      setStatus("Profile updated.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setError(err instanceof ApiError ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await api.logout(token);
    } catch {
      // Logout is client-side (JWTs are stateless) — discard the token
      // locally regardless of whether the network call succeeded.
    } finally {
      onLogout();
    }
  }

  return (
    <div className="profile-view">
      <h2>Welcome, {user.name}</h2>
      <p className="meta">
        {user.email} &middot; role: {user.role}
      </p>

      <form onSubmit={handleSave} className="auth-form">
        <label htmlFor="profile-name">Name</label>
        <input
          id="profile-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <label htmlFor="profile-password">New password (optional)</label>
        <input
          id="profile-password"
          type="password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Leave blank to keep current password"
        />

        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {status && (
          <p role="status" className="form-status">
            {status}
          </p>
        )}

        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </button>
      </form>

      <button
        type="button"
        onClick={handleLogout}
        disabled={loggingOut}
        className="logout-button"
      >
        {loggingOut ? "Logging out..." : "Log out"}
      </button>
    </div>
  );
}
