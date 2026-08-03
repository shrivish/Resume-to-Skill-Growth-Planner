import { readFile } from "node:fs/promises";

const apiUrl = process.env.EVAL_API_URL ?? process.env.VITE_API_URL ?? "http://localhost:4000";
const cases = JSON.parse(await readFile(new URL("../eval/sample-cases.json", import.meta.url)));

const postJson = async (path, body) => {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();

  return { ok: response.ok, status: response.status, payload };
};

const postResume = async (resumeText) => {
  const formData = new FormData();
  formData.append("resumeText", resumeText);

  const response = await fetch(`${apiUrl}/resumes/parse`, {
    method: "POST",
    body: formData
  });
  const payload = await response.json();

  return { ok: response.ok, status: response.status, payload };
};

const includesAll = (actual, expected) =>
  expected.every((expectedItem) =>
    actual.some((actualItem) => actualItem.toLowerCase() === expectedItem.toLowerCase())
  );

const runCase = async (testCase) => {
  const resume = await postResume(testCase.resumeText);

  if (!resume.ok) {
    return {
      name: testCase.name,
      passed: false,
      message: `resume parse failed with ${resume.status}`
    };
  }

  const jd = await postJson("/job-descriptions/analyze", {
    targetRole: testCase.targetRole,
    targetStack: testCase.targetStack,
    jobDescriptions: testCase.jobDescriptions
  });

  if (testCase.expect.jdShouldFail) {
    return {
      name: testCase.name,
      passed: !jd.ok,
      message: jd.ok ? "expected JD rejection, but request passed" : `JD rejected with ${jd.status}`
    };
  }

  if (!jd.ok) {
    return {
      name: testCase.name,
      passed: false,
      message: `JD analysis failed with ${jd.status}`
    };
  }

  const gap = await postJson("/gap-analysis/generate", {
    parsedResume: resume.payload.parsedResume,
    targetRole: testCase.targetRole,
    targetStack: jd.payload.targetStack,
    acceptedJobDescriptions: jd.payload.acceptedJobDescriptions
  });

  if (!gap.ok) {
    return {
      name: testCase.name,
      passed: false,
      message: `gap analysis failed with ${gap.status}`
    };
  }

  const roadmap = await postJson("/roadmaps/generate", {
    targetRole: testCase.targetRole,
    timelineWeeks: testCase.timelineWeeks,
    targetStack: jd.payload.targetStack,
    jobDescriptionCount: jd.payload.acceptedJobDescriptions.length,
    gapAnalysisItems: gap.payload.items
  });

  if (!roadmap.ok) {
    return {
      name: testCase.name,
      passed: false,
      message: `roadmap failed with ${roadmap.status}`
    };
  }

  const projects = await postJson("/projects/recommend", {
    targetRole: testCase.targetRole,
    targetStack: jd.payload.targetStack,
    gapAnalysisItems: gap.payload.items
  });

  if (!projects.ok) {
    return {
      name: testCase.name,
      passed: false,
      message: `projects failed with ${projects.status}`
    };
  }

  const gapSkills = gap.payload.items.map((item) => item.skillName);
  const checks = [
    jd.payload.acceptedJobDescriptions.length === testCase.expect.acceptedJdCount,
    includesAll(gapSkills, testCase.expect.gapIncludes),
    roadmap.payload.milestones.length === testCase.expect.roadmapWeeks,
    projects.payload.recommendations.length === testCase.expect.projectCount
  ];

  return {
    name: testCase.name,
    passed: checks.every(Boolean),
    message: `accepted JDs=${jd.payload.acceptedJobDescriptions.length}, gaps=${gapSkills.join(
      ", "
    )}, weeks=${roadmap.payload.milestones.length}, projects=${
      projects.payload.recommendations.length
    }`
  };
};

const results = [];

for (const testCase of cases) {
  results.push(await runCase(testCase));
}

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}: ${result.message}`);
}

const failedCount = results.filter((result) => !result.passed).length;

if (failedCount > 0) {
  process.exitCode = 1;
}
