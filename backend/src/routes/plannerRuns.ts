import { Router } from "express";
import type {
  CreatePlannerRunRequest,
  SavePlannerDraftRequest,
  TimelineWeeks,
  UpdatePlannerRunCompletionRequest
} from "@rsgp/shared";
import {
  deletePlannerDraft,
  getLatestPlannerDraft,
  savePlannerDraft
} from "../services/plannerDraftRepository.js";
import {
  createPlannerRun,
  deletePlannerRun,
  getPlannerRun,
  listPlannerRuns,
  updatePlannerRunCompletion
} from "../services/plannerRunRepository.js";

const router = Router();

const validateCreateRequest = (body: unknown): CreatePlannerRunRequest => {
  if (typeof body !== "object" || body === null) {
    throw new Error("Request body is required.");
  }

  const candidate = body as Partial<CreatePlannerRunRequest>;

  if (typeof candidate.title !== "string" || candidate.title.trim().length < 2) {
    throw new Error("plan title is required.");
  }

  if (typeof candidate.targetRole !== "string" || candidate.targetRole.trim().length < 2) {
    throw new Error("targetRole is required.");
  }

  const timelineWeeks = Number(candidate.timelineWeeks);

  if (![8, 12, 24].includes(timelineWeeks)) {
    throw new Error("timelineWeeks must be 8, 12, or 24.");
  }

  if (
    !candidate.resumeResult ||
    !candidate.jdResult ||
    !candidate.gapResult ||
    !candidate.roadmapResult ||
    !candidate.projectResult
  ) {
    throw new Error("planner outputs are required.");
  }

  return {
    title: candidate.title.trim(),
    targetRole: candidate.targetRole.trim(),
    timelineWeeks: timelineWeeks as TimelineWeeks,
    targetStack: Array.isArray(candidate.targetStack) ? candidate.targetStack : [],
    status: candidate.status ?? "Ready",
    completedTasks: candidate.completedTasks ?? {},
    resumeResult: candidate.resumeResult,
    jdResult: candidate.jdResult,
    gapResult: candidate.gapResult,
    roadmapResult: candidate.roadmapResult,
    projectResult: candidate.projectResult
  };
};

const isTimelineWeeks = (value: number): value is TimelineWeeks => [8, 12, 24].includes(value);

const validateDraftRequest = (body: unknown): SavePlannerDraftRequest => {
  if (typeof body !== "object" || body === null) {
    throw new Error("Request body is required.");
  }

  const candidate = body as Partial<SavePlannerDraftRequest>;
  const timelineWeeks = Number(candidate.timelineWeeks);

  if (!isTimelineWeeks(timelineWeeks)) {
    throw new Error("timelineWeeks must be 8, 12, or 24.");
  }

  if (
    candidate.lastActiveStep !== "inputs" &&
    candidate.lastActiveStep !== "gap" &&
    candidate.lastActiveStep !== "roadmap"
  ) {
    throw new Error("lastActiveStep must be inputs, gap, or roadmap.");
  }

  if (
    candidate.jobDescriptionTexts !== undefined &&
    !Array.isArray(candidate.jobDescriptionTexts)
  ) {
    throw new Error("jobDescriptionTexts must be an array when provided.");
  }

  if ((candidate.jobDescriptionTexts?.length ?? 0) > 5) {
    throw new Error("No more than 5 job descriptions can be saved in a draft.");
  }

  return {
    id: typeof candidate.id === "string" ? candidate.id.trim() : undefined,
    targetRole: candidate.targetRole?.trim() ?? "",
    timelineWeeks,
    targetStackText: candidate.targetStackText?.trim() ?? "",
    resumeText: candidate.resumeText ?? "",
    resumeFileName: candidate.resumeFileName?.trim() ?? "",
    jobDescriptionTexts: (candidate.jobDescriptionTexts ?? []).map((text) => String(text)),
    lastActiveStep: candidate.lastActiveStep
  };
};

const validateCompletionRequest = (body: unknown): UpdatePlannerRunCompletionRequest => {
  if (typeof body !== "object" || body === null) {
    throw new Error("Request body is required.");
  }

  const candidate = body as Partial<UpdatePlannerRunCompletionRequest>;

  if (typeof candidate.completedTasks !== "object" || candidate.completedTasks === null) {
    throw new Error("completedTasks is required.");
  }

  return {
    completedTasks: candidate.completedTasks,
    status: candidate.status ?? "In Progress"
  };
};

router.get("/draft", async (_request, response, next) => {
  try {
    response.json(await getLatestPlannerDraft());
  } catch (error) {
    next(error);
  }
});

router.post("/draft", async (request, response, next) => {
  try {
    response.status(201).json(await savePlannerDraft(validateDraftRequest(request.body)));
  } catch (error) {
    next(error);
  }
});

router.delete("/draft/:id", async (request, response, next) => {
  try {
    const deleted = await deletePlannerDraft(request.params.id);

    if (!deleted) {
      response.status(404).json({ error: "Planner draft not found." });
      return;
    }

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get("/", async (_request, response, next) => {
  try {
    response.json(await listPlannerRuns());
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (request, response, next) => {
  try {
    const plannerRun = await getPlannerRun(request.params.id);

    if (!plannerRun) {
      response.status(404).json({ error: "Planner run not found." });
      return;
    }

    response.json(plannerRun);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (request, response, next) => {
  try {
    const plannerRun = await createPlannerRun(validateCreateRequest(request.body));

    response.status(201).json(plannerRun);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (request, response, next) => {
  try {
    const deleted = await deletePlannerRun(request.params.id);

    if (!deleted) {
      response.status(404).json({ error: "Planner run not found." });
      return;
    }

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/completed-tasks", async (request, response, next) => {
  try {
    const plannerRun = await updatePlannerRunCompletion(
      request.params.id,
      validateCompletionRequest(request.body)
    );

    if (!plannerRun) {
      response.status(404).json({ error: "Planner run not found." });
      return;
    }

    response.json(plannerRun);
  } catch (error) {
    next(error);
  }
});

export const plannerRunRouter = router;
