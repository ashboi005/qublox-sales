import { z } from "zod";

export const statuses = [
  "new",
  "researched",
  "review",
  "approved",
  "contacted",
  "replied",
  "meeting",
  "closed",
  "skipped",
  "suppressed",
] as const;
export const channels = ["email", "whatsapp", "instagram"] as const;
export type ProspectStatus = (typeof statuses)[number];
export type Channel = (typeof channels)[number];

export function normalizeWebsite(input: string) {
  const raw = input.trim();
  if (
    !raw ||
    raw.length > 2048 ||
    (/^[a-z][a-z\d+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw))
  ) {
    throw new Error("Enter a public http or https website.");
  }
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  // Absolute DNS names with a trailing dot identify the same business.
  url.hostname = url.hostname.replace(/\.$/, "");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  ) {
    throw new Error("Enter a website without credentials or custom ports.");
  }
  return {
    website: new URL("/", url).toString(),
    domain: url.hostname.toLowerCase().replace(/^www\./, ""),
  };
}

const optionalText = (max: number) => z.string().trim().max(max).default("");
const webUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      const u = new URL(value);
      return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "Enter an http or https URL.");
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.union([z.email(), z.literal("")]))
  .nullable()
  .default("")
  .transform((value) => value || null);

export const campaignInput = z.object({
  name: z.string().trim().min(1).max(100),
  audience: z.string().trim().min(1).max(600),
  offer: z.string().trim().min(1).max(2000),
  proof: optionalText(2000),
  callToAction: z.string().trim().min(1).max(400),
});
export type CampaignInput = z.infer<typeof campaignInput>;

export const prospectFields = z.object({
  name: z.string().trim().min(1).max(160),
  // Optional: many local businesses only have a Maps listing, phone or Instagram.
  website: z
    .string()
    .trim()
    .max(2048)
    .default("")
    .refine((value) => {
      if (!value) return true;
      try {
        normalizeWebsite(value);
        return true;
      } catch {
        return false;
      }
    }, "Enter a valid business website."),
  email,
  phone: optionalText(100),
  contactName: optionalText(100),
  country: optionalText(100),
  instagram: webUrl.default("").refine((value) => {
    if (!value) return true;
    try {
      return /(^|\.)instagram\.com$/.test(new URL(value).hostname);
    } catch {
      return false;
    }
  }, "Enter an Instagram profile URL."),
  campaignId: z.uuid().nullable().default(null),
  channel: z.enum(channels).default("email"),
  sourceUrl: webUrl.default(""),
  sourceCapturedAt: z.iso.datetime().nullable().default(null),
  address: optionalText(500),
  notes: optionalText(5000),
});
const reachable = (p: {
  website: string;
  email: string | null;
  phone: string;
  instagram: string;
}) => Boolean(p.website || p.email || p.phone || p.instagram);
const reachableMessage = "Add a website, email, phone or Instagram profile.";
export const prospectInput = prospectFields.refine(reachable, reachableMessage);
export const prospectUpdateInput = prospectFields
  .extend({ version: z.number().int().min(1) })
  .refine(reachable, reachableMessage);
export type ProspectInput = z.infer<typeof prospectInput>;

