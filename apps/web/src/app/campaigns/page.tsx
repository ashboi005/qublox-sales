"use client";
import { useRef, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { z } from "zod";
import {
  campaignInput,
  campaignSchema,
  type Campaign,
  type CampaignInput,
} from "@qublox-sales/shared";
import { Workspace, Loading, Notice, Empty } from "@/components/workspace";
import { campaignsSchema } from "@/components/prospect-entry";
import { useResource } from "@/lib/use-resource";
import { api, message } from "@/lib/api";

export default function OffersPage() {
  return (
    <Workspace>
      <Offers />
    </Workspace>
  );
}
function Offers() {
  const list = useResource("/campaigns", campaignsSchema);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [notice, setNotice] = useState("");
  return (
    <>
      <div className="page-head">
        <div>
          <h1>One audience. One useful offer.</h1>
          <p>
            Give every outreach angle a clear purpose. Keep your proof honest and your ask small.
          </p>
        </div>
        <button
          onClick={() => {
            setSelected(null);
            setFormKey((k) => k + 1);
            setNotice("");
          }}
        >
          <Plus size={17} />
          New offer
        </button>
      </div>
      {list.error && (
        <Notice error>
          {list.error} <button onClick={list.reload}>Try again</button>
        </Notice>
      )}
      {notice && <Notice>{notice}</Notice>}
      {list.loading ? (
        <Loading label="Loading offers…" />
      ) : (
        <div className="two-column">
          <aside aria-label="Saved offers">
            <div className="section-title">
              <h2>Saved offers</h2>
              <span className="muted">{list.data?.length || 0}</span>
            </div>
            {!list.data?.length ? (
              <Empty title="Start focused.">
                For example, choose a type of business and a specific problem you can fix this
                month.
              </Empty>
            ) : (
              <ul className="offer-list">
                {list.data.map((c) => (
                  <li key={c.id}>
                    <button
                      aria-pressed={selected?.id === c.id}
                      onClick={() => {
                        setSelected(c);
                        setNotice("");
                      }}
                    >
                      <strong>{c.name}</strong>
                      <p>{c.audience}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
          <OfferEditor
            key={`${selected?.id || "new"}-${selected?.version || formKey}`}
            campaign={selected}
            onSave={(value) => {
              setSelected(value);
              list.reload();
              setNotice("Offer saved. Existing approvals using this offer need another review.");
            }}
          />
        </div>
      )}
    </>
  );
}
function OfferEditor({
  campaign,
  onSave,
}: {
  campaign: Campaign | null;
  onSave: (value: Campaign) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [polishing, setPolishing] = useState(false);
  const [polished, setPolished] = useState<z.infer<typeof polishResult> | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const polish = async () => {
    if (!form.current) return;
    setError("");
    setPolished(null);
    setPolishing(true);
    try {
      const body = campaignInput.parse(Object.fromEntries(new FormData(form.current)));
      setPolished(await api("/campaigns/polish", polishResult, { method: "POST", body }));
    } catch (e) {
      setError(message(e));
    } finally {
      setPolishing(false);
    }
  };
  const apply = (s: CampaignInput) => {
    for (const [name, value] of Object.entries(s)) {
      const field = form.current?.elements.namedItem(name);
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)
        field.value = value;
    }
    setPolished(null);
  };
  return (
    <section>
      <div className="section-title">
        <h2>{campaign ? "Edit offer" : "Create an offer"}</h2>
        {campaign && <span className="hint">Revision {campaign.version}</span>}
      </div>
      {error && <Notice error>{error}</Notice>}
      <form
        ref={form}
        className="form-stack"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          const fields = new FormData(event.currentTarget);
          try {
            const body = campaignInput.parse(Object.fromEntries(fields));
            const result = await api(
              campaign ? `/campaigns/${campaign.id}` : "/campaigns",
              campaignSchema,
              {
                method: campaign ? "PATCH" : "POST",
                body: { ...body, ...(campaign ? { version: campaign.version } : {}) },
              },
            );
            onSave(result);
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Offer name
          <input
            name="name"
            defaultValue={campaign?.name}
            placeholder="Shopify store improvements"
            required
            maxLength={100}
          />
        </label>
        <label>
          Who is this for?
          <textarea
            name="audience"
            defaultValue={campaign?.audience}
            rows={2}
            required
            maxLength={600}
            placeholder="A specific kind of business, market, and situation"
          />
        </label>
        <label>
          What will you help them do?
          <textarea
            name="offer"
            defaultValue={campaign?.offer}
            rows={4}
            required
            maxLength={2000}
            placeholder="Describe the concrete service and outcome you can deliver."
          />
        </label>
        <label>
          Evidence of your own work, if any
          <textarea
            name="proof"
            defaultValue={campaign?.proof}
            rows={3}
            maxLength={2000}
            placeholder="Real projects, relevant experience, or a portfolio link. Leave blank if you have none yet."
          />
        </label>
        <label>
          Call to action
          <input
            name="callToAction"
            defaultValue={campaign?.callToAction}
            required
            maxLength={400}
            placeholder="Would a short walkthrough be useful?"
          />
        </label>
        <p className="hint">
          Changing an offer clears existing approvals for that offer. Drafts must be reviewed and
          saved against the new revision.
        </p>
        <div className="actions">
          <button className="primary" disabled={busy || polishing}>
            {busy ? "Saving…" : "Save offer"}
          </button>
          <button type="button" onClick={polish} disabled={busy || polishing}>
            <Sparkles size={16} />
            {polishing ? "Polishing…" : "Polish with AI"}
          </button>
        </div>
        <p className="hint">
          Polish rewrites your rough notes into a clearer offer. It never adds clients, numbers or
          claims you did not write. Nothing changes until you use the suggestion and save.
        </p>
      </form>
      {polished && (
        <div className="entry-panel polish-suggestion" aria-live="polite">
          <div className="section-title">
            <h3>Suggested offer</h3>
          </div>
          {polished.notes && <p className="hint">{polished.notes}</p>}
          <dl className="facts">
            <dt>Name</dt>
            <dd>{polished.suggestion.name}</dd>
            <dt>Who</dt>
            <dd>{polished.suggestion.audience}</dd>
            <dt>Offer</dt>
            <dd>{polished.suggestion.offer}</dd>
            <dt>Proof</dt>
            <dd>{polished.suggestion.proof || "None"}</dd>
            <dt>Ask</dt>
            <dd>{polished.suggestion.callToAction}</dd>
          </dl>
          <div className="actions">
            <button className="primary" type="button" onClick={() => apply(polished.suggestion)}>
              Use suggestion
            </button>
            <button type="button" onClick={() => setPolished(null)}>
              Keep mine
            </button>
          </div>
          <p className="hint">Using it fills the form above. Review it, then Save offer.</p>
        </div>
      )}
    </section>
  );
}
const polishResult = z.object({ suggestion: campaignInput, notes: z.string() });
