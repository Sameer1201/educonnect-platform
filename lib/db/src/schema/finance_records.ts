import { pgTable, serial, integer, text, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users";

export const financeTypeEnum = pgEnum("finance_type", ["income", "expense"]);

export const financeRecordsTable = pgTable("finance_records", (t) => ({
  id: serial("id").primaryKey(),
  type: financeTypeEnum("type").notNull(),
  category: text("category").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description"),
  recordDate: timestamp("record_date").notNull().defaultNow(),
  createdBy: integer("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}));

export const insertFinanceRecordSchema = createInsertSchema(financeRecordsTable).omit({ id: true, createdAt: true });
export type FinanceRecord = typeof financeRecordsTable.$inferSelect;
