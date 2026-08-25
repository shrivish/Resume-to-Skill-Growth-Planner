import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import {
  GAP_SEVERITIES,
  MAX_JOB_DESCRIPTIONS,
  SIGNAL_LABELS,
  SUPPORTED_TIMELINE_WEEKS,
  type AppHealth
} from "@rsgp/shared";
import { gapAnalysisRouter } from "./routes/gapAnalysis.js";
import { jobDescriptionRouter } from "./routes/jobDescriptions.js";
import { learningResourceRouter } from "./routes/learningResources.js";
import { planInputContextRouter } from "./routes/planInputContexts.js";
import { plannerRunRouter } from "./routes/plannerRuns.js";
import { projectRouter } from "./routes/projects.js";
import { resumeRouter } from "./routes/resumes.js";
import { roadmapRouter } from "./routes/roadmaps.js";
import { initializeDatabase } from "./services/database.js";
import { AiGenerationError } from "./services/llmProvider.js";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 4000);
const corsOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS origin not allowed: ${origin}`));
    }
  })
);
app.use(express.json({ limit: "5mb" }));

app.use("/gap-analysis", gapAnalysisRouter);
app.use("/job-descriptions", jobDescriptionRouter);
app.use("/learning-resources", learningResourceRouter);
app.use("/plan-input-contexts", planInputContextRouter);
app.use("/planner-runs", plannerRunRouter);
app.use("/projects", projectRouter);
app.use("/resumes", resumeRouter);
app.use("/roadmaps", roadmapRouter);

app.get("/health", (_request, response) => {
  const health: AppHealth = {
    status: "ok",
    service: "resume-to-skill-growth-planner",
    timestamp: new Date().toISOString()
  };

  response.json(health);
});

app.get("/contracts", (_request, response) => {
  response.json({
    timelines: SUPPORTED_TIMELINE_WEEKS,
    maxJobDescriptions: MAX_JOB_DESCRIPTIONS,
    signalLabels: SIGNAL_LABELS,
    gapSeverities: GAP_SEVERITIES
  });
});

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction
  ) => {
    if (error instanceof AiGenerationError) {
      console.error("[ai-generation]", {
        kind: error.kind,
        message: error.message,
        details: error.details
      });

      if (
        error.kind === "provider_runtime_failure" ||
        error.kind === "unsupported_provider"
      ) {
        response.status(503).json({
          error: "AI provider is unavailable. Check LLM_PROVIDER, OLLAMA_BASE_URL, and OLLAMA_MODEL.",
          failureKind: error.kind
        });
        return;
      }

      response.status(502).json({
        error: "AI generation failed validation. No invalid plan output was accepted.",
        failureKind: error.kind
      });
      return;
    }

    if (
      error instanceof Error &&
      (error.message.startsWith("Unsupported resume file type") ||
        error.message.startsWith("Unsupported document file type"))
    ) {
      response.status(415).json({ error: error.message });
      return;
    }

    if (error instanceof Error && error.name === "MulterError") {
      response.status(400).json({ error: error.message });
      return;
    }

    if (
      error instanceof Error &&
      (error.message === "Target role is required." ||
        error.message === "Request body is required." ||
        error.message === "parsedResume is required." ||
        error.message === "targetRole is required." ||
        error.message === "timelineWeeks must be 8, 12, or 24." ||
        error.message === "gapAnalysisItems is required." ||
        error.message === "jobDescriptions must be an array when provided." ||
        error.message === "plan title is required." ||
        error.message === "planner outputs are required." ||
        error.message === "completedTasks is required." ||
        error.message === "lastActiveStep must be inputs, gap, or roadmap." ||
        error.message === "jobDescriptionTexts must be an array when provided." ||
        error.message === "No more than 5 job descriptions can be saved in a draft." ||
        error.message === "jobDescriptionTexts must be a string or array." ||
        error.message === "Provide a resume file or pasted resume text." ||
        error.message.includes("job descriptions can be provided"))
    ) {
      response.status(400).json({ error: error.message });
      return;
    }

    if (
      error instanceof Error &&
      ("code" in error || error.message.includes("database") || error.message.includes("connect"))
    ) {
      response.status(503).json({
        error: "Persistence is unavailable. Check DATABASE_URL and PostgreSQL."
      });
      return;
    }

    if (
      error instanceof Error &&
      (error.message.includes("Ollama request failed") ||
        error.message.includes("fetch failed") ||
        error.message.includes("Unsupported LLM provider"))
    ) {
      response.status(503).json({
        error: "LLM provider is unavailable. Check LLM_PROVIDER, OLLAMA_BASE_URL, and OLLAMA_MODEL."
      });
      return;
    }

    console.error(error);
    response.status(500).json({ error: "Unexpected server error." });
  }
);

initializeDatabase().catch((error) => {
  console.error("PostgreSQL initialization failed. Persistence routes will return errors.", error);
});

const server = app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use. Stop the existing process or set a different PORT in .env.`
    );
    process.exit(1);
  }

  throw error;
});
