import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GapAnalysisItem, LearningResourceRequest } from "@rsgp/shared";
import {
  recommendLearningResources,
  scoreLearningResourceCandidates
} from "./learningResourceEngine.js";

const gap = (skillName: string, options: Partial<GapAnalysisItem> = {}): GapAnalysisItem => ({
  skillName,
  category: options.category ?? "frameworks",
  currentLevel: options.currentLevel ?? "Not shown",
  targetLevel: options.targetLevel ?? "Interview-ready",
  gapSeverity: options.gapSeverity ?? "Critical",
  reason: options.reason ?? `${skillName} is required by the target role.`,
  signalStrength: options.signalStrength ?? "Strong signal",
  evidenceSources: options.evidenceSources ?? []
});

describe("learningResourceEngine", () => {
  it("recommends official docs, curated courses, and curated GitHub references when available", async () => {
    const output = await recommendLearningResources({
      targetRole: "Frontend Engineer",
      timelineWeeks: 12,
      targetStack: ["React", "TypeScript", "Testing Library"],
      gapAnalysisItems: [
        gap("React"),
        gap("TypeScript", { category: "languages" }),
        gap("Testing Library", { category: "tools", currentLevel: "Partial exposure" })
      ]
    });

    const reactRecommendation = output.recommendations.find(
      (recommendation) => recommendation.skillName === "React"
    );

    assert.ok(reactRecommendation);
    assert.deepEqual(
      reactRecommendation.resources.map((resource) => resource.sourceFamily),
      ["official-docs", "curated-course", "curated-github-reference"]
    );
    assert.ok(
      reactRecommendation.resources.every((resource) =>
        ["official-docs", "course", "github"].includes(resource.type)
      )
    );
    assert.ok(output.sourcePolicy.includes("No live web search"));
    assert.ok(output.generatedFromNote.includes("deterministic"));
  });

  it("uses roadmap and project context to explain timing and proof work", async () => {
    const output = await recommendLearningResources({
      targetRole: "Backend Engineer",
      timelineWeeks: 8,
      targetStack: ["Node.js", "Express", "PostgreSQL"],
      gapAnalysisItems: [
        gap("Express", { category: "frameworks", currentLevel: "Partial exposure" }),
        gap("PostgreSQL", { category: "databases" })
      ],
      roadmapMilestones: [
        {
          week: 2,
          focus: "Express applied practice",
          linkedSkills: ["Express"],
          tasks: ["Build routes"],
          resources: []
        }
      ],
      projectRecommendations: [
        {
          title: "Backend Engineer Production-Style API Platform",
          type: "portfolio",
          description: "Build an API.",
          whyRecommended: "It covers backend proof.",
          coveredSkills: ["Express", "PostgreSQL"],
          difficulty: "Medium",
          estimatedDurationWeeks: 4,
          whatItProves: "API implementation.",
          buildSteps: ["Scope", "Build", "Test", "Document"],
          resources: []
        }
      ]
    });

    const expressRecommendation = output.recommendations.find(
      (recommendation) => recommendation.skillName === "Express"
    );

    assert.ok(expressRecommendation);
    assert.equal(expressRecommendation.roadmapWeek, 2);
    assert.equal(
      expressRecommendation.projectConnections[0],
      "Backend Engineer Production-Style API Platform"
    );
    assert.ok(expressRecommendation.resources[0].roadmapFit.includes("week 2"));
    assert.ok(
      expressRecommendation.resources.some((resource) =>
        resource.projectFit?.includes("Backend Engineer Production-Style API Platform")
      )
    );
  });

  it("scores official TypeScript docs highly for a foundational TypeScript gap", () => {
    const request: LearningResourceRequest = {
      targetRole: "Full Stack Engineer",
      timelineWeeks: 12,
      targetStack: ["TypeScript", "React", "Node.js"],
      gapAnalysisItems: [gap("TypeScript", { category: "languages" })]
    };
    const topCandidate = scoreLearningResourceCandidates(request, request.gapAnalysisItems[0])[0];

    assert.equal(topCandidate.candidate.id, "docs-typescript-handbook");
    assert.equal(topCandidate.scoreBreakdown.skillMatch, 1);
    assert.equal(topCandidate.scoreBreakdown.trust, 1);
  });

  it("uses LLM refinement only for wording after resources are selected", async () => {
    const output = await recommendLearningResources(
      {
        targetRole: "Backend Engineer",
        timelineWeeks: 12,
        targetStack: ["Node.js"],
        gapAnalysisItems: [gap("Node.js", { category: "frameworks" })]
      },
      {
        llmProvider: {
          async generateJson() {
            return {
              recommendations: [
                {
                  skillIndex: 0,
                  resources: [
                    {
                      resourceIndex: 0,
                      title: "Ignored replacement",
                      url: "https://example.com/ignored",
                      whyRecommended:
                        "Use this official Node.js resource to connect runtime concepts to backend API work.",
                      roadmapFit:
                        "Use it during the first backend foundation week before expanding the API project.",
                      projectFit:
                        "Apply the runtime examples to a small endpoint and document the behavior."
                    },
                    {
                      resourceIndex: 99,
                      whyRecommended: "Ignored extra resource."
                    }
                  ]
                }
              ]
            };
          }
        }
      }
    );

    assert.equal(output.recommendations.length, 1);
    assert.equal(output.recommendations[0].resources[0].id, "docs-nodejs-learn");
    assert.equal(output.recommendations[0].resources[0].title, "Node.js Learn");
    assert.equal(output.recommendations[0].resources[0].url, "https://nodejs.org/en/learn");
    assert.equal(
      output.recommendations[0].resources[0].whyRecommended,
      "Use this official Node.js resource to connect runtime concepts to backend API work."
    );
    assert.ok(output.generatedFromNote.includes("LLM wording refinement only"));
  });
});
