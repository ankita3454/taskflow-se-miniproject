import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import projectRoutes from "./routes/projects.routes.js";

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
  }),
);

app.use(express.json());

app.get("/api/v1/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "TaskFlow API",
  });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/projects", projectRoutes);

app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Endpoint not found",
    },
  });
});

app.use((error, _req, res, _next) => {
  const invalidJson = error.type === "entity.parse.failed";

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
