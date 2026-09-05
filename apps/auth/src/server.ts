import "dotenv/config";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { auth, pool } from "./auth.js";
import { env } from "./env.js";

const app = new Hono();

app.use(
  "/api/auth/*",
  cors({
    origin: (origin) => (env.corsAllowedOrigins.includes(origin) ? origin : ""),
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  })
);

app.get("/", (context) =>
  context.json({
    service: "Help The Hive Auth",
    status: "ok",
    infrastructureDashboard: env.betterAuthAPIKey ? "enabled" : "disabled",
    endpoints: {
      health: "/healthz",
      readiness: "/readyz",
      auth: "/api/auth/*",
      jwks: "/api/auth/jwks",
    },
  })
);
app.get("/healthz", (context) => context.text("ok\n"));
app.get("/readyz", async (context) => {
  try {
    await pool.query("select 1");
    return context.text("ready\n");
  } catch {
    return context.text("not ready\n", 503);
  }
});
app.get("/api/auth/ok", (context) => context.json({ status: "ok" }));
app.on(["GET", "POST"], "/api/auth/*", (context) => auth.handler(context.req.raw));

const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`Better Auth listening on http://localhost:${info.port}`);
});

async function shutdown() {
  server.close();
  await pool.end();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
