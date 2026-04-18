# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## EduConnect EdTech Platform

### Artifact: `artifacts/edtech` (web, slug: edtech, previewPath: /)
A 3-level EdTech platform built with React + Vite.

**Seeded Demo Users:**
- Super Admin username: `Sameer`
- Sample Teacher username: `Sameer_Teacher`
- Sample Approved Student username: `Sameer_Student`
- Set passwords using env vars: `SEED_SUPER_ADMIN_PASSWORD`, `SEED_TEACHER_PASSWORD`, `SEED_STUDENT_PASSWORD`

**Password Hashing:** `SHA256(password + "edtech_salt_2024")`

**Authentication:** HTTP-only cookie (`userId`), cookie-parser + CORS with credentials

**Pages Built:**
- `/` — Login page (redirects to role dashboard if logged in)
- `/register` — Student self-registration (pending approval workflow)
- `/super-admin/dashboard` — Platform overview stats
- `/super-admin/admins` — Create/delete admin accounts
- `/super-admin/students` — View all students with statuses
- `/super-admin/classes` — View all classes platform-wide
- `/admin/dashboard` — Teacher overview (classes, students, pending approvals)
- `/admin/classes` — Create/manage classes (start/end/delete)
- `/admin/class/:id` — Class detail with student list and whiteboard link
- `/admin/students` — Approve/reject student registrations
- `/admin/whiteboard/:classId` — Interactive canvas whiteboard (teacher)
- `/admin/support` — Admin support tickets management (view all tickets, respond, update status)
- `/student/dashboard` — Student overview (enrolled classes, live classes, available classes)
- `/student/classes` — Browse all classes, enroll
- `/student/class/:id` — Class detail, enroll, join whiteboard
- `/student/whiteboard/:classId` — Interactive canvas whiteboard (student)
- `/student/feedback` — Submit star rating + comment feedback for completed/live classes
- `/student/support` — Create and track support tickets; view admin responses
- `/student/assignments` — View & submit assignments (file upload + comment, resubmit, see grades/feedback)
- `/student/progress` — Personal report card: test history chart, assignment grades, attendance by class
- `/admin/assignments` — Create/edit/delete assignments; view all submissions; grade with marks + feedback
- `/admin/attendance` — Mark attendance (present/late/absent) per class per date
- `/leaderboard` — Ranked leaderboard (all roles); scores based on tests 50% + assignments 30% + attendance 20%
- Notification bell in sidebar header for all roles; shows unread count badge; mark read / delete

**Whiteboard Features:** Pen, Eraser, Line, Rectangle, Circle tools; 8 color palette; size slider; save/load via API

### Artifact: `artifacts/api-server` (api)
Express 5 backend with:
- `POST /api/auth/login` — Login with username/password
- `POST /api/auth/register` — Student self-register (status: pending)
- `POST /api/auth/logout`
- `GET /api/auth/me` — Current user from cookie
- `GET /api/users` — List users (with role filter)
- `POST /api/users/admin` — Create admin
- `DELETE /api/users/:id` — Delete user
- `PATCH /api/users/:id/approve` — Approve/reject student
- `GET /api/classes` — List classes
- `POST /api/classes` — Create class (admin only)
- `GET /api/classes/:id` — Get class detail
- `POST /api/classes/:id/start` — Start class (live)
- `POST /api/classes/:id/end` — End class (completed)
- `POST /api/classes/:id/enroll` — Student enroll
- `GET /api/classes/:id/enrollments` — List enrolled students
- `GET /api/whiteboard/:classId` — Load whiteboard JSON data
- `PUT /api/whiteboard/:classId` — Save whiteboard JSON data
- `GET /api/dashboard/super-admin` — Super admin stats
- `GET /api/dashboard/admin` — Teacher/admin stats
- `GET /api/dashboard/student` — Student stats
- `POST /api/feedback` — Student submits class feedback (rating 1-5 + optional comment)
- `GET /api/feedback/class/:classId` — List all feedback for a class
- `GET /api/support` — List support tickets (students see own, admins see all)
- `POST /api/support` — Student creates new support ticket
- `PATCH /api/support/:id/respond` — Admin responds to a ticket and updates status
- `POST /api/chapters/:chapterId/question-bank-questions/ai-extract` — AI extraction of manual/PDF/OCR text into question drafts
- `POST /api/chapters/:chapterId/question-bank-questions/bulk` — Bulk save reviewed AI-extracted question drafts

**AI Extraction Setup:**
- Set `OPENAI_API_KEY` on the API server to enable AI question extraction
- Optional: set `OPENAI_MODEL` to override the default model (`gpt-5.4-mini`)

### Database Schema (PostgreSQL)
- `users`: id, username, password_hash, full_name, email, phone, role (super_admin|admin|student), status (pending|approved|rejected), subject, created_at
- `classes`: id, title, subject, description, admin_id, status (scheduled|live|completed|cancelled), scheduled_at, started_at, ended_at, max_students, meeting_link, created_at
- `enrollments`: id, class_id, student_id, enrolled_at
- `whiteboards`: id, class_id, data (JSON text), updated_at
- `feedback`: id, class_id, student_id, rating (1-5), comment (nullable), created_at
- `support_tickets`: id, student_id, subject, message, status (open|in_progress|resolved), admin_response, responded_by, created_at, updated_at
