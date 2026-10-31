import { useCallback, useEffect, useState } from "react";
import "./App.css";
import "./theme.css";
import ThemeToggle from "./components/ThemeToggle.jsx";
import { readTheme, saveTheme, THEME_STORAGE_KEY } from "./lib/theme.js";
import { api } from "./lib/api.js";
import LoginForm from "./components/LoginForm.jsx";
import RegisterForm from "./components/RegisterForm.jsx";
import ProfileView from "./components/ProfileView.jsx";
import NotificationBell from "./components/NotificationBell.jsx";
import TaskWorkspace from "./components/TaskWorkspace.jsx";
import ProjectPanel from "./components/ProjectPanel.jsx";
import WorkspaceHome, {
  FlowIllustration,
} from "./components/WorkspaceHome.jsx";
import WorkspaceIcon from "./components/WorkspaceIcon.jsx";

const TOKEN_STORAGE_KEY = "taskflow.token";
const SESSION_EXPIRED_NOTICE = "Your session has expired. Please log in again.";

const pages = {
  home: {
    title: "Overview",
    description: "A little clarity for the work ahead.",
  },
  projects: {
    title: "Projects",
    description: "Good work starts with a shared space.",
  },
  tasks: { title: "Tasks", description: "Small steps. Shared progress." },
  notifications: {
    title: "Notifications",
    description: "Your assignments and project updates, in one place.",
  },
  profile: {
    title: "Your profile",
    description: "The details that make this workspace yours.",
  },
};
function readPage() {
  const page = window.location.hash.replace(/^#\/?/, "");
  return Object.hasOwn(pages, page) ? page : "home";
}
function Brand() {
  return (
    <a className="brand" href="#/home" aria-label="TaskFlow home">
      <span className="brand-mark">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span>
        taskflow<span className="brand-period">.</span>
      </span>
    </a>
  );
}
export default function App() {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    function syncTheme(event) {
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        setTheme(readTheme());
      }
    }
    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    saveTheme(next);
    setTheme(next);
  }
  // Token saved from a previous visit, read once on first render.
  const [storedToken] = useState(
    () => localStorage.getItem(TOKEN_STORAGE_KEY) || null,
  );
  const [token, setToken] = useState(storedToken);
  const [user, setUser] = useState(null);
  const [authView, setAuthView] = useState("login"); // "login" | "register"
  const [restoringSession, setRestoringSession] = useState(
    Boolean(storedToken),
  );
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(readPage);
  const [notificationTarget, setNotificationTarget] = useState(null);
  const [projectRevision, setProjectRevision] = useState(0);
  const handleProjectsChanged = useCallback(
    () => setProjectRevision((value) => value + 1),
    [],
  );

  useEffect(() => {
    function handleHashChange() {
      setPage(readPage());
    }
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);
  useEffect(() => {
    document.title = `${pages[page].title} · TaskFlow`;
  }, [page]);

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
      <main className="session-loading">
        <Brand />
        <span className="loading-ring" />
        <p role="status">Opening your workspace...</p>
      </main>
    );
  }

  if (!token || !user) {
    return (
      <main className="auth-layout">
        <section className="auth-story">
          <Brand />
          <div className="auth-story-copy">
            <span className="eyebrow">A LITTLE CLARITY GOES A LONG WAY</span>
            <h1>
              Great work.
              <br />
              Better together.
            </h1>
            <p>
              Your projects, your people, your next big idea.
              <br />
              Bring it all into one focused workspace.
            </p>
            <FlowIllustration />
          </div>
          <p className="auth-story-footer">Less scattered. More together.</p>
        </section>
        <section className="auth-entry" aria-label="Account access">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <div className="auth-mobile-brand">
            <Brand />
          </div>
          <div className="auth-entry-heading">
            <span className="eyebrow">WELCOME TO YOUR WORKSPACE</span>
            <p>
              {authView === "login"
                ? "Pick up where you left off."
                : "Your next chapter starts here."}
            </p>
          </div>
          {authView === "login" ? (
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
          <p className="auth-footnote">
            A shared space for clear plans and good teamwork.
          </p>
        </section>
      </main>
    );
  }

  return (
    <div className="workspace-shell">
      <a
        className="skip-link"
        href="#workspace-main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("workspace-main")?.focus();
        }}
      >
        Skip to content
      </a>
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">
          <span className="workspace-symbol">T</span>
          <div>
            <strong>Team workspace</strong>
            <small>Make good work happen</small>
          </div>
        </div>
        <nav aria-label="Main navigation">
          <p className="nav-heading">WORKSPACE</p>
          {Object.keys(pages).map((key) => (
            <a
              key={key}
              href={`#/${key}`}
              className={`nav-item ${page === key ? "active" : ""}`}
              aria-current={page === key ? "page" : undefined}
            >
              <WorkspaceIcon name={key} />
              <span>
                {key === "home"
                  ? "Overview"
                  : key === "profile"
                    ? "Profile"
                    : pages[key].title}
              </span>
              {page === key && <span className="nav-active-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span>✦</span>
            <strong>Keep your focus.</strong>
            <p>
              One project. One task.
              <br />
              One step forward.
            </p>
          </div>
          <a className="sidebar-user" href="#/profile">
            <span className="avatar">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{user.name}</strong>
              <small>Account settings</small>
            </span>
            <WorkspaceIcon name="arrow" size={16} />
          </a>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>{pages[page].title}</strong>
          </div>
          <div className="topbar-actions">
            <span className="topbar-date">
              {new Intl.DateTimeFormat(undefined, {
                month: "short",
                day: "numeric",
                weekday: "short",
              }).format(new Date())}
            </span>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <NotificationBell
              key={user.id}
              token={token}
              onSessionExpired={handleSessionExpired}
              panelTarget={page === "notifications" ? notificationTarget : null}
            />
            <a
              className="avatar avatar-small"
              href="#/profile"
              aria-label="Open your profile"
            >
              {user.name.slice(0, 1).toUpperCase()}
            </a>
          </div>
        </header>
        <main id="workspace-main" className="workspace-main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                TASKFLOW /{" "}
                {page === "home" ? "YOUR WORKSPACE" : page.toUpperCase()}
              </span>
              <h1>{pages[page].title}</h1>
              <p>{pages[page].description}</p>
            </div>
            <span className="workspace-status">
              <span /> Team workspace
            </span>
          </div>
          <section aria-label="Overview screen" hidden={page !== "home"}>
            <WorkspaceHome user={user} />
          </section>
          <section aria-label="Projects screen" hidden={page !== "projects"}>
            <ProjectPanel
              token={token}
              userId={user.id}
              onSessionExpired={handleSessionExpired}
              onProjectsChanged={handleProjectsChanged}
            />
          </section>
          <section aria-label="Tasks screen" hidden={page !== "tasks"}>
            <TaskWorkspace
              token={token}
              userId={user.id}
              onSessionExpired={handleSessionExpired}
              projectRevision={projectRevision}
            />
          </section>
          <section
            aria-label="Notifications screen"
            hidden={page !== "notifications"}
          >
            <div
              className="notification-page-host"
              ref={setNotificationTarget}
            />
          </section>
          <section aria-label="Profile screen" hidden={page !== "profile"}>
            <ProfileView
              token={token}
              user={user}
              onUserUpdated={setUser}
              onLogout={handleLogout}
              onSessionExpired={handleSessionExpired}
            />
          </section>
          <footer className="workspace-footer">
            <span>Thoughtfully organised. Built for teamwork.</span>
            <span>
              TaskFlow <span className="footer-dot">·</span> Your shared
              workspace
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
