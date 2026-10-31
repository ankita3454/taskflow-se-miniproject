const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1";

class ApiError extends Error {
  constructor(status, code, message, fields = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

async function request(
  path,
  { method = "GET", body, token, extraHeaders = {} } = {},
) {
  const headers = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

  if (response.status === 204) return null;

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const err = data?.error || {};
    throw new ApiError(
      response.status,
      err.code || "UNKNOWN",
      err.message || "Something went wrong. Please try again.",
      err.fields || {},
    );
  }

  return data;
}

export const api = {
  register: (name, email, password) =>
    request("/auth/register", { method: "POST", body: { name, email, password } }),
  login: (email, password) =>
    request("/auth/login", { method: "POST", body: { email, password } }),
  logout: (token) => request("/auth/logout", { method: "POST", token }),
  me: (token) => request("/auth/me", { token }),
  updateMe: (token, fields) =>
    request("/auth/me", { method: "PATCH", body: fields, token }),

  projects: (token) => request("/projects", { token }),

  projectTasks: (projectId, token) =>
    request(`/projects/${encodeURIComponent(projectId)}/tasks`, { token }),

  projectMembers: (projectId, token) =>
    request(`/projects/${encodeURIComponent(projectId)}/members`, { token }),

  createTask: (fields, token, idempotencyKey) =>
    request("/tasks", {
      method: "POST",
      body: fields,
      token,
      extraHeaders: {
        "Idempotency-Key": idempotencyKey,
      },
    }),

  changeTaskStatus: (taskId, status, token) =>
    request(`/tasks/${encodeURIComponent(taskId)}/status`, {
      method: "PATCH",
      body: { status },
      token,
    }),

  assignTask: (taskId, assigneeId, token) =>
    request(`/tasks/${encodeURIComponent(taskId)}/assignee`, {
      method: "PATCH",
      body: { assigneeId },
      token,
    }),

  createProject: (token, name) =>
    request("/projects", { method: "POST", body: { name }, token }),

  invitations: (token) => request("/invitations", { token }),

  inviteMember: (token, projectId, email) =>
    request(`/projects/${projectId}/invitations`, {
      method: "POST",
      body: { email },
      token,
    }),

  respondToInvitation: (token, invitationId, response) =>
    request(`/invitations/${invitationId}/${response}`, {
      method: "POST",
      token,
    }),
    listNotifications: (token) =>
    request("/notifications", { token }),

  getUnreadNotificationCount: (token) =>
    request("/notifications/unread-count", { token }),

  markNotificationRead: (token, notificationId) =>
    request(
      `/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: "PATCH", token },
    ),

  markAllNotificationsRead: (token) =>
    request("/notifications/read-all", {
      method: "PATCH",
      token,
    }),
};

export { ApiError };
