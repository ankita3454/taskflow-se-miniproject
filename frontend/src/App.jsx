import { useEffect, useState } from "react";
import { api } from "./lib/api.js";
import LoginForm from "./components/LoginForm.jsx";
import RegisterForm from "./components/RegisterForm.jsx";
import ProfileView from "./components/ProfileView.jsx";

const TOKEN_STORAGE_KEY = "taskflow.token";

export default function App() {
  // Token saved from a previous visit, read once on first render.
  const [storedToken] = useState(
    () => localStorage.getItem(TOKEN_STORAGE_KEY) || null,
  );
  const [token, setToken] = useState(storedToken);
  const [user, setUser] = useState(null);
  const [authView, setAuthView] = useState("login"); // "login" | "register"
  const [restoringSession, setRestoringSession] = useState(Boolean(storedToken));

  // On load, if a token was saved from a previous session, verify it's
  // still valid and fetch the profile it belongs to (F1-REQ-06).
  useEffect(() => {
    if (!storedToken) return;

    let cancelled = false;

    api
      .me(storedToken)
      .then(({ user: fetchedUser }) => {
        if (!cancelled) setUser(fetchedUser);
      })
      .catch(() => {
        // Expired/invalid token (F1-REQ-08) — drop it and show the login form.
        if (!cancelled) {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          setToken(null);
        }
      })
      .finally(() => {
        if (!cancelled) setRestoringSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, [storedToken]);

  function handleAuthenticated(newToken, newUser) {
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
    setAuthView("login");
  }

  if (restoringSession) {
    return (
      <main>
        <h1>TaskFlow</h1>
        <p role="status">Loading...</p>
      </main>
    );
  }

  return (
    <main>
      <h1>TaskFlow</h1>

      {token && user ? (
        <ProfileView
          token={token}
          user={user}
          onUserUpdated={setUser}
          onLogout={handleLogout}
        />
      ) : authView === "login" ? (
        <LoginForm
          onLoggedIn={handleAuthenticated}
          onSwitchToRegister={() => setAuthView("register")}
        />
      ) : (
        <RegisterForm
          onRegistered={handleAuthenticated}
          onSwitchToLogin={() => setAuthView("login")}
        />
      )}
    </main>
  );
}
