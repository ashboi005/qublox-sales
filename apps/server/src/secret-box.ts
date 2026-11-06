import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// AES-256-GCM with a key derived from BETTER_AUTH_SECRET. Rotating that secret makes
// stored Gmail App Passwords unreadable; teammates then reconnect from Settings.
export function secretBox(masterSecret: string) {
  if (masterSecret.length < 32)
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters to store mailboxes.");
  const key = Buffer.from(
    hkdfSync("sha256", masterSecret, "qublox-mailbox", "gmail-app-password-v1", 32),
  );
  return {
    seal(plain: string) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      return ["v1", ...[iv, cipher.getAuthTag(), body].map((p) => p.toString("base64url"))].join(
        ".",
      );
    },
    open(sealed: string) {
      const [version, iv, tag, body] = sealed.split(".");
      if (version !== "v1" || !iv || !tag || !body)
        throw new Error("Stored mailbox secret has an unknown format.");
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(body, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}
