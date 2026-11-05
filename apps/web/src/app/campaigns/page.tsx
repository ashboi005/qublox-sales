"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { campaignInput, campaignSchema, type Campaign } from "@qublox-sales/shared";
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
  return (
    <section>
      <div className="section-title">
        <h2>{campaign ? "Edit offer" : "Create an offer"}</h2>
        {campaign && <span className="hint">Revision {campaign.version}</span>}
      </div>
      {error && <Notice error>{error}</Notice>}
      <form
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
        <div>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save offer"}
          </button>
        </div>
      </form>
    </section>
  );
}
