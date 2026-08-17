import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export const getPool = () => {
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL
  });

  return pool;
};

export const initializeDatabase = async () => {
  const client = await getPool().connect();

  try {
    await client.query("SELECT pg_advisory_lock(759314001)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS planner_runs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        target_role TEXT NOT NULL,
        timeline_weeks INTEGER NOT NULL,
        target_stack JSONB NOT NULL DEFAULT '[]'::jsonb,
        status TEXT NOT NULL,
        completed_tasks JSONB NOT NULL DEFAULT '{}'::jsonb,
        resume_result JSONB NOT NULL,
        jd_result JSONB NOT NULL,
        gap_result JSONB NOT NULL,
        roadmap_result JSONB NOT NULL,
        project_result JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        last_updated_at TIMESTAMPTZ NOT NULL
      );

      ALTER TABLE planner_runs
        ADD COLUMN IF NOT EXISTS learning_resource_result JSONB;

      CREATE TABLE IF NOT EXISTS planner_drafts (
        id TEXT PRIMARY KEY,
        target_role TEXT NOT NULL DEFAULT '',
        timeline_weeks INTEGER NOT NULL,
        target_stack_text TEXT NOT NULL DEFAULT '',
        resume_text TEXT NOT NULL DEFAULT '',
        resume_file_name TEXT NOT NULL DEFAULT '',
        job_description_texts JSONB NOT NULL DEFAULT '[]'::jsonb,
        last_active_step TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        last_updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS plan_input_contexts (
        id TEXT PRIMARY KEY,
        plan_input_context JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
    `);
  } finally {
    await client.query("SELECT pg_advisory_unlock(759314001)").catch(() => undefined);
    client.release();
  }
};

export const closeDatabase = async () => {
  await getPool().end();
  pool = null;
};
