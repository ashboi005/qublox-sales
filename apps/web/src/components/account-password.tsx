"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Notice } from "./workspace";

// Every role can replace the generated password with their own.
export function AccountPassword({ role }: { role: "admin" | "member" }) {
  const session = authClient.useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const user = session.data?.user;
  return (
    <section className="entry-panel" aria-labelledby="account-title">
      <div className="section-title">
        <h2 id="account-title">Your account</h2>
        {!open && (
          <button type="button" onClick={() => setOpen(true)}>
            Change password
          </button>
        )}
      </div>
      <dl className="summary-row">
        <div>
          <dt>Name</dt>
          <dd>{user?.name || "…"}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{user?.email || "…"}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>
            {role === "admin"
              ? "Admin: can use every Gmail sender and manage the team"
              : "Member: sends from your own Gmail"}
          </dd>
        </div>
      </dl>
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      {open && (
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fields = new FormData(form);
            const currentPassword = String(fields.get("currentPassword") || "");
            const newPassword = String(fields.get("newPassword") || "");
            setError("");
            setNotice("");
            if (newPassword !== fields.get("confirmPassword"))
              return setError("The two new passwords do not match.");
            if (newPassword.length < 12) return setError("Use at least 12 characters.");
            setBusy(true);
            try {
              const result = await authClient.changePassword({
                currentPassword,
                newPassword,
                revokeOtherSessions: true,
              });
              if (result.error)
                throw new Error(
                  result.error.status === 400
                    ? "Your current password is not right, or the new one is too short."
                    : result.error.message || "Could not change the password.",
                );
              form.reset();
              setOpen(false);
              setNotice(
                "Password changed. You stay signed in here; other devices were signed out.",
              );
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not change the password.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset className="form-grid span-full" disabled={busy}>
            <label>
              Current password
              <input
                name="currentPassword"
                type="password"
                required
                autoComplete="current-password"
              />
              <span className="hint">The one you signed in with, including a generated one.</span>
            </label>
            <label>
              New password
              <input
                name="newPassword"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
              <span className="hint">At least 12 characters. A short phrase works well.</span>
            </label>
            <label>
              Repeat new password
              <input
                name="confirmPassword"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <div className="span-full actions">
              <button className="primary">{busy ? "Changing…" : "Save new password"}</button>
              <button type="button" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
