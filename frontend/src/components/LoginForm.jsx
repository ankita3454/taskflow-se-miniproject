import { useState } from "react";
import { api, ApiError } from "../lib/api.js";

export default function LoginForm({ onLoggedIn, onSwitchToRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { token, user } = await api.login(email, password);
      onLoggedIn(token, user);
    } catch (err) {
      // F1-REQ-05: show the API's generic message as-is — never guess
      // whether the email or the password was wrong.
      setError(err instanceof ApiError ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <h2>Log in to TaskFlow</h2>

      <label htmlFor="login-email">Email</label>
      <input
        id="login-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <label htmlFor="login-password">Password</label>
      <input
        id="login-password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading}>
        {loading ? "Logging in..." : "Log in"}
      </button>

      <p className="switch-link">
        Don't have an account?{" "}
        <button type="button" onClick={onSwitchToRegister} className="link-button">
          Register
        </button>
      </p>
    </form>
  );
}
