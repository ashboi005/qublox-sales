import { chmodSync, closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const dev = Bun.argv.includes("--dev");
const directory = resolve(root, ".backups");
mkdirSync(directory, { recursive: true, mode: 0o700 });
chmodSync(directory, 0o700);
const path = resolve(
  directory,
  `${dev ? "development" : "production"}-${new Date().toISOString().replaceAll(":", "-")}.dump`,
);
const fd = openSync(path, "wx", 0o600);
let status = 1;
try {
  const child = Bun.spawn(
    [
      "docker",
      "compose",
      ...(dev
        ? [
            "-f",
            "compose.dev.yml",
            "exec",
            "-T",
            "postgres",
            "pg_dump",
            "--username=postgres",
            "--dbname=qublox_sales",
            "--format=custom",
          ]
        : ["run", "--rm", "--no-deps", "-T", "backup"]),
    ],
    { cwd: root, stdout: fd, stderr: "inherit" },
  );
  status = await child.exited;
} finally {
  closeSync(fd);
  if (status !== 0) rmSync(path, { force: true });
}
if (status !== 0) process.exit(status);
console.log(`Backup written to ${path}. Copy it to private storage off this VPS.`);
