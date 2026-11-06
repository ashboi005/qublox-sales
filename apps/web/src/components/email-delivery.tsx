"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
  queueEmailResult,
  outboxListSchema,
  prospectSchema,
  settingsSchema,
  type Prospect,
  type Delivery,
} from "@qublox-sales/shared";
import { api, message, date } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { Notice } from "./workspace";
type Settings = z.infer<typeof settingsSchema>;
const pending = (d: Delivery) => ["queued", "sending", "uncertain"].includes(d.status);
function localTime(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function EmailQueueForm({
  prospects,
  settings,
  onQueued,
  bulk = false,
  disabled = false,
}: {
  prospects: Prospect[];
  settings: Settings;
  onQueued: () => void;
  bulk?: boolean;
  disabled?: boolean;
}) {
  const [senders, setSenders] = useState<string[]>([]),
    [mode, setMode] = useState(bulk ? "spread" : "now"),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const signature = settings.mailboxes.map((m) => m.id).join(",");
  useEffect(() => {
    setSenders(signature ? signature.split(",") : []);
  }, [signature]);
  useEffect(() => {
    setStart(localTime(new Date(Date.now() + 5 * 60000)));
    setEnd(localTime(new Date(Date.now() + 4 * 3600000)));
  }, []);
  return (
    <form
      className="form-stack source"
      onSubmit={async (e) => {
        e.preventDefault();
        const fields = new FormData(e.currentTarget);
        const submittedStart = String(fields.get("startAt") || start);
        const submittedEnd = String(fields.get("endAt") || end);
        setStart(submittedStart);
        setEnd(submittedEnd);
        setBusy(true);
        setError("");
        setNotice("");
        try {
          const result = await api("/deliveries", queueEmailResult, {
            method: "POST",
            body: {
              prospects: prospects.map((p) => ({ id: p.id, version: p.version })),
              senderIds: senders,
              mode,
              ...(mode === "spread"
                ? {
                    startAt: new Date(submittedStart).toISOString(),
                    endAt: new Date(submittedEnd).toISOString(),
                  }
                : {}),
            },
          });
          setNotice(
            `${result.queued} email${result.queued === 1 ? "" : "s"} queued. Sending allowances may postpone the requested time.`,
          );
          onQueued();
        } catch (e) {
          setError(message(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <Notice error>{error}</Notice>}
      {notice && (
        <Notice>
          {notice} <Link href="/outbox">View outbox</Link>
        </Notice>
      )}
      {!settings.emailSendingEnabled && (
        <Notice>
          Gmail sending is disabled. Configure it on the server; manual sending remains available.
        </Notice>
      )}
      <fieldset className="form-stack" disabled={busy || disabled || !settings.emailSendingEnabled}>
        <fieldset>
          <legend>Gmail sender pool</legend>
          {settings.mailboxes.map((m) => (
            <label className="check-label" key={m.id}>
              <input
                type="checkbox"
                checked={senders.includes(m.id)}
                onChange={(e) =>
                  setSenders((old) =>
                    e.target.checked ? [...old, m.id] : old.filter((id) => id !== m.id),
                  )
                }
              />
              {m.email}
            </label>
          ))}
          <p className="hint">
            Select one account, or several to use the next available sender. The team cap stays{" "}
            {settings.dailyLimit}/24 hours across all accounts.
          </p>
        </fieldset>
        <label>
          When to send
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="now">Next available slot</option>
            <option value="spread">Spread across a time window</option>
          </select>
        </label>
        {mode === "spread" && (
          <div className="form-grid">
            <label>
              Window starts (your local time)
              <input
                type="datetime-local"
                defaultValue={start}
                name="startAt"
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </label>
            <label>
              Window ends (your local time)
              <input
                type="datetime-local"
                defaultValue={end}
                name="endAt"
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </label>
          </div>
        )}
        <p className="hint">
          Only the exact approved recipient and message are queued. Editing cancels queued copies.
          Limits can delay sending beyond this window.
        </p>
        <div>
          <button className="primary" disabled={!prospects.length || !senders.length}>
            {busy
              ? "Queueing…"
              : mode === "spread"
                ? `Schedule ${prospects.length === 1 ? "email" : `${prospects.length} emails`}`
                : "Send now"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
export function ProspectDelivery({
  p,
  deliveries,
  settings,
  reload,
  disabled,
}: {
  p: Prospect;
  deliveries: Delivery[];
  settings: Settings;
  reload: () => void;
  disabled: boolean;
}) {
  const active = deliveries.find(pending),
    latest = deliveries[0];
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [queuedSender, setQueuedSender] = useState("");
  async function act(kind: "cancel" | "now" | "sent" | "not_sent") {
    if (!active) return;
    if (
      (kind === "sent" || kind === "not_sent") &&
      !window.confirm(
        kind === "sent"
          ? "Have you checked Gmail Sent and confirmed this exact recipient and message were sent?"
          : "Have you checked Gmail Sent and confirmed this message was not sent? A later retry could duplicate it if this is incorrect.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/prospects/${p.id}/delivery/${kind === "sent" || kind === "not_sent" ? "resolve" : "change"}`,
        prospectSchema,
        {
          method: "POST",
          body: {
            version: p.version,
            deliveryId: active.id,
            ...(kind === "sent" || kind === "not_sent"
              ? { delivered: kind === "sent" }
              : {
                  action: kind,
                  ...(kind === "now" && queuedSender ? { senderIds: [queuedSender] } : {}),
                }),
          },
        },
      );
      reload();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  if (p.channel !== "email") return null;
  return (
    <section className="source" aria-label="Gmail delivery">
      <h3>Gmail delivery</h3>
      {error && <Notice error>{error}</Notice>}
      {active ? (
        <>
          <Notice error={active.status === "uncertain"}>
            {active.status === "queued"
              ? `Queued for ${new Date(active.scheduledAt).toLocaleString()} to ${active.toAddress}.`
              : active.status === "sending"
                ? "Gmail dispatch is in progress. Editing is paused until the result is known."
                : `Acceptance is unknown for ${active.toAddress}. Check Gmail Sent before resolving this item. It will not retry automatically.`}{" "}
            {active.lastError}
          </Notice>
          {active.status === "queued" && (
            <div className="form-stack source">
              <label>
                Sender for the next slot
                <select
                  value={queuedSender}
                  onChange={(e) => setQueuedSender(e.target.value)}
                  disabled={busy || disabled}
                >
                  <option value="">Keep queued sender pool</option>
                  {settings.mailboxes.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.email}
                    </option>
                  ))}
                </select>
              </label>
              <div className="actions">
                <button disabled={busy || disabled} onClick={() => act("now")}>
                  Send in next slot
                </button>
                <button disabled={busy || disabled} onClick={() => act("cancel")}>
                  Cancel queued email
                </button>
              </div>
            </div>
          )}
          {active.status === "uncertain" && (
            <div className="actions">
              <button disabled={busy} onClick={() => act("sent")}>
                Confirmed sent in Gmail
              </button>
              <button disabled={busy} onClick={() => act("not_sent")}>
                Confirmed not sent
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          {latest?.status === "failed" && (
            <Notice error>{latest.lastError} Retrying requires a new explicit send action.</Notice>
          )}
          {latest?.status === "sent" && (
            <p>
              Gmail acceptance recorded {date(latest.sentAt)}. This does not establish inbox
              placement.
            </p>
          )}
          {p.status === "approved" && p.approvalVersion === p.version && (
            <EmailQueueForm
              prospects={[p]}
              settings={settings}
              onQueued={reload}
              disabled={disabled}
            />
          )}
        </>
      )}
    </section>
  );
}
export function BulkEmailQueue({
  records,
  onQueued,
}: {
  records: Prospect[];
  onQueued: () => void;
}) {
  const settings = useResource("/settings", settingsSchema);
  const outbox = useResource("/deliveries", outboxListSchema);
  const [selected, setSelected] = useState<string[]>([]);
  const eligible = records.filter(
    (p) =>
      p.channel === "email" &&
      p.status === "approved" &&
      p.approvalVersion === p.version &&
      !outbox.data?.some((d) => d.prospectId === p.id && pending(d)),
  );
  const chosen = eligible.filter((p) => selected.includes(p.id));
  return (
    <details className="entry-panel">
      <summary>Schedule reviewed emails</summary>
      <p>
        Select approved email drafts from this page. Review and approve each draft before adding it
        to a batch.
      </p>
      {!eligible.length ? (
        <p>
          No approved emails are available to queue on this page. Pending emails are in the outbox.
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={() =>
              setSelected(chosen.length === eligible.length ? [] : eligible.map((p) => p.id))
            }
          >
            {chosen.length === eligible.length
              ? "Clear selection"
              : "Select approved drafts on this page"}
          </button>
          <div className="source">
            {eligible.map((p) => (
              <label className="check-label" key={p.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={(e) =>
                    setSelected((old) =>
                      e.target.checked ? [...old, p.id] : old.filter((id) => id !== p.id),
                    )
                  }
                />
                {p.name} · {p.email}
              </label>
            ))}
          </div>
        </>
      )}
      {settings.error && <Notice error>{settings.error}</Notice>}
      {outbox.error && (
        <Notice error>
          {outbox.error}{" "}
          <button type="button" onClick={outbox.reload}>
            Refresh outbox
          </button>
        </Notice>
      )}
      {settings.data && (
        <EmailQueueForm
          prospects={chosen}
          settings={settings.data}
          onQueued={() => {
            setSelected([]);
            outbox.reload();
            onQueued();
          }}
          disabled={outbox.loading || !!outbox.error}
          bulk
        />
      )}
    </details>
  );
}
