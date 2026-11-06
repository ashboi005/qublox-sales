"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { leadSearchSchema, settingsSchema, type Campaign } from "@qublox-sales/shared";
import { api, message, time } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { Notice } from "./workspace";

const history = z.array(leadSearchSchema);

// The in-portal lead finder: niche + place in, prospects out. With an offer selected,
// every new lead is then researched and drafted automatically.
export function FindLeads({
  campaigns,
  onDone,
  onClose,
}: {
  campaigns: Campaign[];
  onDone: () => void;
  onClose: () => void;
}) {
  const settings = useResource("/settings", settingsSchema);
  const recent = useResource("/lead-searches", history);
  const [campaignId, setCampaignId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [last, setLast] = useState<z.infer<typeof leadSearchSchema> | null>(null);
  useEffect(() => {
    if (!campaignId && campaigns[0]) setCampaignId(campaigns[0].id);
  }, [campaigns, campaignId]);
  const s = settings.data;
  const google = s?.leadSearchProvider === "google";
  return (
    <section className="entry-panel" aria-labelledby="find-leads-title">
      <div className="section-title">
        <h2 id="find-leads-title">Find leads</h2>
        <button type="button" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>
      <p>
        Type the kind of business and the place. Qublox finds them, skips ones you already have or
        should not contact, and adds the rest.{" "}
        {s?.autoPipeline
          ? "With an offer chosen, each one is then researched and drafted automatically for your review."
          : "Research and drafting then start when you click them."}
      </p>
      {s && (
        <p className="hint">
          {google
            ? `Source: Google Places · ${s.placesRequestsThisMonth} of ${s.placesMonthlyLimit} searches used this month (20 businesses per search).`
            : "Source: OpenStreetMap (free, no key). Few Indian businesses there list a phone or website, so expect only a handful of usable leads. Add a Google Places key on the server for full results."}
        </p>
      )}
      {error && <Notice error>{error}</Notice>}
      {last && (
        <Notice>
          Found {last.found} · added {last.added}
          {last.duplicates ? ` · ${last.duplicates} already in your list` : ""}
          {last.skipped ? ` · ${last.skipped} skipped (no website, phone or email)` : ""}.{" "}
          {last.added > 0 && (
            <>
              They are in the list below
              {s?.autoPipeline && last.campaignId ? " and research has started" : ""}. Drafts appear
              under the To review button.
            </>
          )}
        </Notice>
      )}
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const fields = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          setLast(null);
          try {
            const result = await api("/lead-searches", leadSearchSchema, {
              method: "POST",
              body: {
                what: String(fields.get("what") || ""),
                where: String(fields.get("where") || ""),
                limit: Number(fields.get("limit") || 20),
                campaignId: campaignId || null,
              },
            });
            setLast(result);
            recent.reload();
            settings.reload();
            onDone();
          } catch (err) {
            setError(message(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset className="form-grid span-full" disabled={busy}>
          <label>
            What kind of business?
            <input
              name="what"
              required
              minLength={2}
              maxLength={100}
              placeholder="clothing stores"
            />
          </label>
          <label>
            Where?
            <input name="where" required minLength={2} maxLength={100} placeholder="Amritsar" />
          </label>
          <label>
            How many
            <select name="limit" defaultValue="20">
              <option value="20">Up to 20</option>
              <option value="40">Up to 40</option>
              <option value="60">Up to 60</option>
            </select>
          </label>
          <label>
            Offer
            <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">No offer (add only, no automation)</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="span-full">
            <button className="primary">{busy ? "Searching…" : "Find leads"}</button>
          </div>
        </fieldset>
      </form>
      {recent.data && recent.data.length > 0 && (
        <details className="source">
          <summary>Recent searches</summary>
          <ul className="sender-list">
            {recent.data.map((r) => (
              <li key={r.id}>
                <span>
                  <strong>
                    {r.what} in {r.location}
                  </strong>{" "}
                  <small>
                    · {r.error ? r.error : `${r.added} added of ${r.found} found`} ·{" "}
                    {r.provider === "google" ? "Google" : "OpenStreetMap"} · {r.actor} ·{" "}
                    {time(r.createdAt)}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
