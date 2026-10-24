import { useState } from "react";
import { api, ApiError } from "../lib/api.js";

export default function RegisterForm({ onRegistered, onSwitchToLogin }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { token, user } = await api.register(name, email, password);
      onRegistered(token, user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <h2>Create your account</h2>

      <label htmlFor="register-name">Name</label>
      <input
        id="register-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />

      <label htmlFor="register-email">Email</label>
      <input
        id="register-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <label htmlFor="register-password">Password</label>
      <input
        id="register-password"
        type="password"
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <p className="hint">At least 8 characters.</p>

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading}>
        {loading ? "Creating account..." : "Register"}
      </button>

      <p className="switch-link">
        Already have an account?{" "}
        <button type="button" onClick={onSwitchToLogin} className="link-button">
          Log in
        </button>
      </p>
    </form>
  );
}
