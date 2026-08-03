import { Router } from "express";
import multer from "multer";
import type { ResumeParseResponse } from "@rsgp/shared";
import { extractResumeText } from "../services/resumeExtraction.js";
import { HeuristicResumeParser } from "../services/resumeParser.js";
import { validateResumeText } from "../services/resumeValidation.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

const resumeParser = new HeuristicResumeParser();

router.post("/parse", upload.single("resume"), async (request, response, next) => {
  try {
    const pastedText =
      typeof request.body.resumeText === "string" ? request.body.resumeText.trim() : "";

    if (!request.file && pastedText.length === 0) {
      response.status(400).json({
        error: "Provide a resume file in the 'resume' field or pasted text in 'resumeText'."
      });
      return;
    }

    const extracted = await extractResumeText(
      request.file
        ? {
            sourceType: "file",
            file: request.file
          }
        : {
            sourceType: "text",
            text: pastedText
          }
    );

    const validation = validateResumeText(extracted.text);
    const blockingErrors = validation.warnings.filter((warning) => warning.severity === "error");

    if (blockingErrors.length > 0) {
      response.status(422).json({
        error: "Resume text could not be parsed.",
        warnings: blockingErrors
      });
      return;
    }

    const parsedResume = await resumeParser.parse(validation.normalizedText, validation.warnings);
    const warnings = parsedResume.warnings ?? validation.warnings;

    const payload: ResumeParseResponse = {
      metadata: {
        inputKind: extracted.inputKind,
        fileName: extracted.fileName,
        mimeType: extracted.mimeType,
        sizeBytes: extracted.sizeBytes,
        characterCount: validation.normalizedText.length
      },
      parsedResume,
      extractedTextPreview: validation.normalizedText.slice(0, 500),
      warnings
    };

    response.json(payload);
  } catch (error) {
    next(error);
  }
});

export const resumeRouter = router;
