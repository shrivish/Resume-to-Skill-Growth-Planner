import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GapAnalysisItem, ProjectRecommendationRequest } from "@rsgp/shared";
import { recommendProjects, scoreProjectCandidates } from "./projectRecommendationEngine.js";

const gap = (
  skillName: string,
  options: Partial<GapAnalysisItem> = {}
): GapAnalysisItem => ({
  skillName,
  category: options.category ?? "frameworks",
  currentLevel: options.currentLevel ?? "Not shown",
  targetLevel: options.targetLevel ?? "Interview-ready",
  gapSeverity: options.gapSeverity ?? "Critical",
  reason: options.reason ?? `${skillName} is required by the target role.`,
  signalStrength: options.signalStrength ?? "Strong signal",
  evidenceSources: options.evidenceSources ?? []
});

describe("projectRecommendationEngine", () => {
  it("returns two portfolio projects and one proof-of-work recommendation", async () => {
    const output = await recommendProjects({
      targetRole: "Backend Engineer",
      timelineWeeks: 12,
      targetStack: ["Node.js", "PostgreSQL", "Docker", "Jest"],
      gapAnalysisItems: [
        gap("Node.js"),
        gap("PostgreSQL", { category: "databases" }),
        gap("Docker", { category: "cloud" }),
        gap("Jest", { category: "tools" })
      ]
    });

    assert.equal(output.recommendations.length, 3);
    assert.equal(
      output.recommendations.filter((recommendation) => recommendation.type === "portfolio")
        .length,
      2
    );
    assert.equal(
      output.recommendations.filter((recommendation) => recommendation.type === "proof-of-work")
        .length,
      1
    );
    assert.ok(
      output.recommendations.every(
        (recommendation) =>
          recommendation.description.length > 40 && recommendation.buildSteps.length >= 4
      )
    );
    assert.ok(
      output.recommendations.every((recommendation) =>
        recommendation.resources.some(
          (resource) => resource.type === "github" && resource.url?.startsWith("https://github.com/")
        )
      )
    );
  });

  it("scores backend API work highly for backend gaps", () => {
    const request: ProjectRecommendationRequest = {
      targetRole: "Backend Engineer",
      timelineWeeks: 12,
      targetStack: ["Node.js", "Express", "PostgreSQL"],
      gapAnalysisItems: [
        gap("REST API"),
        gap("PostgreSQL", { category: "databases" }),
        gap("Integration testing", { category: "tools" })
      ]
    };

    const topCandidate = scoreProjectCandidates(request)[0];

    assert.equal(topCandidate.candidate.id, "backend-api-platform");
    assert.ok(topCandidate.coveredSkills.includes("REST API"));
    assert.ok(topCandidate.scoreBreakdown.roleAlignment > 0.9);
  });

  it("keeps 8-week recommendations within the Section 4 duration guidance", async () => {
    const output = await recommendProjects({
      targetRole: "Full Stack Engineer",
      timelineWeeks: 8,
      targetStack: ["React", "TypeScript", "Node.js", "PostgreSQL"],
      gapAnalysisItems: [
        gap("React"),
        gap("TypeScript", { category: "languages" }),
        gap("Node.js"),
        gap("PostgreSQL", { category: "databases" }),
        gap("Testing Library", { category: "tools" })
      ]
    });

    assert.ok(
      output.recommendations.every(
        (recommendation) => recommendation.estimatedDurationWeeks >= 1
      )
    );
    assert.ok(
      output.recommendations
        .filter((recommendation) => recommendation.type === "portfolio")
        .every((recommendation) => recommendation.estimatedDurationWeeks <= 4)
    );
  });

  it("uses LLM refinement only to rewrite wording for selected recommendations", async () => {
    const output = await recommendProjects(
      {
        targetRole: "Frontend Engineer",
        timelineWeeks: 12,
        targetStack: ["React", "TypeScript", "Testing Library"],
        gapAnalysisItems: [
          gap("React"),
          gap("Testing Library", { category: "tools" }),
          gap("Accessibility", { category: "other", gapSeverity: "Important" })
        ]
      },
      {
        llmProvider: {
          async generateJson() {
            return {
              recommendations: [
                {
                  index: 0,
                  title: "Frontend Engineer Interview-Ready Admin Dashboard",
                  description:
                    "Build a focused dashboard that proves React UI structure, accessible states, and testing discipline.",
                  whyRecommended:
                    "Recommended because it turns React, Testing Library, and accessibility gaps into a scoped interface recruiters can inspect.",
                  whatItProves:
                    "It proves component architecture, accessible state handling, and testable UI behavior."
                },
                {
                  index: 99,
                  title: "Ignored extra project"
                }
              ]
            };
          }
        }
      }
    );

    assert.equal(output.recommendations.length, 3);
    assert.equal(output.recommendations[0].title, "Frontend Engineer Interview-Ready Admin Dashboard");
    assert.equal(
      output.recommendations[0].description,
      "Build a focused dashboard that proves React UI structure, accessible states, and testing discipline."
    );
    assert.ok(output.recommendations[0].buildSteps.length >= 4);
    assert.equal(output.recommendations[0].type, "portfolio");
    assert.ok(output.generatedFromNote.includes("LLM wording refinement"));
  });
});
