import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users";

export const communityPostsTable = pgTable("community_posts", (t) => ({
  id: serial("id").primaryKey(),
  authorId: integer("author_id").notNull().references(() => usersTable.id),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  parentId: integer("parent_id"),
  isPinned: boolean("is_pinned").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}));

export const insertCommunityPostSchema = createInsertSchema(communityPostsTable).omit({ id: true, createdAt: true });
export type CommunityPost = typeof communityPostsTable.$inferSelect;
