"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { message } from "@/lib/api";
import { Notice } from "@/components/workspace";

export default function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <main className="auth-page">
      <div className="auth-panel">
        <a className="brand" href="/">
          <span className="brand-wordmark">QUBLOX</span>
          <span className="brand-sub">Sales</span>
        </a>

        <h1>Back to the work.</h1>
        <p className="muted">Research a little deeper. Start a better conversation.</p>
        {error && <Notice error>{error}</Notice>}
        <form
          className="form-stack"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const fields = new FormData(event.currentTarget);
            try {
              const email = String(fields.get("email")).trim();
              const password = String(fields.get("password"));
              const result = await authClient.signIn.email({ email, password });
              if (result.error) throw new Error(result.error.message || "Unable to sign in.");
              router.replace("/");
              router.refresh();
            } catch (e) {
              setError(message(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Team email
            <input name="email" type="email" required autoComplete="username" />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={12}
              autoComplete="current-password"
              aria-describedby="access-hint"
            />
          </label>
          <p id="access-hint" className="hint">
            Use the account your workspace administrator created for you.
          </p>
          <button className="primary" disabled={busy}>
            {busy ? "Please wait…" : "Sign in"}
          </button>
        </form>
        <p className="hint">
          Need an account or a password reset? Contact your workspace administrator. Public signup
          is closed.
        </p>
      </div>
    </main>
  );
}
