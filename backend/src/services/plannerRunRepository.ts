import type {
  CreatePlannerRunRequest,
  SavedPlannerRun,
  UpdatePlannerRunCompletionRequest
} from "@rsgp/shared";
import { getPool } from "./database.js";

type PlannerRunRow = {
  id: string;
  title: string;
  target_role: string;
  timeline_weeks: number;
  target_stack: string[];
  status: SavedPlannerRun["status"];
  completed_tasks: Record<string, boolean>;
  resume_result: SavedPlannerRun["resumeResult"];
  jd_result: SavedPlannerRun["jdResult"];
  gap_result: SavedPlannerRun["gapResult"];
  roadmap_result: SavedPlannerRun["roadmapResult"];
  learning_resource_result: SavedPlannerRun["learningResourceResult"];
  project_result: SavedPlannerRun["projectResult"];
  created_at: Date;
  last_updated_at: Date;
};

const toPlannerRun = (row: PlannerRunRow): SavedPlannerRun => ({
  id: row.id,
  title: row.title,
  targetRole: row.target_role,
  timelineWeeks: row.timeline_weeks as SavedPlannerRun["timelineWeeks"],
  targetStack: row.target_stack,
  createdAt: row.created_at.toISOString(),
  lastUpdatedAt: row.last_updated_at.toISOString(),
  status: row.status,
  completedTasks: row.completed_tasks,
  resumeResult: row.resume_result,
  jdResult: row.jd_result,
  gapResult: row.gap_result,
  roadmapResult: row.roadmap_result,
  learningResourceResult: row.learning_resource_result,
  projectResult: row.project_result
});

export const listPlannerRuns = async (): Promise<SavedPlannerRun[]> => {
  const result = await getPool().query<PlannerRunRow>(
    `SELECT *
     FROM planner_runs
     ORDER BY last_updated_at DESC`
  );

  return result.rows.map(toPlannerRun);
};

export const getPlannerRun = async (id: string): Promise<SavedPlannerRun | null> => {
  const result = await getPool().query<PlannerRunRow>("SELECT * FROM planner_runs WHERE id = $1", [
    id
  ]);
  const row = result.rows[0];

  return row ? toPlannerRun(row) : null;
};

export const deletePlannerRun = async (id: string): Promise<boolean> => {
  const result = await getPool().query("DELETE FROM planner_runs WHERE id = $1", [id]);

  return (result.rowCount ?? 0) > 0;
};

export const createPlannerRun = async (
  input: CreatePlannerRunRequest
): Promise<SavedPlannerRun> => {
  const id = crypto.randomUUID();
  const now = new Date();

  const result = await getPool().query<PlannerRunRow>(
    `INSERT INTO planner_runs (
      id,
      title,
      target_role,
      timeline_weeks,
      target_stack,
      status,
      completed_tasks,
      resume_result,
      jd_result,
      gap_result,
      roadmap_result,
      learning_resource_result,
      project_result,
      created_at,
      last_updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
    RETURNING *`,
    [
      id,
      input.title,
      input.targetRole,
      input.timelineWeeks,
      JSON.stringify(input.targetStack),
      input.status,
      JSON.stringify(input.completedTasks),
      JSON.stringify(input.resumeResult),
      JSON.stringify(input.jdResult),
      JSON.stringify(input.gapResult),
      JSON.stringify(input.roadmapResult),
      input.learningResourceResult ? JSON.stringify(input.learningResourceResult) : null,
      JSON.stringify(input.projectResult),
      now
    ]
  );

  return toPlannerRun(result.rows[0]);
};

export const updatePlannerRunCompletion = async (
  id: string,
  input: UpdatePlannerRunCompletionRequest
): Promise<SavedPlannerRun | null> => {
  const result = await getPool().query<PlannerRunRow>(
    `UPDATE planner_runs
     SET completed_tasks = $2,
         status = $3,
         last_updated_at = $4
     WHERE id = $1
     RETURNING *`,
    [id, JSON.stringify(input.completedTasks), input.status ?? "In Progress", new Date()]
  );
  const row = result.rows[0];

  return row ? toPlannerRun(row) : null;
};
