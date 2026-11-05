import { z } from "zod";

const schema = z.object({
  ALLOWED_EMAILS: z.string().default(""),
  MERGE_GATEWAY_API_KEY: z.string().default(""),
  MERGE_MODEL: z.string().default(""),
  LLM_MONTHLY_BUDGET_USD: z.coerce.number().min(0).max(100).default(5),
  DAILY_CONTACT_LIMIT: z.coerce.number().int().min(1).max(100).default(5),
});
export type SalesConfig = z.infer<typeof schema>;
export function salesConfig(env: Record<string, unknown>): SalesConfig {
  return schema.parse(env);
}
