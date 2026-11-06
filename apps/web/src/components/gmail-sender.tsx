"use client";
import { useState } from "react";
import { z } from "zod";
import { mailboxSchema, settingsSchema } from "@qublox-sales/shared";
import { api, date, message } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { External, Notice } from "./workspace";

type Settings = z.infer<typeof settingsSchema>;
const mailboxList = z.array(mailboxSchema);

export function GmailSender({ settings, onChange }: { settings: Settings; onChange: () => void }) {
  const session = authClient.useSession();
  const mine = settings.mailboxes.find((m) => m.mine);
  const team = settings.mailboxes.filter((m) => !m.mine);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const run = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(success);
      setEditing(false);
      onChange();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = (id: string, label: string) => {
    if (!window.confirm(`Disconnect ${label}? Queued emails that only use it will not send.`))
      return;
    void run(
      () => api(`/mailboxes/${id}`, mailboxList, { method: "DELETE" }),
      "Gmail sender disconnected.",
    );
  };
  return (
    <section className="entry-panel" aria-labelledby="gmail-sender-title">
      <div className="section-title">
        <h2 id="gmail-sender-title">Your Gmail sender</h2>
        {settings.role === "admin" && <span className="status status-approved">admin</span>}
      </div>
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      {mine && !editing ? (
        <div className="form-stack">
          <p>
            Sending as <strong>{mine.displayName}</strong> ({mine.email}). Emails you send say
            &ldquo;{mine.displayName} here from {settings.companyName}&rdquo;. Login checked{" "}
            {date(mine.verifiedAt)}.
          </p>
          <div className="actions">
            <button onClick={() => setEditing(true)} disabled={busy}>
              Update App Password or name
            </button>
            <button
              className="text-button danger"
              onClick={() => remove(mine.id, mine.email)}
              disabled={busy}
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <>
          <ol className="setup-steps">
            <li>
              Turn on 2-Step Verification for your Gmail account:{" "}
              <External href="https://myaccount.google.com/signinoptions/twosv">
                Google security settings
              </External>
              .
            </li>
            <li>
              Create an App Password named &ldquo;Qublox&rdquo;:{" "}
              <External href="https://myaccount.google.com/apppasswords">App Passwords</External>.
              Google shows 16 letters once. Copy them.
            </li>
            <li>
              Paste them below with your Gmail address. We log in once to check it, without sending
              anything, and store it encrypted. Nobody, including admins, can read it back.
            </li>
          </ol>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fields = new FormData(form);
              void run(async () => {
                await api("/mailboxes/me", mailboxList, {
                  method: "PUT",
                  body: {
                    email: String(fields.get("email") || ""),
                    displayName: String(fields.get("displayName") || ""),
                    appPassword: String(fields.get("appPassword") || ""),
                  },
                });
                form.reset();
              }, "Gmail connected. You can now send approved emails from it.");
            }}
          >
            <fieldset className="form-stack" disabled={busy}>
              <label>
                Gmail address
                <input
                  name="email"
                  type="email"
                  required
                  defaultValue={mine?.email || ""}
                  placeholder="you@gmail.com"
                  autoComplete="off"
                />
              </label>
              <label>
                Name in your emails
                <input
                  name="displayName"
                  required
                  maxLength={60}
                  defaultValue={mine?.displayName || session.data?.user.name.split(/\s+/)[0] || ""}
                  placeholder="Mania"
                />
                <span className="hint">
                  Recipients see &ldquo;Name from {settings.companyName}&rdquo; and the greeting
                  uses this name.
                </span>
              </label>
              <label>
                App Password
                <input
                  name="appPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="abcd efgh ijkl mnop"
                />
              </label>
              <div className="actions">
                <button className="primary">
                  {busy ? "Checking with Gmail…" : "Connect Gmail"}
                </button>
                {editing && (
                  <button type="button" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                )}
              </div>
            </fieldset>
          </form>
        </>
      )}
      {settings.role === "admin" && (
        <div className="source">
          <h3>Team senders</h3>
          {team.length ? (
            <ul className="sender-list">
              {team.map((m) => (
                <li key={m.id}>
                  <span>
                    <strong>{m.displayName}</strong> · {m.email}
                    <small> · {m.ownerName}</small>
                  </span>
                  <button
                    className="text-button danger"
                    onClick={() => remove(m.id, m.email)}
                    disabled={busy}
                  >
                    Disconnect
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">No teammate has connected a Gmail yet.</p>
          )}
          <p className="hint">
            Teammates connect their own Gmail here after signing in. Add people with{" "}
            <code>bun run team:add</code> and make someone an admin with{" "}
            <code>bun run team:role --email … --role admin</code>.
          </p>
        </div>
      )}
    </section>
  );
}
