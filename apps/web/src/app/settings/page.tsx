"use client";
import { settingsSchema } from "@qublox-sales/shared";
import { GmailSender } from "@/components/gmail-sender";
import { Workspace, Loading, Notice, Status } from "@/components/workspace";
import { useResource } from "@/lib/use-resource";

export default function SettingsPage() {
  return (
    <Workspace>
      <Settings />
    </Workspace>
  );
}
function Settings() {
  const settings = useResource("/settings", settingsSchema);
  const s = settings.data;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Keep the operation small.</h1>
          <p>Know what is connected, what it costs, and what still needs your review.</p>
        </div>
        <button onClick={settings.reload}>Refresh status</button>
      </div>
      {settings.error && <Notice error>{settings.error}</Notice>}
      {s && <GmailSender settings={s} onChange={settings.reload} />}
      {settings.loading ? (
        <Loading label="Checking workspace settings…" />
      ) : (
        s && (
          <dl className="settings-list">
            <div>
              <dt>Team access</dt>
              <dd>
                {s.authMode}
                <p>
                  Public signup is closed. Your administrator creates accounts privately; only
                  active database members can access the workspace.
                </p>
              </dd>
            </div>
            <div>
              <dt>Website research</dt>
              <dd>
                <Status value="ready" />
                <p>
                  Public website text, contact pages, visible contact details, social links, and
                  platform clues. Research is HTTP-based; pages requiring JavaScript or login need
                  your manual observations.
                </p>
              </dd>
            </div>
            <div>
              <dt>AI scoring &amp; drafting</dt>
              <dd>
                <Status value={s.aiConfigured ? "configured" : "not connected"} />
                <p>
                  {s.aiConfigured
                    ? `${s.provider === "groq" ? "Groq" : "Gemini"} · ${s.model}. Every draft still needs your approval.`
                    : "Manual drafting is available. To enable generation, the server administrator must set a Groq or Gemini API key and select the provider."}
                </p>
              </dd>
            </div>
            <div>
              <dt>Monthly AI estimate</dt>
              <dd>
                ${s.monthSpent.toFixed(3)} / ${s.monthlyBudget.toFixed(2)} local estimate allowance
                <p>
                  UTC calendar month, estimated at paid list prices even on a free tier. Held
                  allowances cover requests with unknown outcomes. This is not your provider bill;
                  configure provider spending controls separately.
                </p>
              </dd>
            </div>
            <div>
              <dt>AI request pacing</dt>
              <dd>
                {s.requestsPerMinute}/minute · {s.requestsPerDay}/rolling 24 hours
                <p>
                  {s.tokensPerMinute.toLocaleString()} tokens/minute and{" "}
                  {s.tokensPerDay.toLocaleString()} tokens/rolling 24 hours, reserved
                  conservatively. Drafts wait when a limit is reached. Provider cooldowns survive
                  worker restarts. Account quotas and usage from other apps can be lower than these
                  settings.
                </p>
              </dd>
            </div>
            <div>
              <dt>Contact limit</dt>
              <dd>
                {s.dailyLimit} contacts/send attempts per rolling 24 hours
                <p>
                  Shared by the team and all Gmail accounts. In-flight, uncertain and rejected SMTP
                  attempts reserve an allowance too. This is a workload limit; it does not guarantee
                  inbox delivery or control what you send outside this workspace.
                </p>
              </dd>
            </div>
            <div>
              <dt>Email delivery</dt>
              <dd>
                {!s.sendingSwitch
                  ? "Switched off on the server · manual sending available"
                  : s.emailSendingEnabled
                    ? "Gmail sending enabled"
                    : "No Gmail sender connected yet"}
                <p>
                  Approve the exact draft, then send now or schedule a reviewed batch from a
                  connected Gmail.{" "}
                  {s.role === "admin"
                    ? "As an admin you can send from every teammate's connected Gmail."
                    : "You can send from your own connected Gmail; an admin can use the whole team's."}{" "}
                  Gmail accepting a message does not guarantee inbox placement.
                </p>
              </dd>
            </div>
            <div>
              <dt>Email verification</dt>
              <dd>
                Not connected
                <p>
                  Finding an email on a website does not establish that the mailbox accepts mail.
                  Extracted and manually added addresses remain unverified.
                </p>
              </dd>
            </div>
            <div>
              <dt>Instagram</dt>
              <dd>
                Manual DM
                <p>
                  Review the public profile yourself and add relevant evidence. No automated login,
                  scraping, or messaging.
                </p>
              </dd>
            </div>
            <div>
              <dt>Do-not-contact list</dt>
              <dd>
                Enforced across the workspace
                <p>
                  Suppression stops approvals, queued research, and follow-up reminders for the
                  matching domain or email.
                </p>
              </dd>
            </div>
          </dl>
        )
      )}
    </>
  );
}
