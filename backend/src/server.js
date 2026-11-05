import "dotenv/config";
import app from "./app.js";

import { startReminderScheduler } from "./sprint2/reminders.js";
const stopReminders = startReminderScheduler();
process.once("SIGTERM", stopReminders);
process.once("SIGINT", stopReminders);

const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log(`TaskFlow API listening on port ${port}`);
});
