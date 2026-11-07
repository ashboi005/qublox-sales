"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Upload, ArrowRight, Search } from "lucide-react";
import { listSchema, overviewSchema, verificationLabel } from "@qublox-sales/shared";
import { OpportunityBadge } from "@/components/opportunity";
import { HelpButton } from "@/components/glossary";
import { Workspace, Loading, Empty, Notice, Status } from "@/components/workspace";
import { campaignsSchema, ProspectEntry } from "@/components/prospect-entry";
import { BulkEmailQueue } from "@/components/email-delivery";
import { MapsImport } from "@/components/maps-import";
import { FindLeads } from "@/components/find-leads";
import { BulkOffer } from "@/components/bulk-offer";
import { useResource } from "@/lib/use-resource";
import { date } from "@/lib/api";

export default function Home() {
  return (
    <Workspace>
      <Prospects />
    </Workspace>
  );
}
function Prospects() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [campaign, setCampaign] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"recent" | "opportunity">("recent");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [entry, setEntry] = useState<"add" | "import" | "find" | null>(null);
  const query = new URLSearchParams({
    page: String(page),
    ...(search ? { q: search } : {}),
    ...(status ? { status } : {}),
    ...(campaign ? { campaignId: campaign } : {}),
    ...(sort === "opportunity" ? { sort } : {}),
  });
  const list = useResource(`/prospects?${query}`, listSchema);
  const overview = useResource("/overview", overviewSchema);
  const offers = useResource("/campaigns", campaignsSchema);
  const reload = () => {
    list.reload();
    overview.reload();
  };
  // While research or drafting is running for visible leads, refresh so progress shows.
  const working = list.data?.data.some((p) =>
    [p.researchStatus, p.draftStatus].some((s) => s === "queued" || s === "running"),
  );
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => {
      list.reload();
      overview.reload();
    }, 5000);
    return () => clearInterval(timer);
  }, [working, list.reload, overview.reload]);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Prospects</h1>
          <p>Find businesses, review the drafted message, then reach out.</p>
        </div>
        <div className="actions">
          <button onClick={() => setEntry(entry === "import" ? null : "import")}>
            <Upload size={16} />
            Import file
          </button>
          <button onClick={() => setEntry(entry === "add" ? null : "add")}>
            <Plus size={17} />
            Add one
          </button>
          <button className="primary" onClick={() => setEntry(entry === "find" ? null : "find")}>
            <Search size={17} />
            Find leads
          </button>
        </div>
      </div>
      {overview.error && (
        <Notice error>
          {overview.error} <button onClick={overview.reload}>Retry summary</button>
        </Notice>
      )}
      <div className="metrics" aria-label="Pipeline summary">
        {[
          [overview.data?.total, "Prospects"],
          [overview.data?.review, "To review"],
          [overview.data?.approved, "Approved"],
          [
            overview.data ? overview.data.replied + overview.data.meetings : undefined,
            "Replied / meetings",
          ],
          [
            overview.data
              ? `${overview.data.contactedToday} / ${overview.data.dailyLimit}`
              : undefined,
            "Contacts / attempts · last 24h",
          ],
        ].map(([value, label]) => (
          <div className="metric" key={label}>
            <strong>{value ?? "—"}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      {entry === "find" && (
        <FindLeads campaigns={offers.data || []} onDone={reload} onClose={() => setEntry(null)} />
      )}
      {(entry === "add" || entry === "import") && (
        <ProspectEntry
          mode={entry}
          campaigns={offers.data || []}
          onDone={reload}
          onCancel={() => setEntry(null)}
        />
      )}
      {offers.error && (
        <Notice error>
          {offers.error} <button onClick={offers.reload}>Retry offers</button>
        </Notice>
      )}
      <MapsImport campaigns={offers.data || []} onImported={reload} />
      <BulkEmailQueue
        onQueued={reload}
        onShowReview={() => {
          setStatus("review");
          setPage(1);
        }}
      />
      <BulkOffer
        selected={(list.data?.data || []).filter((p) => picked.has(p.id))}
        campaigns={offers.data || []}
        onDone={reload}
        onClear={() => setPicked(new Set())}
      />
      <div className="pipeline-tabs" role="group" aria-label="Pipeline stage">
        {(
          [
            ["", "All"],
            ["new", "New"],
            ["review", "To review"],
            ["approved", "Approved"],
            ["contacted", "Contacted"],
            ["replied", "Replied"],
            ["meeting", "Meeting set"],
            ["closed", "Closed"],
            ["skipped", "Skipped"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={label}
            type="button"
            aria-pressed={status === value}
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
        <HelpButton topic="statuses" label="each stage" />
      </div>
      <div className="toolbar">
        <form
          className="filters"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSearch(q.trim());
          }}
        >
          <label>
            <span className="visually-hidden">Search prospects</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={200}
              placeholder="Search business, domain, email, phone"
            />
          </label>
          <button aria-label="Search">
            <Search size={17} />
          </button>
          <label>
            <span className="visually-hidden">Filter by offer</span>
            <select
              value={campaign}
              onChange={(e) => {
                setCampaign(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All offers</option>
              {offers.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="visually-hidden">Sort</span>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as "recent" | "opportunity");
                setPage(1);
              }}
            >
              <option value="recent">Recently updated</option>
              <option value="opportunity">Best opportunity first</option>
            </select>
          </label>
        </form>
        <button className="text-button" onClick={reload} disabled={list.loading}>
          Refresh
        </button>
      </div>
      {list.error ? (
        <Notice error>
          {list.error} <button onClick={list.reload}>Try again</button>
        </Notice>
      ) : list.loading && !list.data ? (
        <Loading label="Loading prospects…" />
      ) : !list.data?.data.length ? (
        <Empty
          title={
            search || status || campaign
              ? "No prospects match these filters."
              : "Your first prospect belongs here."
          }
        >
          {search || status || campaign ? (
            "Change the filters to see the rest of your list."
          ) : (
            <>
              Add a business website or import the JSON from your Maps extension. Start with one
              clear <Link href="/campaigns">offer</Link>.
            </>
          )}
        </Empty>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">Prospect pipeline</caption>
              <thead>
                <tr>
                  <th className="pick">
                    <input
                      type="checkbox"
                      aria-label="Select all leads on this page"
                      checked={
                        list.data.data.length > 0 && list.data.data.every((p) => picked.has(p.id))
                      }
                      onChange={(e) =>
                        setPicked(
                          e.target.checked ? new Set(list.data!.data.map((p) => p.id)) : new Set(),
                        )
                      }
                    />
                  </th>
                  <th>Business / domain</th>
                  <th>Offer</th>
                  <th>
                    Channel <HelpButton topic="channel" label="channel" />
                  </th>
                  <th>
                    Opportunity <HelpButton topic="opportunity" label="opportunity" />
                  </th>
                  <th>
                    Signal <HelpButton topic="signal" label="signal" />
                  </th>
                  <th>
                    Status <HelpButton topic="statuses" label="status" />
                  </th>
                  <th>Last contact</th>
                  <th>
                    <span className="visually-hidden">Review</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((p) => (
                  <tr key={p.id}>
                    <td className="pick">
                      <input
                        type="checkbox"
                        aria-label={`Select ${p.name}`}
                        checked={picked.has(p.id)}
                        onChange={(e) =>
                          setPicked((old) => {
                            const next = new Set(old);
                            if (e.target.checked) next.add(p.id);
                            else next.delete(p.id);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td>
                      <Link href={`/prospects/${p.id}`}>{p.name}</Link>
                      <small>{p.domain || p.phone || "No website"}</small>
                    </td>
                    <td>{offers.data?.find((c) => c.id === p.campaignId)?.name || "Unassigned"}</td>
                    <td>
                      {channelLabel[p.channel]}
                      <small>
                        {p.channel === "email"
                          ? p.email
                            ? verificationLabel[p.verificationStatus]
                            : "Email needed"
                          : p.channel === "whatsapp"
                            ? p.phone
                              ? "Manual message"
                              : "Phone needed"
                            : "Manual DM"}
                      </small>
                    </td>
                    <td>
                      {p.opportunity === null ? (
                        "—"
                      ) : (
                        <>
                          <OpportunityBadge score={p.opportunity} />
                          {p.opportunityReasons[0] && <small>{p.opportunityReasons[0]}</small>}
                        </>
                      )}
                    </td>
                    <td>{p.score === null ? "—" : `${p.score} / 3`}</td>
                    <td>
                      <Status value={p.status} />
                      {["queued", "running"].includes(p.researchStatus) ? (
                        <small>Researching website…</small>
                      ) : ["queued", "running"].includes(p.draftStatus) ? (
                        <small>Writing draft…</small>
                      ) : p.researchStatus === "failed" || p.draftStatus === "failed" ? (
                        <small>Needs a look</small>
                      ) : null}
                    </td>
                    <td className="muted">
                      {date(p.contactedAt)}
                      {p.followUpAt && p.status === "contacted" && (
                        <small>Follow up {date(p.followUpAt)}</small>
                      )}
                    </td>
                    <td>
                      <Link href={`/prospects/${p.id}`} aria-label={`Review ${p.name}`}>
                        <ArrowRight size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>
              {list.data.total} prospect{list.data.total === 1 ? "" : "s"} · Page {page}
            </span>
            <div className="actions">
              <button onClick={() => setPage(page - 1)} disabled={page === 1}>
                Previous
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page * list.data.pageSize >= list.data.total}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
const channelLabel = { email: "Email", whatsapp: "WhatsApp", instagram: "Instagram" } as const;
