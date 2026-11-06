"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { outboxListSchema, prospectSchema } from "@qublox-sales/shared";
import { Workspace, Loading, Notice, Status, Empty } from "@/components/workspace";
import { useResource } from "@/lib/use-resource";
import { api, message } from "@/lib/api";
export default function OutboxPage() {
  return (
    <Workspace>
      <Outbox />
    </Workspace>
  );
}
function Outbox() {
  const list = useResource("/deliveries", outboxListSchema),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const timer = setInterval(list.reload, 10000);
    return () => clearInterval(timer);
  }, [list.reload]);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reviewed, then sent.</h1>
          <p>
            Scheduled Gmail emails and their results. Account and team limits can postpone requested
            times.
          </p>
        </div>
        <button onClick={list.reload}>Refresh</button>
      </div>
      {(error || list.error) && <Notice error>{error || list.error}</Notice>}
      {list.loading ? (
        <Loading />
      ) : !list.data?.length ? (
        <Empty title="Your outbox is clear.">
          Approve a draft, then send it now or schedule a reviewed batch from Prospects.
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <caption>Latest 100 queued and completed emails</caption>
            <thead>
              <tr>
                <th>Business</th>
                <th>Recipient / sender</th>
                <th>Requested time</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link href={`/prospects/${d.prospectId}`}>{d.prospectName}</Link>
                    <small>{d.subject}</small>
                  </td>
                  <td>
                    {d.toAddress}
                    <small>{d.senderId || `Pool: ${d.senderPool.join(", ")}`}</small>
                  </td>
                  <td>{new Date(d.scheduledAt).toLocaleString()}</td>
                  <td>
                    <Status value={d.status} />
                    {d.lastError && <small>{d.lastError}</small>}
                  </td>
                  <td>
                    {d.status === "queued" ? (
                      <div className="actions">
                        {(
                          [
                            ["now", "Send next"],
                            ["cancel", "Cancel"],
                          ] as const
                        ).map(([action, label]) => (
                          <button
                            key={action}
                            disabled={!!busy}
                            onClick={async () => {
                              setBusy(d.id);
                              setError("");
                              try {
                                await api(
                                  `/prospects/${d.prospectId}/delivery/change`,
                                  prospectSchema,
                                  {
                                    method: "POST",
                                    body: { version: d.currentVersion, deliveryId: d.id, action },
                                  },
                                );
                                list.reload();
                              } catch (e) {
                                setError(message(e));
                              } finally {
                                setBusy("");
                              }
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    ) : d.status === "uncertain" ? (
                      <Link href={`/prospects/${d.prospectId}`}>Check and resolve</Link>
                    ) : d.status === "sent" ? (
                      "Accepted by Gmail"
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
