import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

export type TeamRole = "admin" | "member";
// Only the offline administrator CLI grants membership or roles. Public signup stays closed.
export const teamMember = pgTable("team_member", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(true),
  role: text("role").$type<TeamRole>().notNull().default("member"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One Gmail sender per teammate. The App Password is encrypted at rest and never returned.
export const mailbox = pgTable("mailbox", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  secret: text("secret").notNull(),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
