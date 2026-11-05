import { createApp } from "./app";
import { salesConfig } from "./config";
import { ENV } from "./env.server";
import { auth, db } from "./services";

const port = ENV.PORT;
const app = createApp({
  db,
  auth,
  origin: ENV.CORS_ORIGIN,
  config: salesConfig(process.env),
}).listen(port);
console.log(`Qublox API listening on http://localhost:${port}`);
async function shutdown() {
  await app.stop();
  await db.$client.end();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
