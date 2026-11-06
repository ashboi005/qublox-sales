"use client";
import { useState } from "react";
import { z } from "zod";
import type { Campaign, Prospect } from "@qublox-sales/shared";
import { api, message } from "@/lib/api";
import { Notice } from "./workspace";

const result = z.object({
  updated: z.number(),
  research: z.number(),
  drafts: z.number(),
  skipped: z.array(z.object({ id: z.string(), reason: z.string() })),
});

// Bulk action for ticked leads: set (or remove) the offer and start research or drafting.
export function BulkOffer({
  selected,
  campaigns,
  onDone,
  onClear,
}: {
  selected: Prospect[];
  campaigns: Campaign[];
  onDone: () => void;
  onClear: () => void;
}) {
  const [campaignId, setCampaignId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  if (!selected.length && !notice && !error) return null;
  return (
    <div className="bulk-bar" role="region" aria-label="Selected leads">
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      {selected.length > 0 && (
        <form
          className="bulk-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setNotice("");
            try {
              const r = await api("/prospects/assign-offer", result, {
                method: "POST",
                body: {
                  items: selected.map((p) => ({ id: p.id, version: p.version })),
                  campaignId: campaignId === "none" ? null : campaignId,
                },
              });
              setNotice(
                `${r.updated} updated` +
                  (r.research ? ` · ${r.research} researching` : "") +
                  (r.drafts ? ` · ${r.drafts} drafting` : "") +
                  (r.skipped.length
                    ? ` · ${r.skipped.length} skipped (${[...new Set(r.skipped.map((s) => s.reason))].join(" ")})`
                    : "") +
                  ".",
              );
              onClear();
              onDone();
            } catch (err) {
              setError(message(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <strong>{selected.length} selected</strong>
          <select
            required
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            aria-label="Offer for selected leads"
          >
            <option value="" disabled>
              Choose an offer…
            </option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="none">No offer (stop automation)</option>
          </select>
          <button className="primary" disabled={busy}>
            {busy
              ? "Working…"
              : campaignId === "none"
                ? "Remove offer"
                : "Set offer & start research/drafts"}
          </button>
          <button type="button" onClick={onClear} disabled={busy}>
            Clear selection
          </button>
        </form>
      )}
    </div>
  );
}
