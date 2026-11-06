import { z } from "zod";

const schema = z
  .object({
    LLM_PROVIDER: z.enum(["groq", "gemini"]).default("groq"),
    GROQ_API_KEY: z.string().default(""),
    GEMINI_API_KEY: z.string().default(""),
    LLM_MODEL: z.string().default(""),
    LLM_RPM: z.coerce.number().int().min(1).max(60).default(1),
    LLM_RPD: z.coerce.number().int().min(1).max(10000).default(20),
    LLM_TPM: z.coerce.number().int().min(1).max(1000000).default(8000),
    LLM_TPD: z.coerce.number().int().min(1).max(10000000).default(100000),
    LLM_MONTHLY_BUDGET_USD: z.coerce.number().min(0).max(100).default(1),
    DAILY_CONTACT_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
    EMAIL_SENDING_ENABLED: z
      .preprocess(
        (v) => (v === true ? "true" : v === false ? "false" : v),
        z.enum(["true", "false"]).default("false"),
      )
      .transform((v) => v === "true"),
    GMAIL_ACCOUNTS_JSON: z.string().max(30000).default("[]"),
    GMAIL_SENDER_NAME: z
      .string()
      .max(80)
      .regex(/^[^\r\n]*$/)
      .default("Qublox"),
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
