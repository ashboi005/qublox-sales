import { pgTable, text, integer, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { prospects } from "./sales";
export type DeliveryState = "queued" | "sending" | "sent" | "failed" | "uncertain" | "cancelled";
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: text("id").primaryKey(),
    prospectId: text("prospect_id")
      .notNull()
      .references(() => prospects.id, { onDelete: "cascade" }),
    inputVersion: integer("input_version").notNull(),
    senderPool: jsonb("sender_pool").$type<string[]>().notNull(),
    senderId: text("sender_id"),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status").$type<DeliveryState>().notNull().default("queued"),
    scheduledAt: timestamp("scheduled_at").notNull(),
    startedAt: timestamp("started_at"),
    sentAt: timestamp("sent_at"),
    messageId: text("message_id").notNull().default(""),
    lastError: text("last_error").notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("email_due_idx").on(t.status, t.scheduledAt),
    uniqueIndex("email_one_pending_idx")
      .on(t.prospectId)
      .where(sql`${t.status} in ('queued','sending','uncertain')`),
  ],
);
