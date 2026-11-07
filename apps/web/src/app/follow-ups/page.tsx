"use client";
import { HelpButton } from "@/components/glossary";
import Link from "next/link";
import { useState } from "react";
import { listSchema, prospectSchema } from "@qublox-sales/shared";
import { Workspace, Loading, Notice, Empty } from "@/components/workspace";
import { useResource } from "@/lib/use-resource";
import { api, date, message } from "@/lib/api";

export default function FollowUpsPage() {
  return (
    <Workspace>
      <FollowUps />
    </Workspace>
  );
}
function FollowUps() {
  const [page, setPage] = useState(1);
  const [dueOnly, setDueOnly] = useState(true);
  const list = useResource(
    `/prospects?status=contacted&page=${page}${dueOnly ? "&due=true" : ""}`,
    listSchema,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Follow-ups</h1>
          <p>
            Leads you contacted 7 or more days ago with no reply yet. Send one follow-up, or record
            what happened: replied, meeting set, or close the lead. A reply or a do-not-contact
            request removes it from this list.
          </p>
        </div>
      </div>
      <div className="toolbar">
        <label className="check-label">
          <input
            type="checkbox"
            checked={dueOnly}
            onChange={(e) => {
              setDueOnly(e.target.checked);
              setPage(1);
            }}
          />
          Show only follow-ups due now
        </label>
        <button className="text-button" onClick={list.reload}>
          Refresh
        </button>
      </div>
      {(error || list.error) && (
        <Notice error>
          {error || list.error}
          <button onClick={list.reload}>Reload</button>
        </Notice>
      )}
      {list.loading ? (
        <Loading label="Loading conversations…" />
      ) : !list.data?.data.length ? (
        <Empty
          title={
            dueOnly ? "Nothing needs a follow-up today." : "Your conversations will appear here."
          }
        >
          {dueOnly
            ? "Check back after your next outreach, or turn off the filter to see upcoming reminders."
            : "Review and approve a prospect, send the message yourself, then mark it as sent."}
        </Empty>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">Manual follow-up reminders</caption>
              <thead>
                <tr>
                  <th>Business</th>
                  <th>
                    Channel <HelpButton topic="channel" label="channel" />
                  </th>
                  <th>First contact</th>
                  <th>Follow-up</th>
                  <th>Record activity</th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/prospects/${p.id}`}>{p.name}</Link>
                      <small>{p.domain || p.phone}</small>
                    </td>
                    <td>
                      {p.channel === "email"
                        ? "Email"
                        : p.channel === "whatsapp"
                          ? "WhatsApp"
                          : "Instagram"}
                    </td>
                    <td>{date(p.contactedAt)}</td>
                    <td>{p.followUpAt ? date(p.followUpAt) : "Completed"}</td>
                    <td>
                      <div className="actions">
                        {(
                          [
                            ...(p.followUpAt ? [["followed_up", "Follow-up sent"]] : []),
                            ["replied", "Replied"],
                            ["meeting", "Meeting set"],
                            ["close", "Close"],
                          ] as const
                        ).map(([action, label]) => (
                          <button
                            key={action}
                            disabled={busy !== null}
                            onClick={async () => {
                              if (
                                action === "followed_up" &&
                                !window.confirm(
                                  "Have you sent a manual follow-up? This records one contact and clears the reminder.",
                                )
                              )
                                return;
                              setBusy(p.id);
                              setError("");
                              try {
                                await api(`/prospects/${p.id}/actions`, prospectSchema, {
                                  method: "POST",
                                  body: { action, version: p.version },
                                });
                                list.reload();
                              } catch (e) {
                                setError(message(e));
                              } finally {
                                setBusy(null);
                              }
                            }}
                          >
                            {busy === p.id ? "Saving…" : label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>
              {list.data.total} conversation{list.data.total === 1 ? "" : "s"} · Page {page}
            </span>
            <div className="actions">
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <button
                disabled={page * list.data.pageSize >= list.data.total}
                onClick={() => setPage(page + 1)}
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
