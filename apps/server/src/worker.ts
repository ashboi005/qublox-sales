import "./env.server";
import { db } from "./services";
import { salesConfig } from "./config";
import { claimJob, processJob } from "./jobs";

let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
const config = salesConfig(process.env);
console.log("Qublox research worker started");
while (!stopping) {
  try {
    const job = await claimJob(db);
    if (job) await processJob(db, config, job);
  } catch {
    console.error(JSON.stringify({ event: "worker_iteration_failed" }));
  }
  if (!stopping) await Bun.sleep(2000);
}
await db.$client.end();
