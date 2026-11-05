"use client";
import { useEffect, useRef, useState } from "react";
import type { Campaign } from "@qublox-sales/shared";
import { z } from "zod";
import { mapsEnvelope, parseMapsRecords } from "@/lib/maps-import";
import { api, message } from "@/lib/api";
import { importResult } from "./prospect-entry";
import { Notice } from "./workspace";

export function MapsImport({
  campaigns,
  onImported,
}: {
  campaigns: Campaign[];
  onImported: () => void;
}) {
  const [text, setText] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [campaignId, setCampaignId] = useState("");
  const [result, setResult] = useState<z.infer<typeof importResult> | null>(null);
  const nonce = useRef("");
  const received = useRef(new Set<string>());
  useEffect(() => {
    setVisible(new URLSearchParams(window.location.search).has("mapsImport"));
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const parsed = mapsEnvelope.safeParse(event.data);
      if (!parsed.success) return;
      const payload = parsed.data;
      if (payload.kind === "available") {
        if (received.current.has(payload.nonce)) return;
        nonce.current = payload.nonce;
        window.postMessage(
          { source: "qublox-sales", kind: "request", nonce: payload.nonce },
          window.location.origin,
        );
      } else if (payload.nonce === nonce.current && !received.current.has(payload.nonce)) {
        try {
          const value = JSON.stringify(payload.records);
          parseMapsRecords(value);
          setText(value);
          setVisible(true);
          setError("");
          setResult(null);
          received.current.add(payload.nonce);
          window.postMessage(
            { source: "qublox-sales", kind: "received", nonce: payload.nonce },
            window.location.origin,
          );
        } catch (e) {
          setError(message(e));
          setVisible(true);
        }
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  if (!visible) return null;
  let records: Record<string, unknown>[] = [];
  try {
    if (text) records = parseMapsRecords(text);
  } catch {
    /* Validation is displayed on submission. */
  }
  const withoutWebsite = records.filter((r) => !String(r.website || "").trim()).length;
  return (
    <section className="entry-panel" aria-label="Maps collection preview">
      <div className="section-title">
        <h2>Review your Maps collection</h2>
        <button type="button" onClick={() => setVisible(false)} disabled={busy}>
          Close preview
        </button>
      </div>
      <p>
        Nothing is imported until you confirm. The original collection stays in your extension. You
        can also paste its exported JSON below.
      </p>
      {error && <Notice error>{error}</Notice>}
      {result && (
        <Notice>
          {result.added} imported, {result.duplicates} duplicates skipped.
          {result.invalid.map((row) => (
            <span key={row.row}>
              {" "}
              Row {row.row}: {row.reason}.
            </span>
          ))}
        </Notice>
      )}
      {withoutWebsite > 0 && (
        <Notice>
          {withoutWebsite} {withoutWebsite === 1 ? "place needs" : "places need"} a website before
          it can enter this pipeline. Add it in the JSON below, or keep those records in the
          extension export.
        </Notice>
      )}
      {records.length > 0 && (
        <div className="table-wrap">
          <table>
            <caption>
              {records.length} places received. Showing the first {Math.min(10, records.length)}.
            </caption>
            <thead>
              <tr>
                <th>Business</th>
                <th>Website</th>
                <th>Phone</th>
                <th>Capture</th>
              </tr>
            </thead>
            <tbody>
              {records.slice(0, 10).map((r, i) => (
                <tr key={i}>
                  <td>{String(r.name || "Missing name")}</td>
                  <td>{String(r.website || "Missing website")}</td>
                  <td>{String(r.phone || "Not listed")}</td>
                  <td>
                    {r.captureStatus === "list_only"
                      ? "List only; review details"
                      : "Public listing"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form
        className="form-stack source"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          setResult(null);
          try {
            setResult(
              await api("/imports", importResult, {
                method: "POST",
                body: { records: parseMapsRecords(text), campaignId: campaignId || null },
              }),
            );
            onImported();
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Collection JSON
          <textarea
            aria-describedby="maps-json-hint"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={850_000}
            required
            placeholder="Waiting for the extension, or paste a JSON export…"
          />
          <span className="hint" id="maps-json-hint">
            Up to 100 records. Check website, phone, and source details before importing. Data is
            not mailbox-verified.
          </span>
        </label>
        <label>
          Offer for this collection
          <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">Choose later</option>
            {campaigns.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div>
          <button className="primary" disabled={busy || !text}>
            {busy ? "Importing…" : "Confirm import"}
          </button>
        </div>
      </form>
    </section>
  );
}
