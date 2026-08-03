import type { SavePlannerDraftRequest, SavedPlannerDraft } from "@rsgp/shared";
import { getPool } from "./database.js";

type PlannerDraftRow = {
  id: string;
  target_role: string;
  timeline_weeks: number;
  target_stack_text: string;
  resume_text: string;
  resume_file_name: string;
  job_description_texts: string[];
  last_active_step: SavedPlannerDraft["lastActiveStep"];
  created_at: Date;
  last_updated_at: Date;
};

const toPlannerDraft = (row: PlannerDraftRow): SavedPlannerDraft => ({
  id: row.id,
  status: "draft",
  targetRole: row.target_role,
  timelineWeeks: row.timeline_weeks as SavedPlannerDraft["timelineWeeks"],
  targetStackText: row.target_stack_text,
  resumeText: row.resume_text,
  resumeFileName: row.resume_file_name,
  jobDescriptionTexts: row.job_description_texts,
  lastActiveStep: row.last_active_step,
  createdAt: row.created_at.toISOString(),
  lastUpdatedAt: row.last_updated_at.toISOString()
});

export const getLatestPlannerDraft = async (): Promise<SavedPlannerDraft | null> => {
  const result = await getPool().query<PlannerDraftRow>(
    `SELECT *
     FROM planner_drafts
     ORDER BY last_updated_at DESC
     LIMIT 1`
  );
  const row = result.rows[0];

  return row ? toPlannerDraft(row) : null;
};

export const savePlannerDraft = async (
  input: SavePlannerDraftRequest
): Promise<SavedPlannerDraft> => {
  const id = input.id?.trim() || crypto.randomUUID();
  const now = new Date();

  const result = await getPool().query<PlannerDraftRow>(
    `INSERT INTO planner_drafts (
      id,
      target_role,
      timeline_weeks,
      target_stack_text,
      resume_text,
      resume_file_name,
      job_description_texts,
      last_active_step,
      created_at,
      last_updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
    ON CONFLICT (id)
    DO UPDATE SET
      target_role = EXCLUDED.target_role,
      timeline_weeks = EXCLUDED.timeline_weeks,
      target_stack_text = EXCLUDED.target_stack_text,
      resume_text = EXCLUDED.resume_text,
      resume_file_name = EXCLUDED.resume_file_name,
      job_description_texts = EXCLUDED.job_description_texts,
      last_active_step = EXCLUDED.last_active_step,
      last_updated_at = EXCLUDED.last_updated_at
    RETURNING *`,
    [
      id,
      input.targetRole,
      input.timelineWeeks,
      input.targetStackText,
      input.resumeText,
      input.resumeFileName,
      JSON.stringify(input.jobDescriptionTexts),
      input.lastActiveStep,
      now
    ]
  );

  return toPlannerDraft(result.rows[0]);
};

export const deletePlannerDraft = async (id: string): Promise<boolean> => {
  const result = await getPool().query("DELETE FROM planner_drafts WHERE id = $1", [id]);

  return (result.rowCount ?? 0) > 0;
};
