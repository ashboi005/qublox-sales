import { z } from "zod";

const schema = z
  .object({
    LLM_PROVIDER: z.enum(["groq", "gemini"]).default("groq"),
    GROQ_API_KEY: z.string().default(""),
    GEMINI_API_KEY: z.string().default(""),
    LLM_MODEL: z.string().default(""),
    // With both keys set, drafts alternate between Groq and Gemini and each covers for the
    // other when it is rate limited or failing. "false" uses only LLM_PROVIDER.
    LLM_ROTATE: z
      .preprocess(
        (v) => (v === true ? "true" : v === false ? "false" : v),
        z.enum(["true", "false"]).default("true"),
      )
      .transform((v) => v === "true"),
    // Per-provider allowances, kept under each free tier. A 429 still backs off on its own.
    // Groq GPT-OSS 20B free plan: 30 RPM, 1,000 RPD, 8,000 TPM, 200,000 TPD.
    GROQ_RPM: z.coerce.number().int().min(1).max(1000).default(20),
    GROQ_RPD: z.coerce.number().int().min(1).max(100000).default(800),
    GROQ_TPM: z.coerce.number().int().min(1).max(10000000).default(8000),
    GROQ_TPD: z.coerce.number().int().min(1).max(100000000).default(180000),
    // Google sets Gemini free-tier limits per project; read yours in AI Studio.
    GEMINI_RPM: z.coerce.number().int().min(1).max(1000).default(10),
    GEMINI_RPD: z.coerce.number().int().min(1).max(100000).default(250),
    GEMINI_TPM: z.coerce.number().int().min(1).max(10000000).default(200000),
    GEMINI_TPD: z.coerce.number().int().min(1).max(100000000).default(2000000),
    LLM_MONTHLY_BUDGET_USD: z.coerce.number().min(0).max(100).default(1),
    // New leads with an offer are researched, then drafted, without clicks. Approval stays human.
    AUTO_PIPELINE: z
      .preprocess(
        (v) => (v === true ? "true" : v === false ? "false" : v),
        z.enum(["true", "false"]).default("true"),
      )
      .transform((v) => v === "true"),
    DAILY_CONTACT_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
    EMAIL_SENDING_ENABLED: z
      .preprocess(
        (v) => (v === true ? "true" : v === false ? "false" : v),
        z.enum(["true", "false"]).default("false"),
      )
      .transform((v) => v === "true"),
    // Google Places API (New) key for "Find leads". Empty uses OpenStreetMap instead.
    GOOGLE_PLACES_API_KEY: z.string().default(""),
    // Stays under Google's 1,000 free Text Search Enterprise requests a month.
    PLACES_MONTHLY_REQUEST_LIMIT: z.coerce.number().int().min(0).max(100000).default(900),
    // Website audit: Google PageSpeed Insights (free API, no billing). Empty skips the
    // speed test; the on-page checks still run.
    PAGESPEED_API_KEY: z.string().default(""),
    // When our own fetch cannot read a site, try Jina Reader (free, no key) and then
    // Firecrawl (free plan, no card). "false" turns both off.
    PAGE_READER_FALLBACK: z
      .preprocess(
        (v) => (v === true ? "true" : v === false ? "false" : v),
        z.enum(["true", "false"]).default("true"),
      )
      .transform((v) => v === "true"),
    // Optional. Without a key Jina is free at 20 pages a minute and can never bill.
    JINA_API_KEY: z.string().default(""),
    FIRECRAWL_API_KEY: z.string().default(""),
    // Firecrawl's free plan has 1,000 pages a month; stop locally before that.
    FIRECRAWL_MONTHLY_LIMIT: z.coerce.number().int().min(0).max(100000).default(900),
    // On-demand email verification (Reoon). Never runs automatically.
    REOON_API_KEY: z.string().default(""),
    // Reoon's free plan gives about 600 checks a month; stop locally before that.
    REOON_MONTHLY_LIMIT: z.coerce.number().int().min(0).max(100000).default(500),
    // Also the key source for encrypting stored Gmail App Passwords.
    BETTER_AUTH_SECRET: z.string().default(""),
    COMPANY_NAME: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^[^\r\n{}\[\]]*$/)
      .default("Qublox"),
    EMAIL_MIN_INTERVAL_SECONDS: z.coerce.number().int().min(60).max(86400).default(120),
    EMAIL_ACCOUNT_INTERVAL_SECONDS: z.coerce.number().int().min(60).max(86400).default(600),
  })
  .superRefine((c, ctx) => {
    const models =
      c.LLM_PROVIDER === "groq"
        ? ["openai/gpt-oss-20b", "openai/gpt-oss-120b"]
        : ["gemini-2.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite"];
    if (c.LLM_MODEL && !models.includes(c.LLM_MODEL))
      ctx.addIssue({
        code: "custom",
        path: ["LLM_MODEL"],
        message: "Choose a supported model for the selected provider; see docs/ai.md.",
      });
  });
export type SalesConfig = z.infer<typeof schema>;
export function salesConfig(env: Record<string, unknown>): SalesConfig {
  return schema.parse(env);
}
