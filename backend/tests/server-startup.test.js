import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runServerIfMain, startServer } from "../src/server.js";

test("server startup wires the reminder scheduler, signal handlers, port, and logger", () => {
  const calls = { signals: [], listening: [], logs: [], stopped: 0 };
  const stop = () => { calls.stopped++; };
  const listener = { close() {} };
  const server = startServer({
    application: {
      listen: (port, callback) => {
        calls.listening.push(port);
        callback();
        return listener;
      },
    },
    startScheduler: () => stop,
    env: { PORT: "4321" },
    processApi: {
      once: (signal, callback) => calls.signals.push({ signal, callback }),
    },
    logger: { log: (message) => calls.logs.push(message) },
  });

  assert.equal(server, listener);
  assert.deepEqual(calls.listening, ["4321"]);
  assert.deepEqual(calls.logs, ["TaskFlow API listening on port 4321"]);
  assert.deepEqual(calls.signals.map(({ signal }) => signal), ["SIGTERM", "SIGINT"]);
  for (const { callback } of calls.signals) callback();
  assert.equal(calls.stopped, 2);
});

test("server startup defaults to port 5000", () => {
  let listeningPort;
  startServer({
    application: {
      listen: (port, callback) => {
        listeningPort = port;
        callback();
        return {};
      },
    },
    startScheduler: () => () => {},
    env: {},
    processApi: { once() {} },
    logger: { log: () => {} },
  });
  assert.equal(listeningPort, 5000);
});

test("server entry-point guard starts only for its own module path", () => {
  let starts = 0;
  runServerIfMain(undefined, () => { starts++; });
  runServerIfMain("another-entry.js", () => { starts++; });
  runServerIfMain(
    fileURLToPath(import.meta.resolve("../src/server.js")),
    () => { starts++; },
  );
  assert.equal(starts, 1);
});
