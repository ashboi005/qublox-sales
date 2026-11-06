"use client";
import { useState } from "react";
import { z } from "zod";
import { teamMemberSchema, teamPasswordSchema } from "@qublox-sales/shared";
import { api, date, message } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { Loading, Notice } from "./workspace";

const listSchema = z.array(teamMemberSchema);
const added = teamPasswordSchema.extend({ reactivated: z.boolean() });

// Admin-only: add teammates, change roles, reset passwords and remove access, without the
// team:* terminal commands. Generated passwords appear once, here, for the admin to share.
export function TeamManager() {
  const team = useResource("/team", listSchema);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      team.reload();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  const showSecret = (value: { email: string; password: string }) => {
    setCopied(false);
    setSecret(value);
  };
  return (
    <section className="entry-panel" aria-labelledby="team-title">
      <div className="section-title">
        <h2 id="team-title">Team</h2>
        <span className="hint">Admins only</span>
      </div>
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      {secret && (
        <div className="secret-box" role="status">
          <p>
            Password for <strong>{secret.email}</strong>. It is shown only now: send it to them
            privately, and ask them to change it under Settings → Your account.
          </p>
          <code>{secret.password}</code>
          <div className="actions">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(
                  `Sign in at ${window.location.origin} with ${secret.email} and this password: ${secret.password}`,
                );
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy sign-in message"}
            </button>
            <button type="button" onClick={() => setSecret(null)}>
              Done
            </button>
          </div>
        </div>
      )}
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fields = new FormData(form);
          void run(async () => {
            const result = await api("/team", added, {
              method: "POST",
              body: {
                name: String(fields.get("name") || ""),
                email: String(fields.get("email") || ""),
                role: String(fields.get("role") || "member"),
              },
            });
            form.reset();
            setNotice(result.reactivated ? "Access restored." : "Teammate added.");
            showSecret(result);
          });
        }}
      >
        <fieldset className="form-grid span-full" disabled={busy}>
          <label>
            Name
            <input name="name" required maxLength={80} placeholder="Mania" />
          </label>
          <label>
            Email
            <input name="email" type="email" required placeholder="mania@gmail.com" />
          </label>
          <label>
            Role
            <select name="role" defaultValue="member">
              <option value="member">Member: sends from their own Gmail</option>
              <option value="admin">Admin: all Gmail senders and team management</option>
            </select>
          </label>
          <div className="span-full">
            <button className="primary">{busy ? "Working…" : "Add teammate"}</button>
          </div>
        </fieldset>
      </form>
      {team.loading && !team.data ? (
        <Loading label="Loading the team…" />
      ) : (
        team.data && (
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">Team members</caption>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Gmail</th>
                  <th>Added</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {team.data.map((m) => (
                  <tr key={m.id} className={m.active ? undefined : "muted"}>
                    <td>
                      {m.name}
                      {m.you && " (you)"}
                      <small>{m.email}</small>
                    </td>
                    <td>
                      {m.active ? (
                        <select
                          aria-label={`Role for ${m.name}`}
                          value={m.role}
                          disabled={busy}
                          onChange={(e) => {
                            const role = e.target.value;
                            void run(async () => {
                              await api(`/team/${m.id}`, teamMemberSchema.partial(), {
                                method: "PATCH",
                                body: { role },
                              });
                              setNotice(
                                `${m.name} is now ${role === "admin" ? "an admin" : "a member"}.`,
                              );
                            });
                          }}
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        "Removed"
                      )}
                    </td>
                    <td>{m.gmail || <span className="muted">Not connected</span>}</td>
                    <td className="muted">{date(m.createdAt)}</td>
                    <td>
                      <div className="actions">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              if (
                                m.active &&
                                !window.confirm(
                                  `Reset ${m.name}'s password? They will be signed out everywhere.`,
                                )
                              )
                                return;
                              showSecret(
                                await api(`/team/${m.id}/reset-password`, teamPasswordSchema, {
                                  method: "POST",
                                  body: {},
                                }),
                              );
                              setNotice(m.active ? "Password reset." : "Access restored.");
                            })
                          }
                        >
                          {m.active ? "Reset password" : "Restore access"}
                        </button>
                        {m.active && !m.you && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                if (
                                  !window.confirm(
                                    `Remove ${m.name}? They are signed out and their Gmail is disconnected. Their leads and history stay.`,
                                  )
                                )
                                  return;
                                await api(`/team/${m.id}`, z.object({ removed: z.string() }), {
                                  method: "DELETE",
                                });
                                setNotice(`${m.name} no longer has access.`);
                              })
                            }
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </section>
  );
}
