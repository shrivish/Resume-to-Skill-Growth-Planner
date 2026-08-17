import type { PlanInputContext, PlanInputContextResponse } from "@rsgp/shared";
import { getPool } from "./database.js";

type PlanInputContextRow = {
  id: string;
  plan_input_context: PlanInputContext;
  created_at: Date;
};

const toResponse = (row: PlanInputContextRow): PlanInputContextResponse => ({
  id: row.id,
  planInputContext: row.plan_input_context,
  createdAt: row.created_at.toISOString()
});

export const savePlanInputContext = async (
  planInputContext: PlanInputContext
): Promise<PlanInputContextResponse> => {
  const id = crypto.randomUUID();
  const now = new Date();
  const result = await getPool().query<PlanInputContextRow>(
    `INSERT INTO plan_input_contexts (
      id,
      plan_input_context,
      created_at
    )
    VALUES ($1, $2, $3)
    RETURNING *`,
    [id, JSON.stringify(planInputContext), now]
  );

  return toResponse(result.rows[0]);
};
