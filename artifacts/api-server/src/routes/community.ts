import { Router } from "express";
import { db, communityPostsTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/community", async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const currentUserId = parseInt(userId);

  const posts = await db
    .select({
      id: communityPostsTable.id,
      authorId: communityPostsTable.authorId,
      authorName: usersTable.fullName,
      authorRole: usersTable.role,
      content: communityPostsTable.content,
      imageUrl: communityPostsTable.imageUrl,
      parentId: communityPostsTable.parentId,
      isPinned: communityPostsTable.isPinned,
      createdAt: communityPostsTable.createdAt,
    })
    .from(communityPostsTable)
    .leftJoin(usersTable, eq(communityPostsTable.authorId, usersTable.id))
    .orderBy(desc(communityPostsTable.createdAt));

  const enriched = posts.map((p) => ({
    ...p,
    isOwnPost: p.authorId === currentUserId,
  }));

  res.json(enriched);
});

router.post("/community", async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const { content, parentId, imageUrl } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: "Content is required" });

  const [post] = await db
    .insert(communityPostsTable)
    .values({
      authorId: parseInt(userId),
      content: content.trim(),
      imageUrl: imageUrl ?? null,
      parentId: parentId ? parseInt(parentId) : null,
      isPinned: false,
    })
    .returning();

  const author = await db
    .select({ fullName: usersTable.fullName, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, parseInt(userId)))
    .then((r) => r[0]);

  res.json({
    ...post,
    authorName: author?.fullName ?? "Unknown",
    authorRole: author?.role ?? "student",
    isOwnPost: true,
  });
});

router.patch("/community/:id/pin", async (req, res) => {
  const userId = req.cookies?.userId;
  const userRole = req.cookies?.userRole;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  if (userRole !== "admin" && userRole !== "super_admin") {
    return res.status(403).json({ error: "Only admins can pin messages" });
  }

  const postId = parseInt(req.params.id);
  const post = await db
    .select()
    .from(communityPostsTable)
    .where(eq(communityPostsTable.id, postId))
    .then((r) => r[0]);

  if (!post) return res.status(404).json({ error: "Post not found" });

  const [updated] = await db
    .update(communityPostsTable)
    .set({ isPinned: !post.isPinned })
    .where(eq(communityPostsTable.id, postId))
    .returning();

  res.json({ isPinned: updated.isPinned });
});

router.delete("/community/:id", async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, parseInt(userId)))
    .then((r) => r[0]);

  const postId = parseInt(req.params.id);
  const post = await db
    .select()
    .from(communityPostsTable)
    .where(eq(communityPostsTable.id, postId))
    .then((r) => r[0]);

  if (!post) return res.status(404).json({ error: "Post not found" });

  const isOwner = post.authorId === parseInt(userId);
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: "Not authorized to delete this post" });
  }

  await db.delete(communityPostsTable).where(eq(communityPostsTable.parentId, postId));
  await db.delete(communityPostsTable).where(eq(communityPostsTable.id, postId));

  res.sendStatus(204);
});

export { router as communityRouter };