export const evidenceSchema = z.object({
  id: z.uuid(),
  url: webUrl.pipe(z.string().min(1)),
  title: z.string().max(200),
  text: z.string().trim().min(1).max(3000),
  kind: z.enum(["website", "technology", "product", "manual", "listing"]),
  retrievedAt: z.iso.datetime(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const aiDraftSchema = z.object({
  score: z.number().int().min(0).max(3),
  rationale: z.string().trim().min(1).max(1200),
  evidenceIds: z.array(z.uuid()).max(12),
  subject: z.string().trim().max(180),
  body: z.string().trim().max(5000),
});
export type DraftInput = z.infer<typeof aiDraftSchema>;

export function validateDraftEvidence(draft: DraftInput, evidence: Pick<Evidence, "id">[]) {
  const known = new Set(evidence.map((item) => item.id));
  if (draft.evidenceIds.some((id) => !known.has(id)))
    throw new Error("The draft cites evidence that does not exist.");
  if (draft.score === 0) return { ...draft, subject: "", body: "", evidenceIds: [] };
  if (!draft.evidenceIds.length || !draft.body)
    throw new Error("A draft needs supporting evidence and a message.");
  return draft;
}

export const revisionSchema = z.object({ version: z.number().int().min(1) });
export const draftInput = aiDraftSchema.extend({ version: z.number().int().min(1) });
export const manualEvidenceInput = z.object({
  version: z.number().int().min(1),
  url: webUrl.pipe(z.string().min(1)),
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(3000),
});

export const researchSchema = z.object({
  summary: z.string().max(4000),
  platform: z.string().max(100),
  emails: z.array(z.email()).max(20),
  phones: z.array(z.string().max(100)).max(20),
  socials: z.array(webUrl).max(20),
  evidence: z.array(evidenceSchema).max(30),
  warnings: z.array(z.string().max(300)).max(12),
});
export type Research = z.infer<typeof researchSchema>;

export const campaignSchema = campaignInput.extend({
  id: z.uuid(),
  version: z.number(),
  createdAt: z.string(),
});
export type Campaign = z.infer<typeof campaignSchema>;

export const prospectSchema = prospectFields.extend({
  email: z.email().nullable(),
  id: z.uuid(),
  domain: z.string().nullable(),
  version: z.number(),
  status: z.enum(statuses),
  researchStatus: z.enum(["idle", "queued", "running", "complete", "failed"]),
  draftStatus: z.enum(["idle", "queued", "running", "complete", "failed"]),
  research: researchSchema.nullable(),
  evidence: z.array(evidenceSchema),
  score: z.number().nullable(),
  rationale: z.string(),
  draftSubject: z.string(),
  draftBody: z.string(),
  draftEvidenceIds: z.array(z.string()),
  draftModel: z.string(),
  approvalVersion: z.number().nullable(),
  draftCampaignVersion: z.number().nullable(),
  verificationStatus: z.enum(["unverified", "unknown", "valid", "invalid", "catch_all"]),
  lastError: z.string(),
  contactedAt: z.string().nullable(),
  followUpAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Prospect = z.infer<typeof prospectSchema>;
export const activitySchema = z.object({
  id: z.uuid(),
  kind: z.string(),
  detail: z.string(),
  actor: z.string(),
  createdAt: z.string(),
});
export type Activity = z.infer<typeof activitySchema>;
export const deliverySchema = z.object({
  id: z.uuid(),
  prospectId: z.uuid(),
  inputVersion: z.number(),
  senderPool: z.array(z.string()),
  senderId: z.string().nullable(),
  toAddress: z.string(),
  subject: z.string(),
  body: z.string(),
  status: z.enum(["queued", "sending", "sent", "failed", "uncertain", "cancelled"]),
  scheduledAt: z.string(),
  startedAt: z.string().nullable(),
  sentAt: z.string().nullable(),
  messageId: z.string(),
  lastError: z.string(),
  createdAt: z.string(),
});
export type Delivery = z.infer<typeof deliverySchema>;
export const queueEmailInput = z.object({
  prospects: z
    .array(z.object({ id: z.uuid(), version: z.number().int().min(1) }))
    .min(1)
    .max(100),
  senderIds: z
    .array(z.string().regex(/^[a-z0-9_-]{1,40}$/i))
    .min(1)
    .max(10),
  mode: z.enum(["now", "spread"]),
  startAt: z.iso.datetime().optional(),
  endAt: z.iso.datetime().optional(),
});
export type QueueEmailInput = z.infer<typeof queueEmailInput>;
export const queueEmailResult = z.object({
  queued: z.number(),
  deliveries: z.array(deliverySchema),
});
export const outboxListSchema = z.array(
  deliverySchema.extend({ prospectName: z.string(), currentVersion: z.number() }),
);
export const prospectDetailSchema = z.object({
  prospect: prospectSchema,
  activities: z.array(activitySchema),
  deliveries: z.array(deliverySchema).default([]),
});
export const listSchema = z.object({
  data: z.array(prospectSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export const overviewSchema = z.object({
  total: z.number(),
  review: z.number(),
  approved: z.number(),
  contacted: z.number(),
  due: z.number(),
  contactedToday: z.number(),
  replied: z.number(),
  meetings: z.number(),
  dailyLimit: z.number(),
});
export const mailboxSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  ownerName: z.string(),
  mine: z.boolean(),
  verifiedAt: z.string().nullable(),
});
export type MailboxSummary = z.infer<typeof mailboxSchema>;
export const settingsSchema = z.object({
  aiConfigured: z.boolean(),
  provider: z.enum(["groq", "gemini"]),
  requestsPerMinute: z.number(),
  requestsPerDay: z.number(),
  tokensPerMinute: z.number(),
  tokensPerDay: z.number(),
  model: z.string(),
  monthlyBudget: z.number(),
  monthSpent: z.number(),
  dailyLimit: z.number(),
  authMode: z.string(),
  emailSendingEnabled: z.boolean(),
  sendingSwitch: z.boolean(),
  autoPipeline: z.boolean(),
  leadSearchProvider: z.enum(["google", "openstreetmap"]).default("openstreetmap"),
  placesRequestsThisMonth: z.number().default(0),
  placesMonthlyLimit: z.number().default(0),
  mailboxes: z.array(mailboxSchema),
  role: z.enum(["admin", "member"]),
  companyName: z.string(),
});

export * from "./message";
export * from "./contact";
export const leadSearchSchema = z.object({
  id: z.string(),
  what: z.string(),
  location: z.string(),
  provider: z.enum(["google", "openstreetmap"]),
  requests: z.number(),
  found: z.number(),
  added: z.number(),
  duplicates: z.number(),
  skipped: z.number(),
  campaignId: z.string().nullable(),
  actor: z.string(),
  error: z.string(),
  createdAt: z.string(),
});
export type LeadSearch = z.infer<typeof leadSearchSchema>;
