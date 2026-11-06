"use client";
import { ProspectDelivery } from "./email-delivery";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, Mail, RefreshCw, Search } from "lucide-react";
import {
  prospectDetailSchema,
  prospectSchema,
  prospectInput,
  settingsSchema,
  type Campaign,
  type DraftInput,
  type Prospect,
} from "@qublox-sales/shared";
import { api, date, message, time } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { campaignsSchema } from "./prospect-entry";
import { External, Loading, Notice, Status } from "./workspace";

type Action = "approve" | "contacted" | "replied" | "close" | "skip" | "suppress" | "followed_up";
type Write = (suffix: string, body: unknown, method?: string, success?: string) => Promise<boolean>;
const terminal = new Set(["contacted", "replied", "closed", "suppressed"]);
const active = (p: Prospect) =>
  !terminal.has(p.status) &&
  [p.researchStatus, p.draftStatus].some((s) => s === "queued" || s === "running");

export function ProspectReview({ id }: { id: string }) {
  const detail = useResource(`/prospects/${id}`, prospectDetailSchema);
  const offers = useResource("/campaigns", campaignsSchema);
  const settings = useResource("/settings", settingsSchema);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<"contact" | "evidence" | "draft" | null>(null);
  const [editEpoch, setEditEpoch] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const p = detail.data?.prospect;
  const deliveries = detail.data?.deliveries || [];
  const pendingDelivery = deliveries.find((d) =>
    ["queued", "sending", "uncertain"].includes(d.status),
  );
  const deliveryLocked =
    pendingDelivery?.status === "sending" || pendingDelivery?.status === "uncertain";
  useEffect(() => {
    if (p && !active(p))
      setNotice((value) =>
        value.startsWith("Website research queued.") || value.startsWith("Draft queued.")
          ? ""
          : value,
      );
  }, [p]);
  useEffect(() => {
    if (!p || (!active(p) && !pendingDelivery) || dirty) return;
    const interval = setInterval(detail.reload, 2500);
    return () => clearInterval(interval);
  }, [p, dirty, pendingDelivery, detail.reload]);
  const write: Write = async (suffix, body, method = "POST", success = "Saved.") => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const prospect = await api(`/prospects/${id}${suffix}`, prospectSchema, { method, body });
      setDirty(false);
      setEditing(null);
      detail.setData((previous) => ({
        prospect,
        activities: previous?.activities || [],
        deliveries: previous?.deliveries || [],
      }));
      detail.reload();
      setNotice(success);
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const action = async (value: Action, confirm?: string) => {
    if (!p || (confirm && !window.confirm(confirm))) return;
    await write(
      "/actions",
      { version: p.version, action: value },
      "POST",
      value === "approve"
        ? "This version is approved. Choose Gmail delivery or send it manually."
        : value === "contacted" || value === "followed_up"
          ? "Manual contact recorded."
          : "Activity recorded.",
    );
  };
  if (!p)
    return detail.error ? (
      <Notice error>
        {detail.error} <button onClick={detail.reload}>Try again</button>
      </Notice>
    ) : (
      <Loading label="Opening prospect…" />
    );
  const editable = !terminal.has(p.status);
  const working = active(p) || deliveryLocked;
  const campaign = offers.data?.find((c) => c.id === p.campaignId);
  const approved = p.status === "approved" && p.approvalVersion === p.version;
  const canApprove =
    !dirty &&
    !working &&
    p.status === "review" &&
    Boolean(
      p.score &&
        p.draftBody &&
        p.draftEvidenceIds.length &&
        campaign?.version === p.draftCampaignVersion &&
        (p.channel === "email" ? p.email && p.draftSubject : p.instagram),
    );
  return (
    <>
      <Link href="/" className="back-link">
        <ArrowLeft size={15} />
        All prospects
      </Link>
      <div className="page-head">
        <div>
          <h1>{p.name}</h1>
          <p>
            <External href={p.website}>{p.domain}</External> <span aria-hidden="true"> · </span>{" "}
            <Status value={p.status} />
          </p>
        </div>
        <div className="actions">
          <button
            disabled={busy || dirty || working || !editable}
            onClick={() =>
              write(
                "/jobs",
                { kind: "research", version: p.version },
                "POST",
                "Website research queued. This screen will update when it finishes.",
              )
            }
          >
            <Search size={16} />
            {p.research ? "Research again" : "Research website"}
          </button>
          <button
            disabled={
              busy ||
              dirty ||
              working ||
              !editable ||
              !settings.data?.aiConfigured ||
              !p.evidence.length ||
              !p.campaignId
            }
            onClick={() =>
              write(
                "/jobs",
                { kind: "draft", version: p.version },
                "POST",
                "Draft queued. Review its sources before approving.",
              )
            }
          >
            <RefreshCw size={16} />
            {p.draftBody ? "Regenerate draft" : "Generate draft"}
          </button>
        </div>
      </div>
      {error && (
        <Notice error>
          {error}{" "}
          <button
            disabled={busy}
            onClick={() => {
              if (!dirty || window.confirm("Discard unsaved edits and reload this prospect?")) {
                setDirty(false);
                setEditing(null);
                setEditEpoch((e) => e + 1);
                detail.reload();
              }
            }}
          >
            Reload latest
          </button>
        </Notice>
      )}
      {detail.error && (
        <Notice error>
          {detail.error} <button onClick={detail.reload}>Retry</button>
        </Notice>
      )}
      {(offers.error || settings.error) && (
        <Notice error>
          {offers.error || settings.error}{" "}
          <button
            onClick={() => {
              offers.reload();
              settings.reload();
            }}
          >
            Retry setup
          </button>
        </Notice>
      )}
      {notice && <Notice>{notice}</Notice>}
      {active(p) && (
        <Notice>
          <span role="status">
            {p.researchStatus === "queued" || p.researchStatus === "running"
              ? "Website research"
              : "Draft generation"}{" "}
            is{" "}
            {p.researchStatus === "running" || p.draftStatus === "running" ? "running" : "queued"}.
            Editing is paused until it finishes.
          </span>
          {(p.researchStatus === "queued" || p.draftStatus === "queued") && (
            <button
              disabled={busy}
              onClick={() =>
                write(
                  "/jobs/cancel",
                  { version: p.version },
                  "POST",
                  "Queued work cancelled. You can edit manually.",
                )
              }
            >
              Cancel queued work
            </button>
          )}
        </Notice>
      )}
      {p.lastError && <Notice error>{p.lastError}</Notice>}
      {settings.data && !settings.data.aiConfigured && editable && (
        <Notice>
          AI drafting is not connected yet. You can research websites and write evidence-backed
          drafts manually. <Link href="/settings">View setup status</Link>.
        </Notice>
      )}
      <details
        className="entry-panel"
        open={!p.campaignId || (p.channel === "email" ? !p.email : !p.instagram)}
      >
        <summary>Recipient &amp; offer · {campaign?.name || "Choose an offer"}</summary>
        <div className="source">
          <ContactEditor
            key={`contact-${p.version}-${editEpoch}`}
            prospect={p}
            campaigns={offers.data || []}
            disabled={busy || working || !editable || (editing !== null && editing !== "contact")}
            write={write}
            onDirty={() => {
              setDirty(true);
              setEditing("contact");
            }}
          />
        </div>
      </details>
      <div className="review-grid">
        <section className="review-pane" aria-label="Prospect evidence">
          <div className="pane-heading">
            <h2>01 / The evidence</h2>
            <span className="hint">
              {p.evidence.length} {p.evidence.length === 1 ? "source" : "sources"}
            </span>
          </div>
          <dl className="facts">
            <dt>Platform</dt>
            <dd>{p.research?.platform || "Not researched"}</dd>
            <dt>Email</dt>
            <dd>
              {p.email || "Not found"}
              {p.email && (
                <span className="hint">
                  {" "}
                  ·{" "}
                  {p.verificationStatus === "valid"
                    ? "Mailbox check passed; inbox delivery is not guaranteed"
                    : "Unverified — no mailbox check performed"}
                </span>
              )}
            </dd>
            <dt>Phone</dt>
            <dd>{p.phone || "Not found"}</dd>
            <dt>Instagram</dt>
            <dd>
              {p.instagram ? <External href={p.instagram}>View profile</External> : "Not found"}
            </dd>
            {p.sourceUrl && (
              <>
                <dt>Lead source</dt>
                <dd>
                  <External href={p.sourceUrl}>Original listing</External>
                  {p.sourceCapturedAt && (
                    <span className="hint"> · {date(p.sourceCapturedAt)}</span>
                  )}
                </dd>
              </>
            )}
          </dl>
          {p.research?.warnings.map((warning, i) => (
            <Notice key={i}>{warning}</Notice>
          ))}
          {!p.evidence.length && (
            <div className="empty">
              <h3>No evidence yet.</h3>
              <p>
                Research the website or add an observation from a page you reviewed yourself. A
                useful hook needs a source.
              </p>
            </div>
          )}
          {p.evidence.map((e, i) => (
            <article className="source" key={e.id}>
              <div className="source-head">
                <span className="source-label">
                  Source {String(i + 1).padStart(2, "0")} / {e.kind}
                </span>
                <External href={e.url}>Open page</External>
              </div>
              <details open={e.text.length < 650}>
                <summary>{e.title || "Website observation"}</summary>
                <p>{e.text}</p>
              </details>
              <div className="source-meta">
                <span>Captured {time(e.retrievedAt)}</span>
                {p.draftEvidenceIds.includes(e.id) && <span>Used in draft</span>}
              </div>
            </article>
          ))}
          {editable && (
            <details className="source">
              <summary>Add a source observation</summary>
              <EvidenceEditor
                key={`evidence-${p.version}-${editEpoch}`}
                prospect={p}
                disabled={busy || working || (editing !== null && editing !== "evidence")}
                write={write}
                onDirty={() => {
                  setDirty(true);
                  setEditing("evidence");
                }}
              />
            </details>
          )}
        </section>
        <section className="review-pane draft-pane" aria-label="Outreach draft">
          <div className="pane-heading">
            <h2>02 / The message</h2>
            <span className="hint">
              {p.score === null ? "Not scored" : `Signal ${p.score} / 3`}
            </span>
          </div>
          <DraftEditor
            key={`draft-${p.version}-${editEpoch}`}
            prospect={p}
            disabled={busy || working || !editable || (editing !== null && editing !== "draft")}
            write={write}
            onDirty={() => {
              setDirty(true);
              setEditing("draft");
            }}
          />
          {dirty && (
            <Notice>
              Unsaved changes in{" "}
              {editing === "contact"
                ? "recipient & offer"
                : editing === "evidence"
                  ? "source observation"
                  : "the draft"}
              . Save that form before continuing.{" "}
              <button
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Discard unsaved edits?")) {
                    setDirty(false);
                    setEditing(null);
                    setEditEpoch((e) => e + 1);
                  }
                }}
              >
                Discard edits
              </button>
            </Notice>
          )}
          {editable && (
            <div className="actions">
              <button
                className="primary"
                disabled={busy || !canApprove}
                onClick={() => action("approve")}
              >
                <Check size={17} />
                Approve saved version
              </button>
              <button
                disabled={busy || dirty || working}
                onClick={() =>
                  action("skip", "Skip this prospect? Its approval and follow-up will be cleared.")
                }
              >
                Skip prospect
              </button>
            </div>
          )}
          {p.draftBody && p.status === "review" && p.draftCampaignVersion !== campaign?.version && (
            <Notice>
              The offer changed. Review and save this draft against the current offer before
              approving it.
            </Notice>
          )}
          {settings.data && (
            <ProspectDelivery
              p={p}
              deliveries={deliveries}
              settings={settings.data}
              reload={detail.reload}
              disabled={busy || dirty || active(p)}
            />
          )}
          {approved && !dirty && !pendingDelivery && (
            <div className="source">
              <h3>Ready for your manual send.</h3>
              <p className="muted">
                Approval saves this version. Record the contact only after you have sent it.
              </p>
              <div className="actions source">
                {p.channel === "email" && p.email ? (
                  <a
                    className="button"
                    href={`mailto:${encodeURIComponent(p.email)}?subject=${encodeURIComponent(p.draftSubject)}&body=${encodeURIComponent(p.draftBody)}`}
                  >
                    <Mail size={16} />
                    Open email app
                  </a>
                ) : (
                  p.instagram && <External href={p.instagram}>Open Instagram</External>
                )}
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(p.draftBody);
                      setNotice("Message copied.");
                    } catch {
                      setError(
                        "Clipboard access is unavailable. Select and copy the message text.",
                      );
                    }
                  }}
                >
                  <Copy size={16} />
                  Copy message
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    action(
                      "contacted",
                      "Have you sent this exact approved message manually? This records one contact and schedules a follow-up in seven days.",
                    )
                  }
                >
                  Mark as sent
                </button>
              </div>
            </div>
          )}
          {p.status === "contacted" && (
            <div className="source">
              <h3>Conversation in progress.</h3>
              <p className="muted">
                Contact recorded {date(p.contactedAt)}.{" "}
                {p.followUpAt
                  ? `Follow-up due ${date(p.followUpAt)}.`
                  : "No further follow-up scheduled."}
              </p>
              <div className="actions source">
                <button disabled={busy} onClick={() => action("replied")}>
                  Mark replied
                </button>
                {p.followUpAt && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      action(
                        "followed_up",
                        "Have you sent a manual follow-up? This records a contact and clears this reminder.",
                      )
                    }
                  >
                    Follow-up sent
                  </button>
                )}
                <button
                  disabled={busy}
                  onClick={() =>
                    action("close", "Close this conversation and clear the follow-up reminder?")
                  }
                >
                  Close conversation
                </button>
              </div>
            </div>
          )}
          {p.status !== "suppressed" && (
            <div className="source">
              <button
                className="text-button danger"
                disabled={busy}
                onClick={() =>
                  action(
                    "suppress",
                    "Add this business and its email to the do-not-contact list? Unsaved edits will be discarded. Research jobs, approval, and follow-ups will stop.",
                  )
                }
              >
                Add to do-not-contact list
              </button>
            </div>
          )}
        </section>
      </div>
      <section className="audit">
        <h2>Activity</h2>
        <ol>
          {detail.data?.activities.map((a) => (
            <li key={a.id}>
              <time dateTime={a.createdAt}>{time(a.createdAt)}</time>
              <div>
                {a.detail}
                <small>
                  {a.actor} · {a.kind.replaceAll("_", " ")}
                </small>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function ContactEditor({
  prospect: p,
  campaigns,
  disabled,
  write,
  onDirty,
}: {
  prospect: Prospect;
  campaigns: Campaign[];
  disabled: boolean;
  write: Write;
  onDirty: () => void;
}) {
  const [error, setError] = useState("");
  return (
    <form
      className="form-stack"
      onChange={onDirty}
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        try {
          const fields = Object.fromEntries(new FormData(event.currentTarget));
          const body = prospectInput.parse({
            ...p,
            ...fields,
            campaignId: fields.campaignId || null,
          });
          await write(
            "",
            { ...body, version: p.version },
            "PATCH",
            "Recipient and offer saved. Review the draft again before approving.",
          );
        } catch (e) {
          setError(message(e));
        }
      }}
    >
      <fieldset disabled={disabled} className="form-grid">
        <label>
          Business name
          <input name="name" defaultValue={p.name} required maxLength={160} />
        </label>
        <label>
          Website
          <input name="website" defaultValue={p.website} required maxLength={2048} />
        </label>
        <label>
          Contact name
          <input name="contactName" defaultValue={p.contactName} maxLength={100} />
        </label>
        <label>
          Email
          <input name="email" type="email" defaultValue={p.email || ""} maxLength={254} />
        </label>
        <label>
          Channel
          <select name="channel" defaultValue={p.channel}>
            <option value="email">Email (manual send)</option>
            <option value="instagram">Instagram (manual DM)</option>
          </select>
        </label>
        <label>
          Instagram profile URL
          <input
            name="instagram"
            type="url"
            defaultValue={p.instagram}
            maxLength={2048}
            placeholder="https://www.instagram.com/brand/"
          />
        </label>
        <label>
          Offer
          <select name="campaignId" defaultValue={p.campaignId || ""}>
            <option value="">Choose an offer</option>
            {campaigns.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Country
          <input name="country" defaultValue={p.country} maxLength={100} />
        </label>
        <label className="span-full">
          Your notes
          <textarea name="notes" defaultValue={p.notes} maxLength={5000} rows={2} />
        </label>
        <p className="hint span-full">
          Changes clear approval. Changing the website also clears its research and draft.
        </p>
        <div className="span-full">
          <button>Save recipient &amp; offer</button>
        </div>
      </fieldset>
      {error && <Notice error>{error}</Notice>}
    </form>
  );
}
function EvidenceEditor({
  prospect: p,
  disabled,
  write,
  onDirty,
}: {
  prospect: Prospect;
  disabled: boolean;
  write: Write;
  onDirty: () => void;
}) {
  return (
    <form
      className="form-stack source"
      onChange={onDirty}
      onSubmit={async (event) => {
        event.preventDefault();
        const fields = Object.fromEntries(new FormData(event.currentTarget));
        await write(
          "/evidence",
          { ...fields, version: p.version },
          "POST",
          "Source observation saved.",
        );
      }}
    >
      <fieldset className="form-stack" disabled={disabled}>
        <label>
          Source page URL
          <input name="url" type="url" required defaultValue={p.website} maxLength={2048} />
        </label>
        <label>
          Observation title
          <input name="title" required maxLength={200} />
        </label>
        <label>
          What did you see?
          <textarea
            name="text"
            required
            maxLength={3000}
            rows={4}
            placeholder="Record an observable fact and enough context to support the message."
          />
        </label>
        <div>
          <button>Add evidence</button>
        </div>
      </fieldset>
    </form>
  );
}
function DraftEditor({
  prospect: p,
  disabled,
  write,
  onDirty,
}: {
  prospect: Prospect;
  disabled: boolean;
  write: Write;
  onDirty: () => void;
}) {
  const [score, setScore] = useState(p.score ?? 1);
  return (
    <form
      className="form-stack"
      onChange={onDirty}
      onSubmit={async (event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const body: DraftInput = {
          score,
          rationale: String(fields.get("rationale") || ""),
          subject: String(fields.get("subject") || ""),
          body: String(fields.get("body") || ""),
          evidenceIds: fields.getAll("evidenceIds").map(String),
        };
        await write(
          "/draft",
          { ...body, version: p.version },
          "PUT",
          score === 0
            ? "No useful angle. This prospect has been skipped."
            : "Draft saved. Check the recipient and sources, then approve this version.",
        );
      }}
    >
      <fieldset className="form-stack" disabled={disabled}>
        <label>
          Personalization signal
          <select value={score} onChange={(e) => setScore(Number(e.target.value))}>
            <option value={0}>0: No useful hook (skip)</option>
            <option value={1}>1: A relevant, factual observation</option>
            <option value={2}>2: A specific problem or opportunity</option>
            <option value={3}>3: A strong, timely reason to talk</option>
          </select>
        </label>
        <label>
          Why this angle?
          <textarea
            name="rationale"
            defaultValue={p.rationale}
            required
            maxLength={1200}
            rows={2}
            placeholder="Explain how the evidence connects to your offer."
          />
        </label>
        {score > 0 && (
          <>
            {p.channel === "email" && (
              <label>
                Subject
                <input name="subject" defaultValue={p.draftSubject} required maxLength={180} />
              </label>
            )}
            <label>
              {p.channel === "email" ? "Email message" : "Instagram message"}
              <textarea
                name="body"
                className="draft-body"
                defaultValue={p.draftBody}
                required
                maxLength={5000}
                placeholder="Write a short, useful message grounded in the evidence on the left."
              />
            </label>
            <fieldset>
              <legend>Supporting sources</legend>
              {!p.evidence.length && (
                <p className="hint">Add evidence before saving a positive-score draft.</p>
              )}
              {p.evidence.map((e, i) => (
                <label className="check-label" key={e.id}>
                  <input
                    type="checkbox"
                    name="evidenceIds"
                    value={e.id}
                    defaultChecked={p.draftEvidenceIds.includes(e.id)}
                  />
                  <span>
                    {String(i + 1).padStart(2, "0")} · {e.title}
                  </span>
                </label>
              ))}
            </fieldset>
          </>
        )}
        {!terminal.has(p.status) && (
          <div>
            <button disabled={disabled || !p.campaignId}>
              {score === 0 ? "Save & skip prospect" : "Save draft"}
            </button>
            <p className="hint">
              {p.campaignId
                ? "Saving clears approval and cancels queued copies. Review and approve again before sending."
                : "Choose and save an offer above before drafting."}
            </p>
          </div>
        )}
        {p.draftModel && (
          <p className="hint">
            {p.draftModel.toLowerCase() === "manual"
              ? "Manually edited"
              : `Generated with ${p.draftModel}`}{" "}
            · Human review required
          </p>
        )}
      </fieldset>
    </form>
  );
}
