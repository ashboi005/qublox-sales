import { createApp } from "./app";
import { salesConfig } from "./config";
import { ENV } from "./env.server";
import { auth, db } from "./services";

const app = createApp({ db, auth, origin: ENV.CORS_ORIGIN, config: salesConfig(process.env) }).listen(3000);
console.log("Qublox API listening on http://localhost:3000");
async function shutdown() { await app.stop(); await db.$client.end(); process.exit(0); }
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
