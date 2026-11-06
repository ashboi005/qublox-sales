import type { Audit } from "@qublox-sales/shared";

export function opportunityLevel(score: number) {
  return score >= 60 ? "high" : score >= 30 ? "medium" : "low";
}

// 0-100 estimate of how much the studio could help; reasons explain it.
export function OpportunityBadge({ score }: { score: number }) {
  const level = opportunityLevel(score);
  return (
    <span className={`opportunity-badge opportunity-${level}`} title={`Opportunity ${score}/100`}>
      {level === "high" ? "High" : level === "medium" ? "Medium" : "Low"} · {score}
    </span>
  );
}

export function AuditSummary({ audit }: { audit: Audit }) {
  const items = [
    audit.performance !== undefined &&
      `Mobile speed ${audit.performance}/100${audit.largestPaintSeconds ? ` (${audit.largestPaintSeconds}s to load)` : ""}`,
    audit.https === false && "No HTTPS",
    audit.mobileViewport === false && "Not mobile friendly",
    audit.copyrightYear && `Copyright ${audit.copyrightYear}`,
    audit.booking === false && "No online booking",
    audit.store === false && "No store",
    audit.whatsapp === false && "No WhatsApp link",
    audit.contactForm === false && "No contact form",
    audit.readVia &&
      audit.readVia !== "direct" &&
      `Read via ${audit.readVia === "jina" ? "Jina" : "Firecrawl"}`,
  ].filter(Boolean);
  return <>{items.length ? items.join(" · ") : "No problems found"}</>;
}
