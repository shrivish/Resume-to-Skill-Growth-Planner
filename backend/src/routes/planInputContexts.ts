import { Router } from "express";
import multer from "multer";
import type { PlanInputContextResponse } from "@rsgp/shared";
import { createLlmProvider } from "../services/llmProvider.js";
import { StructuredLlmDocumentParser } from "../services/llmDocumentParser.js";
import { PlanInputContextBuilder, PlanInputError } from "../services/planInputContextBuilder.js";
import { savePlanInputContext } from "../services/planInputContextRepository.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 6
  }
});
const createBuilder = () =>
  new PlanInputContextBuilder(new StructuredLlmDocumentParser(createLlmProvider()));

const getFiles = (files: Express.Request["files"], fieldName: string): Express.Multer.File[] => {
  if (!files || Array.isArray(files)) {
    return [];
  }

  return files[fieldName] ?? [];
};

router.post(
  "/",
  upload.fields([
    { name: "resume", maxCount: 1 },
    { name: "jobDescriptionFiles", maxCount: 5 }
  ]),
  async (request, response, next) => {
    try {
      const planInputContext = await createBuilder().build({
        targetRole: request.body.targetRole,
        timelineWeeks: request.body.timelineWeeks,
        targetStack: request.body.targetStack ?? request.body.targetStackText,
        resumeText: request.body.resumeText,
        resumeFile: getFiles(request.files, "resume")[0],
        jobDescriptionTexts: request.body.jobDescriptionTexts,
        jobDescriptionFiles: getFiles(request.files, "jobDescriptionFiles")
      });

      if (planInputContext.inputQuality.needsTargetStack) {
        response.status(422).json({
          error: "Add a preferred stack or focus before continuing.",
          planInputContext
        });
        return;
      }

      const savedContext: PlanInputContextResponse = await savePlanInputContext(planInputContext);

      response.status(201).json(savedContext);
    } catch (error) {
      if (error instanceof PlanInputError) {
        response.status(error.statusCode).json({
          error: error.message,
          warnings: error.warnings
        });
        return;
      }

      next(error);
    }
  }
);

export const planInputContextRouter = router;
