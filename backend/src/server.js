import "dotenv/config";
import app from "./app.js";
import { startReminderScheduler } from "./sprint2/reminders.js";
import { pathToFileURL } from "node:url";

export function startServer({
  application = app,
  startScheduler = startReminderScheduler,
  env = process.env,
  processApi = process,
  logger = console,
} = {}) {
  const stopReminders = startScheduler();
  processApi.once("SIGTERM", stopReminders);
  processApi.once("SIGINT", stopReminders);

  const port = env.PORT || 5000;
  return application.listen(port, () => {
    logger.log(`TaskFlow API listening on port ${port}`);
  });
}

export function runServerIfMain(entryPath = process.argv[1], start = startServer) {
  if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
    start();
  }
}

runServerIfMain();
