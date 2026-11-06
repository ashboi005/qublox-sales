"use client";
import Link from "next/link";
import { useState } from "react";
import { Plus, Upload, ArrowRight, Search } from "lucide-react";
import { listSchema, overviewSchema, statuses } from "@qublox-sales/shared";
import { Workspace, Loading, Empty, Notice, Status } from "@/components/workspace";
import { campaignsSchema, ProspectEntry } from "@/components/prospect-entry";
import { BulkEmailQueue } from "@/components/email-delivery";
import { MapsImport } from "@/components/maps-import";
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
  const [entry, setEntry] = useState<"add" | "import" | null>(null);
  const query = new URLSearchParams({
    page: String(page),
    ...(search ? { q: search } : {}),
    ...(status ? { status } : {}),
    ...(campaign ? { campaignId: campaign } : {}),
  });
  const list = useResource(`/prospects?${query}`, listSchema);
  const overview = useResource("/overview", overviewSchema);
  const offers = useResource("/campaigns", campaignsSchema);
  const reload = () => {
    list.reload();
    overview.reload();
  };
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Prospects, with a reason to talk.</h1>
          <p>A small, considered list. Find the signal, review the message, then reach out.</p>
        </div>
        <div className="actions">
          <button onClick={() => setEntry(entry === "import" ? null : "import")}>
            <Upload size={16} />
            Import JSON
          </button>
          <button className="primary" onClick={() => setEntry(entry === "add" ? null : "add")}>
            <Plus size={17} />
            Add prospect
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
      {entry && (
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
      <BulkEmailQueue records={list.data?.data || []} onQueued={reload} />
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
              placeholder="Search business, domain, email"
            />
          </label>
          <button aria-label="Search">
            <Search size={17} />
          </button>
          <label>
            <span className="visually-hidden">Filter by status</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s[0]!.toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </label>
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
        </form>
        <button className="text-button" onClick={reload} disabled={list.loading}>
          Refresh
        </button>
      </div>
      {list.error ? (
        <Notice error>
          {list.error} <button onClick={list.reload}>Try again</button>
        </Notice>
      ) : list.loading ? (
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
                  <th>Business / domain</th>
                  <th>Offer</th>
                  <th>Channel</th>
                  <th>Signal</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>
                    <span className="visually-hidden">Review</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/prospects/${p.id}`}>{p.name}</Link>
                      <small>{p.domain}</small>
                    </td>
                    <td>{offers.data?.find((c) => c.id === p.campaignId)?.name || "Unassigned"}</td>
                    <td>
                      {p.channel === "email" ? "Email" : "Instagram"}
                      <small>
                        {p.channel === "email"
                          ? p.email
                            ? "Unverified contact"
                            : "Email needed"
                          : "Manual DM"}
                      </small>
                    </td>
                    <td>{p.score === null ? "—" : `${p.score} / 3`}</td>
                    <td>
                      <Status value={p.status} />
                    </td>
                    <td className="muted">{date(p.updatedAt)}</td>
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
