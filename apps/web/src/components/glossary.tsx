"use client";
import { useEffect, useRef, useState } from "react";
import { CircleHelp, X } from "lucide-react";

// One glossary for the whole workspace. Any HelpButton opens it at its topic.
export type GlossaryTopic =
  | "statuses"
  | "signal"
  | "opportunity"
  | "channel"
  | "email-check"
  | "progress"
  | "offer"
  | "outbox";

const OPEN = "qublox:glossary";

export function openGlossary(topic: GlossaryTopic = "statuses") {
  window.dispatchEvent(new CustomEvent(OPEN, { detail: topic }));
}

export function HelpButton({ topic, label }: { topic: GlossaryTopic; label: string }) {
  return (
    <button
      type="button"
      className="help-button"
      aria-label={`What does ${label} mean?`}
      title={`What does ${label} mean?`}
      onClick={() => openGlossary(topic)}
    >
      <CircleHelp size={14} aria-hidden />
    </button>
  );
}

const statusTerms: [string, string][] = [
  ["new", "Just added. Nothing has been researched or written yet."],
  ["researched", "Its website or Maps listing has been read. Waiting for a draft."],
  ["review", "A draft message is ready. Open it, edit if needed, and approve it."],
  ["approved", "You approved this exact message. Send it (Gmail, WhatsApp or copy) from the lead."],
  ["contacted", "The first message went out. A follow-up reminder appears after 7 days."],
  ["replied", "They answered."],
  ["meeting", "A call or meeting is booked."],
  ["closed", "Finished, won or lost. Nothing more to do."],
  [
    "skipped",
    "The AI found no good reason to contact them (signal 0). You can still write manually.",
  ],
  ["suppressed", "On the do-not-contact list. Nobody on the team can message them."],
];

export function Glossary() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [topic, setTopic] = useState<GlossaryTopic>("statuses");
  useEffect(() => {
    const open = (event: Event) => {
      const next = (event as CustomEvent<GlossaryTopic>).detail || "statuses";
      setTopic(next);
      if (!dialog.current?.open) dialog.current?.showModal();
      requestAnimationFrame(() =>
        document.getElementById(`glossary-${next}`)?.scrollIntoView({ block: "start" }),
      );
    };
    window.addEventListener(OPEN, open);
    return () => window.removeEventListener(OPEN, open);
  }, []);
  const section = (id: GlossaryTopic, title: string, body: React.ReactNode) => (
    <section id={`glossary-${id}`} className={topic === id ? "glossary-focus" : undefined}>
      <h3>{title}</h3>
      {body}
    </section>
  );
  return (
    <dialog
      ref={dialog}
      className="glossary"
      aria-labelledby="glossary-title"
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
    >
      <div className="glossary-head">
        <h2 id="glossary-title">What things mean</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close"
          onClick={() => dialog.current?.close()}
        >
          <X size={18} />
        </button>
      </div>
      <div className="glossary-body">
        {section(
          "statuses",
          "Lead status",
          <dl className="glossary-list">
            {statusTerms.map(([term, meaning]) => (
              <div key={term}>
                <dt>
                  <span className={`status status-${term}`}>{term}</span>
                </dt>
                <dd>{meaning}</dd>
              </div>
            ))}
          </dl>,
        )}
        {section(
          "signal",
          "Signal (0 to 3)",
          <>
            <p>
              The AI&rsquo;s rating of how good a reason we have to message this business, based
              only on the evidence it was given.
            </p>
            <dl className="glossary-list">
              <div>
                <dt>0</dt>
                <dd>Nothing useful found. No message is written and the lead is skipped.</dd>
              </div>
              <div>
                <dt>1</dt>
                <dd>A weak but relevant fact. Worth a look, not a priority.</dd>
              </div>
              <div>
                <dt>2</dt>
                <dd>A specific, likely need, such as a slow site or no way to book online.</dd>
              </div>
              <div>
                <dt>3</dt>
                <dd>A clear need confirmed by more than one source, or they asked for it.</dd>
              </div>
            </dl>
          </>,
        )}
        {section(
          "opportunity",
          "Opportunity (High, Medium, Low)",
          <p>
            How much we could plausibly help, scored 0 to 100 before any AI is involved: no website,
            slow on phones, not mobile friendly, no HTTPS, an old copyright year, no booking or
            store for that kind of business, and many Google reviews (an established business) all
            raise it. The reasons are listed on each lead. Research and drafting run on the highest
            first.
          </p>,
        )}
        {section(
          "offer",
          "Offer",
          <p>
            What you are pitching to a group of leads, set up under Offers. A lead with an offer is
            researched and drafted automatically, and the AI writes the message around that
            offer&rsquo;s audience, pitch and ask. A lead without an offer is only stored.
          </p>,
        )}
        {section(
          "channel",
          "Channel",
          <dl className="glossary-list">
            <div>
              <dt>Email</dt>
              <dd>Sent from a teammate&rsquo;s connected Gmail, or copied and sent by hand.</dd>
            </div>
            <div>
              <dt>WhatsApp</dt>
              <dd>Opens your own WhatsApp with the message filled in. Mark it sent after.</dd>
            </div>
            <div>
              <dt>Instagram</dt>
              <dd>Copy the message, send the DM yourself, then mark it sent.</dd>
            </div>
          </dl>,
        )}
        {section(
          "email-check",
          "Email check",
          <dl className="glossary-list">
            <div>
              <dt>Not verified</dt>
              <dd>Found on their website or listing, never checked. Usually fine.</dd>
            </div>
            <div>
              <dt>Verified</dt>
              <dd>The mailbox exists. Delivery to the inbox is still not guaranteed.</dd>
            </div>
            <div>
              <dt>Risky</dt>
              <dd>Their mail server accepts any address, so it cannot be confirmed.</dd>
            </div>
            <div>
              <dt>Invalid</dt>
              <dd>The address does not exist. It cannot be queued.</dd>
            </div>
          </dl>,
        )}
        {section(
          "progress",
          "Researching and writing",
          <p>
            &ldquo;Researching website&rdquo; means the app is reading their site for emails, phones
            and problems it could mention. &ldquo;Writing draft&rdquo; means the AI is writing the
            message. Both run in the background; the list refreshes by itself. &ldquo;Needs a
            look&rdquo; means one of them failed and the lead explains why.
          </p>,
        )}
        {section(
          "outbox",
          "Outbox",
          <dl className="glossary-list">
            <div>
              <dt>Queued</dt>
              <dd>Waiting for its time slot. Spacing and the daily limit can delay it.</dd>
            </div>
            <div>
              <dt>Sending</dt>
              <dd>Being handed to Gmail right now.</dd>
            </div>
            <div>
              <dt>Sent</dt>
              <dd>Gmail accepted it. The lead is marked contacted.</dd>
            </div>
            <div>
              <dt>Uncertain</dt>
              <dd>Gmail did not confirm. Check your Gmail Sent folder, then mark it.</dd>
            </div>
            <div>
              <dt>Failed / cancelled</dt>
              <dd>Not sent. The reason is shown; queue it again if needed.</dd>
            </div>
          </dl>,
        )}
      </div>
    </dialog>
  );
}
