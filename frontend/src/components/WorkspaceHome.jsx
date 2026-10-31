import WorkspaceIcon from "./WorkspaceIcon.jsx";

export function FlowIllustration() {
  return (
    <div className="flow-art" aria-hidden="true">
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="flow-label flow-plan">
        <span className="flow-dot" />
        Plan
      </div>
      <div className="flow-label flow-work">
        <WorkspaceIcon name="tasks" />
        Collaborate
      </div>
      <div className="flow-label flow-done">
        <span className="flow-check">
          <WorkspaceIcon name="check" size={16} />
        </span>
        Deliver
      </div>
      <svg className="flow-lines" viewBox="0 0 400 260">
        <path
          d="M90 60h120q40 0 40 40v50q0 30-40 30H100q-30 0-30 30v20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="5 6"
        />
      </svg>
      <span className="art-spark spark-one">✦</span>
      <span className="art-spark spark-two">+</span>
    </div>
  );
}
const shortcuts = [
  {
    page: "projects",
    title: "A place for every project",
    body: "Create your project, bring your team in, and keep everyone connected.",
    action: "Manage projects",
    tint: "mint",
  },
  {
    page: "tasks",
    title: "Turn plans into progress",
    body: "Create, assign and move your tasks forward. One clear next step at a time.",
    action: "Open tasks",
    tint: "blue",
  },
  {
    page: "notifications",
    title: "Stay in the loop",
    body: "Catch up on assignments and status changes, then get back to what matters.",
    action: "View notifications",
    tint: "sand",
  },
];
export default function WorkspaceHome({ user }) {
  return (
    <div className="home-page">
      <section className="welcome-banner" aria-labelledby="welcome-heading">
        <div className="welcome-copy">
          <span className="eyebrow">YOUR TEAM. YOUR FLOW.</span>
          <h2 id="welcome-heading">
            Less scattered.
            <br />
            More <span>together.</span>
          </h2>
          <p>
            Welcome back, {user.name.split(" ")[0]}. Give your ideas a home and
            your team a clear path forward.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="#/tasks">
              Open your tasks <WorkspaceIcon name="arrow" size={17} />
            </a>
            <a className="hero-secondary" href="#/projects">
              Explore projects
            </a>
          </div>
        </div>
        <FlowIllustration />
      </section>
      <div className="section-heading">
        <div>
          <span className="eyebrow">MAKE ROOM FOR GOOD WORK</span>
          <h2>Your workspace, connected.</h2>
        </div>
        <p>Everything you need. A little less noise.</p>
      </div>
      <div className="shortcut-grid">
        {shortcuts.map((item) => (
          <a className="shortcut-card" href={`#/${item.page}`} key={item.page}>
            <span className={`shortcut-icon ${item.tint}`}>
              <WorkspaceIcon name={item.page} size={25} />
            </span>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
            <span className="shortcut-action">
              {item.action}
              <WorkspaceIcon name="arrow" size={18} />
            </span>
          </a>
        ))}
      </div>
      <section className="workspace-note">
        <span className="note-icon">
          <WorkspaceIcon name="check" />
        </span>
        <div>
          <h3>A calmer place to get things done.</h3>
          <p>
            Projects, tasks and updates have their own space. Use the sidebar to
            move between them—your unfinished forms stay right where you left
            them.
          </p>
        </div>
        <a href="#/profile">
          Your profile <WorkspaceIcon name="arrow" size={16} />
        </a>
      </section>
    </div>
  );
}
