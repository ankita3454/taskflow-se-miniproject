import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { api } from "./lib/api.js";
import LoginForm from "./components/LoginForm.jsx";
import RegisterForm from "./components/RegisterForm.jsx";
import ProfileView from "./components/ProfileView.jsx";
import NotificationBell from "./components/NotificationBell.jsx";
import TaskWorkspace from "./components/TaskWorkspace.jsx";

const TOKEN_STORAGE_KEY = "taskflow.token";
const SESSION_EXPIRED_NOTICE = "Your session has expired. Please log in again.";

export default function App() {
  // Token saved from a previous visit, read once on first render.
  const [storedToken] = useState(
    () => localStorage.getItem(TOKEN_STORAGE_KEY) || null,
  );
  const [token, setToken] = useState(storedToken);
  const [user, setUser] = useState(null);
  const [authView, setAuthView] = useState("login"); // "login" | "register"
  const [restoringSession, setRestoringSession] = useState(Boolean(storedToken));
  const [notice, setNotice] = useState("");

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
      .catch((err) => {
        // Expired/invalid token (F1-REQ-08) — drop it and show the login form.
        if (!cancelled) {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          setToken(null);
          if (err?.status === 401) setNotice(SESSION_EXPIRED_NOTICE);
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
    setNotice("");
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  }

  const handleLogout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
    setAuthView("login");
  }, []);

  // A protected request came back 401 (expired or invalid JWT): end the
  // session and send the user back to the login form (issue #2).
  const handleSessionExpired = useCallback(() => {
    handleLogout();
    setNotice(SESSION_EXPIRED_NOTICE);
  }, [handleLogout]);

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
  <>
    <NotificationBell key={user.id} token={token} onSessionExpired={handleSessionExpired} />
    <ProfileView
      token={token}
      user={user}
      onUserUpdated={setUser}
      onLogout={handleLogout}
      onSessionExpired={handleSessionExpired}
    />
    <TaskWorkspace
      token={token}
      userId={user.id}
      onSessionExpired={handleSessionExpired}
    />
  </>
      ) : authView === "login" ? (
        <LoginForm
          notice={notice}
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
