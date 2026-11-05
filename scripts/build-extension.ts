import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { zipSync } from "fflate";

const root = resolve(import.meta.dir, "..");
export const extensionFiles = [
  "manifest.json",
  "content.js",
  "background.js",
  "core.js",
  "popup.html",
  "popup.js",
  "popup.css",
  "icon.png",
];
export async function buildExtension() {
  const files: Record<string, Uint8Array> = {};
  for (const name of extensionFiles)
    files[name] = new Uint8Array(
      await Bun.file(resolve(root, "apps/maps-extension", name)).arrayBuffer(),
    );
  const destination = resolve(root, "apps/web/public");
  await mkdir(destination, { recursive: true });
  await Bun.write(resolve(destination, "qublox-maps-extension.zip"), zipSync(files, { level: 6 }));
}
if (import.meta.main) {
  await buildExtension();
  console.log("Packaged Qublox Maps Collector.");
}
