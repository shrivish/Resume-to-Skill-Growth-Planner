import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import type { ResumeInputKind } from "@rsgp/shared";

type ExtractResumeTextInput =
  | {
      sourceType: "file";
      file: Express.Multer.File;
    }
  | {
      sourceType: "text";
      text: string;
    };

export type ExtractedResumeText = {
  text: string;
  inputKind: ResumeInputKind;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
};

const getFileExtension = (fileName: string) => fileName.split(".").pop()?.toLowerCase();

const inferInputKind = (file: Express.Multer.File): ResumeInputKind => {
  const extension = getFileExtension(file.originalname);

  if (file.mimetype === "application/pdf" || extension === "pdf") {
    return "pdf";
  }

  if (
    file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === "docx"
  ) {
    return "docx";
  }

  if (file.mimetype.startsWith("text/") || extension === "txt") {
    return "text";
  }

  throw new Error("Unsupported resume file type. Upload a PDF, DOCX, TXT file, or paste text.");
};

export const extractResumeText = async (
  input: ExtractResumeTextInput
): Promise<ExtractedResumeText> => {
  if (input.sourceType === "text") {
    return {
      text: input.text,
      inputKind: "text"
    };
  }

  const inputKind = inferInputKind(input.file);
  let text = "";

  if (inputKind === "pdf") {
    const parser = new PDFParse({ data: input.file.buffer });
    const result = await parser.getText();
    await parser.destroy();
    text = result.text;
  }

  if (inputKind === "docx") {
    const result = await mammoth.extractRawText({ buffer: input.file.buffer });
    text = result.value;
  }

  if (inputKind === "text") {
    text = input.file.buffer.toString("utf-8");
  }

  return {
    text,
    inputKind,
    fileName: input.file.originalname,
    mimeType: input.file.mimetype,
    sizeBytes: input.file.size
  };
};
