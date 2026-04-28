import { pool } from "@workspace/db";
import { logger } from "./logger";

const statements = [
  `ALTER TABLE tests ADD COLUMN IF NOT EXISTS exam_header text`,
  `ALTER TABLE tests ADD COLUMN IF NOT EXISTS exam_subheader text`,
  `ALTER TABLE tests ADD COLUMN IF NOT EXISTS instructions text`,
  `ALTER TABLE tests ADD COLUMN IF NOT EXISTS exam_config text`,
  `ALTER TABLE tests ADD COLUMN IF NOT EXISTS default_positive_marks real NOT NULL DEFAULT 1`,
  `ALTER TABLE tests ADD COLUMN IF NOT EXISTS default_negative_marks real NOT NULL DEFAULT 0`,
  `ALTER TABLE tests ADD COLUMN IF NOT EXISTS scheduled_at timestamptz`,
  `CREATE TABLE IF NOT EXISTS test_sections (
    id serial PRIMARY KEY,
    test_id integer NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    subject_label text,
    question_count integer,
    marks_per_question real,
    negative_marks real,
    meta text,
    "order" integer NOT NULL DEFAULT 0
  )`,
  `ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS section_id integer REFERENCES test_sections(id) ON DELETE SET NULL`,
  `ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS question_type text NOT NULL DEFAULT 'mcq'`,
  `ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS question_code text`,
  `ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual'`,
  `ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS subject_label text`,
  `ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS option_images text`,
  `ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS correct_answer_multi text`,
  `ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS correct_answer_min real`,
  `ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS correct_answer_max real`,
  `ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS negative_marks real NOT NULL DEFAULT 0`,
  `ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS meta text`,
  `ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS solution_text text`,
  `ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS solution_image_data text`,
  `ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS ai_solution_text text`,
  `CREATE TABLE IF NOT EXISTS test_question_bank_links (
    id serial PRIMARY KEY,
    test_id integer NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    test_question_id integer NOT NULL REFERENCES test_questions(id) ON DELETE CASCADE,
    question_bank_question_id integer NOT NULL REFERENCES question_bank_questions(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS test_question_bank_links_test_question_unique
    ON test_question_bank_links(test_question_id)`,
  `CREATE TABLE IF NOT EXISTS exam_templates (
    id serial PRIMARY KEY,
    key text NOT NULL,
    name text NOT NULL,
    description text
  )`,
  `ALTER TABLE exam_templates ADD COLUMN IF NOT EXISTS exam_header text`,
  `ALTER TABLE exam_templates ADD COLUMN IF NOT EXISTS exam_subheader text`,
  `ALTER TABLE exam_templates ADD COLUMN IF NOT EXISTS instructions text`,
  `ALTER TABLE exam_templates ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 180`,
  `ALTER TABLE exam_templates ADD COLUMN IF NOT EXISTS passing_score integer`,
  `ALTER TABLE exam_templates ADD COLUMN IF NOT EXISTS default_positive_marks real NOT NULL DEFAULT 1`,
  `ALTER TABLE exam_templates ADD COLUMN IF NOT EXISTS default_negative_marks real NOT NULL DEFAULT 0`,
  `ALTER TABLE exam_templates ADD COLUMN IF NOT EXISTS sections text NOT NULL DEFAULT '[]'`,
  `ALTER TABLE exam_templates ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false`,
  `ALTER TABLE exam_templates ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false`,
  `ALTER TABLE exam_templates ADD COLUMN IF NOT EXISTS show_in_registration boolean NOT NULL DEFAULT true`,
  `ALTER TABLE exam_templates ADD COLUMN IF NOT EXISTS created_by integer REFERENCES users(id) ON DELETE SET NULL`,
  `ALTER TABLE exam_templates ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`,
];

export async function ensureRuntimeSchema() {
  for (const statement of statements) {
    await pool.query(statement);
  }
  logger.info("Runtime schema check completed");
}
