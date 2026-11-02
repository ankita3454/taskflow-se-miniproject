import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import taskRoutes from "./routes/task.routes.js";
import projectRoutes from "./routes/projects.routes.js";
import invitationRoutes from "./routes/invitations.routes.js";

import notificationRoutes from "./routes/notification.routes.js";

import securityRoutes from "./sprint2/security.routes.js";
import { createLoginLimiter, recordAudit } from "./sprint2/security.js";

import taskFeatures from "./sprint2/tasks.routes.js";
const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
  }),
);

// Count malformed JSON attempts too: throttle before the body parser.
app.post("/api/v1/auth/login", createLoginLimiter());
app.use(express.json());

app.get("/api/v1/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "TaskFlow API",
  });
});

app.use("/api/v1/admin", securityRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1", taskRoutes);
app.use("/api/v1", taskFeatures);
app.use("/api/v1/projects", projectRoutes);
app.use("/api/v1", invitationRoutes);

app.use("/api/v1/notifications", notificationRoutes);

app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Endpoint not found",
    },
  });
});

app.use(async (error, _req, res, _next) => {
  const invalidJson = error.type === "entity.parse.failed";
  if (invalidJson && _req.path === "/api/v1/auth/login") {
    try {
      await recordAudit("LOGIN_FAILED");
    } catch {
      /* Respond without exposing storage errors. */
    }
  }

  res.status(invalidJson ? 400 : 500).json({
    error: {
      code: invalidJson ? "INVALID_JSON" : "INTERNAL_SERVER_ERROR",
      message: invalidJson
        ? "Invalid JSON request body"
        : "An unexpected error occurred",
    },
  });
});

export default app;
