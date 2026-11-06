"use client";
import { useState } from "react";
import { z } from "zod";
import { campaignSchema, prospectInput, prospectSchema, type Campaign } from "@qublox-sales/shared";
import { api, message } from "@/lib/api";
import { Notice } from "./workspace";

export const campaignsSchema = z.array(campaignSchema);
export const importResult = z.object({
  added: z.number(),
  duplicates: z.number(),
  invalid: z.array(z.object({ row: z.number(), reason: z.string() })),
});
export function ProspectEntry({
  campaigns,
  mode,
  onDone,
  onCancel,
}: {
  campaigns: Campaign[];
  mode: "add" | "import";
  onDone: () => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<z.infer<typeof importResult> | null>(null);
  return (
    <section
      className="entry-panel"
      aria-label={mode === "add" ? "Add prospect" : "Import prospects"}
    >
      <h2>{mode === "add" ? "A new conversation starts here." : "Bring in your Maps research."}</h2>
      {mode === "import" && (
        <details className="source">
          <summary>Use the Qublox Maps extension</summary>
          <p>
            Download and extract the extension, open <code>chrome://extensions</code> in Chrome or
            Brave, enable Developer mode, and choose Load unpacked. Select the extracted folder
            containing manifest.json.
          </p>
          <p>
            <a className="button" href="/qublox-maps-extension.zip" download>
              Download Maps extension
            </a>
          </p>
          <p>
            Collect businesses on Maps, enter this workspace URL in the extension, and select Send
            to Qublox. Sign in here if needed, review the incoming batch, choose an offer, and
            confirm the import. JSON export remains available.
          </p>
        </details>
      )}
      {error && <Notice error>{error}</Notice>}
      {result && (
        <Notice>
          {result.added} imported · {result.duplicates} already in your workspace.
          {result.invalid.map((item) => (
            <span key={item.row} className="span-full">
              {" "}
              Row {item.row}: {item.reason}
            </span>
          ))}
        </Notice>
      )}
      <form
        className="form-grid"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          setResult(null);
          const fields = new FormData(event.currentTarget);
          try {
            const campaignId = String(fields.get("campaignId") || "") || null;
            if (mode === "add") {
              const body = prospectInput.parse({
                name: fields.get("name"),
                website: fields.get("website"),
                email: fields.get("email"),
                phone: fields.get("phone"),
                channel: fields.get("website") || fields.get("email") ? "email" : "whatsapp",
                campaignId,
              });
              await api("/prospects", prospectSchema, { method: "POST", body });
              onDone();
              onCancel();
            } else {
              const file = fields.get("file");
              if (!(file instanceof File) || !file.size)
                throw new Error("Choose the JSON export from your Maps extension.");
              if (file.size > 850_000)
                throw new Error(
                  "Keep the JSON file below 850 KB. Import up to 100 records at a time.",
                );
              const records: unknown = JSON.parse(await file.text());
              if (!Array.isArray(records) || !records.length || records.length > 100)
                throw new Error("The file must be a JSON array with 1–100 businesses.");
              setResult(
                await api("/imports", importResult, {
                  method: "POST",
                  body: { records, campaignId },
                }),
              );
              onDone();
            }
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {mode === "add" ? (
          <>
            <label>
              Business name
              <input name="name" required maxLength={160} autoFocus />
            </label>
            <label>
              Website
              <input name="website" placeholder="brand.com, or empty" maxLength={2048} />
            </label>
            <label>
              Phone / WhatsApp, if known
              <input name="phone" maxLength={100} placeholder="+91 98765 43210" />
            </label>
            <label>
              Email, if known
              <input name="email" type="email" maxLength={254} />
              <span className="hint">Saved as unverified. You can add it after research.</span>
            </label>
          </>
        ) : (
          <label className="span-full">
            Maps extension JSON
            <input name="file" type="file" accept="application/json,.json" required />
            <span className="hint">
              Each business needs a website, email or phone. Without a website, its Maps listing
              becomes evidence and WhatsApp is the channel. Repeated domains or phones are skipped.
            </span>
          </label>
        )}
        <label>
          Offer
          <select name="campaignId" defaultValue="">
            <option value="">Choose later</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="actions span-full">
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : mode === "add" ? "Add prospect" : "Import JSON"}
          </button>
          <button type="button" onClick={onCancel} disabled={busy}>
            Close
          </button>
        </div>
      </form>
    </section>
  );
}
