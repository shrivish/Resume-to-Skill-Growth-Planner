import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  MAX_JOB_DESCRIPTIONS,
  SUPPORTED_TIMELINE_WEEKS,
  type ContractWarning,
  type CreatePlannerRunRequest,
  type GapAnalysisOutput,
  type JobDescriptionAnalysisResponse,
  type ProjectRecommendation,
  type ProjectRecommendationOutput,
  type ResumeParseResponse,
  type RoadmapOutput,
  type SavePlannerDraftRequest,
  type SavedPlannerDraft,
  type SavedPlannerRun,
  type TimelineWeeks
} from "@rsgp/shared";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const savedPlansStorageKey = "rsgp.savedPlans";
const draftStorageKey = "rsgp.createDraft";

const timelineLabels: Record<TimelineWeeks, string> = {
  8: "8 weeks",
  12: "12 weeks",
  24: "24 weeks"
};

const starterResumeText = `Sample Candidate
Software Engineer
Skills: TypeScript, React, Node.js, PostgreSQL, Git
Experience: 1.5 years of experience building web applications
Projects: Resume-to-Skill Growth Planner
Education: Computer Science`;

const starterJobDescription = `Role: Frontend Engineer. Required: React, TypeScript, JavaScript, REST. Preferred: Testing Library, Jest. Build UI features and collaborate with designers.`;

type Page = "home" | "create" | "saved";
type BuilderStep = "inputs" | "gap" | "roadmap";
type WorkspaceTab = "overview" | "skill-gap" | "roadmap" | "projects";
type GenerationStage = "idle" | "resume" | "jd" | "gap" | "roadmap" | "projects";
type SavedPlan = SavedPlannerRun;

type GeneratedDraft = {
  resumeResult: ResumeParseResponse;
  jdResult: JobDescriptionAnalysisResponse;
  gapResult: GapAnalysisOutput;
  roadmapResult: RoadmapOutput;
  projectResult: ProjectRecommendationOutput;
};

type CreateDraft = SavePlannerDraftRequest;

const splitStack = (value: string) =>
  Array.from(
    new Set(
      value
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean)
    )
  );

const readSavedPlans = (): SavedPlan[] => {
  try {
    return JSON.parse(localStorage.getItem(savedPlansStorageKey) ?? "[]") as SavedPlan[];
  } catch {
    return [];
  }
};

const readCreateDraft = (): CreateDraft | null => {
  try {
    return JSON.parse(localStorage.getItem(draftStorageKey) ?? "null") as CreateDraft | null;
  } catch {
    return null;
  }
};

const completionPercent = (plan: SavedPlan) => {
  const taskCount = plan.roadmapResult.milestones.reduce(
    (count, milestone) => count + milestone.tasks.length,
    0
  );

  if (taskCount === 0) {
    return 0;
  }

  const completedCount = Object.values(plan.completedTasks).filter(Boolean).length;
  return Math.round((completedCount / taskCount) * 100);
};

const getJson = async <T,>(path: string): Promise<T> => {
  const response = await fetch(`${apiUrl}${path}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }

  return payload as T;
};

const requestJson = async <T,>(path: string, body: unknown, method = "POST"): Promise<T> => {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? payload.warnings?.[0]?.message ?? "Request failed.");
  }

  return payload as T;
};

const deleteRequest = async (path: string) => {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "DELETE"
  });

  if (!response.ok && response.status !== 404) {
    const payload = await response.json();
    throw new Error(payload.error ?? "Request failed.");
  }
};

const downloadTextFile = (fileName: string, content: string) => {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const buildGapSummaryMarkdown = (output: GapAnalysisOutput) => {
  const lines = ["# Skill Gap Summary", "", output.generatedFromNote, "", output.summary, ""];

  output.items.forEach((gap) => {
    lines.push(
      `## ${gap.skillName}`,
      "",
      `- Severity: ${gap.gapSeverity}`,
      `- Signal strength: ${gap.signalStrength}`,
      `- Current state: ${gap.currentLevel}`,
      `- Target state: ${gap.targetLevel}`,
      `- Reason: ${gap.reason}`,
      `- Evidence: ${gap.evidenceSources.map((source) => source.label).join(", ") || "No evidence listed"}`,
      ""
    );
  });

  return lines.join("\n");
};

const buildProjectBriefMarkdown = (project: ProjectRecommendation) =>
  [
    `# ${project.title}`,
    "",
    `Type: ${project.type}`,
    `Difficulty: ${project.difficulty}`,
    `Estimated duration: ${project.estimatedDurationWeeks} weeks`,
    "",
    "## Why It Fits",
    "",
    project.whyRecommended,
    "",
    "## What It Should Prove",
    "",
    `You can apply ${project.coveredSkills.join(", ")} in a practical build.`,
    "",
    "## Covered Skills",
    "",
    ...project.coveredSkills.map((skill) => `- ${skill}`),
    "",
    "## Resources",
    "",
    ...project.resources.map(
      (resource) => `- ${resource.label}${resource.url ? `: ${resource.url}` : ""}`
    )
  ].join("\n");

function App() {
  const savedDraft = readCreateDraft();
  const [page, setPage] = useState<Page>("home");
  const [createStarted, setCreateStarted] = useState(Boolean(savedDraft));
  const [builderStep, setBuilderStep] = useState<BuilderStep>(
    savedDraft?.lastActiveStep ?? "inputs"
  );
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>(readSavedPlans);
  const [activePlanId, setActivePlanId] = useState("");
  const [draftId, setDraftId] = useState(savedDraft?.id ?? "");
  const [targetRole, setTargetRole] = useState(savedDraft?.targetRole ?? "Frontend Engineer");
  const [timelineWeeks, setTimelineWeeks] = useState<TimelineWeeks>(savedDraft?.timelineWeeks ?? 8);
  const [targetStackText, setTargetStackText] = useState(
    savedDraft?.targetStackText ?? "React, TypeScript, Testing Library"
  );
  const [resumeText, setResumeText] = useState(savedDraft?.resumeText ?? starterResumeText);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeFileName, setResumeFileName] = useState(savedDraft?.resumeFileName ?? "");
  const [jobDescriptionTexts, setJobDescriptionTexts] = useState(
    savedDraft?.jobDescriptionTexts ?? [starterJobDescription]
  );
  const [generatedDraft, setGeneratedDraft] = useState<GeneratedDraft | null>(null);
  const [selectedProjectBrief, setSelectedProjectBrief] = useState<ProjectRecommendation | null>(
    null
  );
  const [generationStage, setGenerationStage] = useState<GenerationStage>("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const targetStack = useMemo(() => splitStack(targetStackText), [targetStackText]);
  const activePlan = savedPlans.find((plan) => plan.id === activePlanId) ?? savedPlans[0] ?? null;
  const isRunning = generationStage !== "idle";

  useEffect(() => {
    localStorage.setItem(savedPlansStorageKey, JSON.stringify(savedPlans));
  }, [savedPlans]);

  useEffect(() => {
    const loadSavedPlans = async () => {
      try {
        const plans = await getJson<SavedPlan[]>("/planner-runs");
        setSavedPlans(plans);
        setActivePlanId((current) => current || plans[0]?.id || "");
        setNotice("");
      } catch {
        setNotice("Using browser-saved plans until PostgreSQL is available.");
      }
    };

    void loadSavedPlans();
  }, []);

  useEffect(() => {
    const applyDraft = (draft: SavedPlannerDraft) => {
      setDraftId(draft.id);
      setTargetRole(draft.targetRole || "Frontend Engineer");
      setTimelineWeeks(draft.timelineWeeks);
      setTargetStackText(draft.targetStackText);
      setResumeText(draft.resumeText);
      setResumeFileName(draft.resumeFileName);
      setJobDescriptionTexts(
        draft.jobDescriptionTexts.length > 0 ? draft.jobDescriptionTexts : [""]
      );
      setBuilderStep(draft.lastActiveStep);
      setCreateStarted(true);
    };

    const loadDraft = async () => {
      try {
        const draft = await getJson<SavedPlannerDraft | null>("/planner-runs/draft");

        if (draft) {
          applyDraft(draft);
          localStorage.setItem(draftStorageKey, JSON.stringify(draft));
        }
      } catch {
        const localDraft = readCreateDraft();

        if (localDraft) {
          setNotice("Using browser-saved draft until PostgreSQL is available.");
        }
      }
    };

    void loadDraft();
  }, []);

  const navigate = (nextPage: Page) => {
    setPage(nextPage);
    setError("");
  };

  const startCreateFlow = () => {
    setCreateStarted(true);
    setBuilderStep("inputs");
    setGeneratedDraft(null);
    setPage("create");
  };

  const updateJobDescription = (index: number, value: string) => {
    setJobDescriptionTexts((current) =>
      current.map((description, currentIndex) => (currentIndex === index ? value : description))
    );
  };

  const addJobDescription = () => {
    setJobDescriptionTexts((current) =>
      current.length < MAX_JOB_DESCRIPTIONS ? [...current, ""] : current
    );
  };

  const removeJobDescription = (index: number) => {
    setJobDescriptionTexts((current) =>
      current.length === 1 ? [""] : current.filter((_, currentIndex) => currentIndex !== index)
    );
  };

  const setResumeUpload = (file: File | null) => {
    setResumeFile(file);
    setResumeFileName(file?.name ?? "");
  };

  const importJobDescriptionFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    const text = await file.text();
    setJobDescriptionTexts((current) => {
      const next = current.filter((description) => description.trim().length > 0);
      return [...next, text].slice(0, MAX_JOB_DESCRIPTIONS);
    });
  };

  const buildDraftRequest = (lastActiveStep: BuilderStep): SavePlannerDraftRequest => ({
    id: draftId || undefined,
    targetRole,
    timelineWeeks,
    targetStackText,
    resumeText,
    resumeFileName,
    jobDescriptionTexts,
    lastActiveStep
  });

  const persistDraft = async (lastActiveStep: BuilderStep, successMessage?: string) => {
    const draft = buildDraftRequest(lastActiveStep);

    localStorage.setItem(draftStorageKey, JSON.stringify(draft));

    try {
      const savedDraftResponse = await requestJson<SavedPlannerDraft>("/planner-runs/draft", draft);

      setDraftId(savedDraftResponse.id);
      localStorage.setItem(draftStorageKey, JSON.stringify(savedDraftResponse));
      setNotice(successMessage ?? "Draft saved.");
    } catch {
      setNotice("Draft saved in this browser because PostgreSQL is unavailable.");
    }
  };

  const saveDraft = async () => {
    const draft: CreateDraft = {
      ...buildDraftRequest(builderStep)
    };

    localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    await persistDraft(builderStep, "Draft saved to backend.");
  };

  const validateInputs = () => {
    if (targetRole.trim().length < 2) {
      return "Add a target role before continuing.";
    }

    if (!SUPPORTED_TIMELINE_WEEKS.includes(timelineWeeks)) {
      return "Choose a supported timeline.";
    }

    if (!resumeFile && resumeText.trim().length === 0) {
      return "Paste resume text or upload a resume file.";
    }

    const providedJds = jobDescriptionTexts.filter((description) => description.trim().length > 0);

    if (providedJds.length > MAX_JOB_DESCRIPTIONS) {
      return `Use no more than ${MAX_JOB_DESCRIPTIONS} job descriptions.`;
    }

    if (providedJds.length === 0 && targetStack.length === 0) {
      return "Add a preferred stack or focus when no job description is provided.";
    }

    return "";
  };

  const runAnalysis = async () => {
    setError("");
    setNotice("");
    const validationError = validateInputs();

    if (validationError) {
      setError(validationError);
      return;
    }

    const providedJobDescriptions = jobDescriptionTexts
      .map((rawText, index) => ({
        id: `jd-${index + 1}`,
        sourceLabel: `JD ${index + 1}`,
        rawText: rawText.trim()
      }))
      .filter((description) => description.rawText.length > 0);

    try {
      setGenerationStage("resume");
      const formData = new FormData();

      if (resumeFile) {
        formData.append("resume", resumeFile);
      } else {
        formData.append("resumeText", resumeText);
      }

      const resumeResponse = await fetch(`${apiUrl}/resumes/parse`, {
        method: "POST",
        body: formData
      });
      const parsedResumePayload = await resumeResponse.json();

      if (!resumeResponse.ok) {
        throw new Error(
          parsedResumePayload.error ??
            parsedResumePayload.warnings?.[0]?.message ??
            "Resume parsing failed."
        );
      }

      const resumeResult = parsedResumePayload as ResumeParseResponse;

      setGenerationStage("jd");
      const jdResult = await requestJson<JobDescriptionAnalysisResponse>(
        "/job-descriptions/analyze",
        {
          targetRole,
          targetStack,
          jobDescriptions: providedJobDescriptions
        }
      );

      if (jdResult.needsTargetStack) {
        throw new Error(
          jdResult.warnings.find((warning) => warning.severity === "error")?.message ??
            "Add target stack before continuing."
        );
      }

      setGenerationStage("gap");
      const gapResult = await requestJson<GapAnalysisOutput>("/gap-analysis/generate", {
        parsedResume: resumeResult.parsedResume,
        targetRole,
        targetStack: jdResult.targetStack,
        acceptedJobDescriptions: jdResult.acceptedJobDescriptions
      });

      setGenerationStage("roadmap");
      const roadmapResult = await requestJson<RoadmapOutput>("/roadmaps/generate", {
        targetRole,
        timelineWeeks,
        targetStack: jdResult.targetStack,
        jobDescriptionCount: jdResult.acceptedJobDescriptions.length,
        gapAnalysisItems: gapResult.items
      });

      setGenerationStage("projects");
      const projectResult = await requestJson<ProjectRecommendationOutput>("/projects/recommend", {
        targetRole,
        targetStack: jdResult.targetStack,
        gapAnalysisItems: gapResult.items
      });

      setGeneratedDraft({
        resumeResult,
        jdResult,
        gapResult,
        roadmapResult,
        projectResult
      });
      setBuilderStep("gap");
      await persistDraft("gap", "Analysis complete. Draft saved to backend.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Something went wrong.");
    } finally {
      setGenerationStage("idle");
    }
  };

  const saveGeneratedPlan = async () => {
    if (!generatedDraft) {
      setError("Run analysis before saving the roadmap.");
      return;
    }

    const plan: CreatePlannerRunRequest = {
      title: `${targetRole} growth plan`,
      targetRole,
      timelineWeeks,
      targetStack: generatedDraft.jdResult.targetStack,
      status: "Ready",
      completedTasks: {},
      ...generatedDraft
    };

    try {
      const savedPlan = await requestJson<SavedPlan>("/planner-runs", plan);
      setSavedPlans((current) => [
        savedPlan,
        ...current.filter((item) => item.id !== savedPlan.id)
      ]);
      setActivePlanId(savedPlan.id);
      setNotice("");
    } catch {
      const fallbackPlan: SavedPlan = {
        ...plan,
        id: `local-${Date.now()}`,
        createdAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString()
      };

      setSavedPlans((current) => [
        fallbackPlan,
        ...current.filter((item) => item.id !== fallbackPlan.id)
      ]);
      setActivePlanId(fallbackPlan.id);
      setNotice("Saved in this browser because PostgreSQL is unavailable.");
    }

    if (draftId) {
      try {
        await deleteRequest(`/planner-runs/draft/${draftId}`);
      } catch {
        setNotice("Final plan saved. Draft cleanup failed on the backend.");
      }
    }

    localStorage.removeItem(draftStorageKey);
    setDraftId("");
    setActiveTab("overview");
    setPage("saved");
  };

  const openPlan = async (planId: string) => {
    if (!planId.startsWith("local-")) {
      try {
        const savedPlan = await getJson<SavedPlan>(`/planner-runs/${planId}`);
        setSavedPlans((current) =>
          current.map((item) => (item.id === savedPlan.id ? savedPlan : item))
        );
        setNotice("");
      } catch {
        setNotice("Showing browser copy because the saved plan could not be loaded.");
      }
    }

    setActivePlanId(planId);
    setPage("saved");
  };

  const toggleTask = async (plan: SavedPlan, taskKey: string) => {
    const updatedPlan: SavedPlan = {
      ...plan,
      status: "In Progress",
      lastUpdatedAt: new Date().toISOString(),
      completedTasks: {
        ...plan.completedTasks,
        [taskKey]: !plan.completedTasks[taskKey]
      }
    };

    setSavedPlans((current) =>
      current.map((item) => (item.id === updatedPlan.id ? updatedPlan : item))
    );

    if (plan.id.startsWith("local-")) {
      return;
    }

    try {
      const persistedPlan = await requestJson<SavedPlan>(
        `/planner-runs/${plan.id}/completed-tasks`,
        {
          completedTasks: updatedPlan.completedTasks,
          status: updatedPlan.status
        },
        "PATCH"
      );

      setSavedPlans((current) =>
        current.map((item) => (item.id === persistedPlan.id ? persistedPlan : item))
      );
      setNotice("");
    } catch {
      setNotice("Progress changed locally. PostgreSQL update failed.");
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f3ea] text-ink">
      <TopNav page={page} setPage={navigate} />

      {page === "home" ? (
        <HomePage
          savedPlanCount={savedPlans.length}
          startCreateFlow={startCreateFlow}
          viewSavedPlans={() => navigate("saved")}
        />
      ) : null}

      {page === "create" ? (
        <CreatePage
          addJobDescription={addJobDescription}
          builderStep={builderStep}
          createStarted={createStarted}
          error={error}
          generatedDraft={generatedDraft}
          generationStage={generationStage}
          importJobDescriptionFile={importJobDescriptionFile}
          isRunning={isRunning}
          jobDescriptionTexts={jobDescriptionTexts}
          notice={notice}
          openPlan={openPlan}
          removeJobDescription={removeJobDescription}
          resumeFileName={resumeFileName}
          resumeText={resumeText}
          runAnalysis={runAnalysis}
          saveDraft={saveDraft}
          saveGeneratedPlan={saveGeneratedPlan}
          savedPlans={savedPlans}
          setBuilderStep={setBuilderStep}
          setCreateStarted={setCreateStarted}
          setResumeFile={setResumeUpload}
          setResumeText={setResumeText}
          setTargetRole={setTargetRole}
          setTargetStackText={setTargetStackText}
          setTimelineWeeks={setTimelineWeeks}
          startCreateFlow={startCreateFlow}
          targetRole={targetRole}
          targetStackText={targetStackText}
          timelineWeeks={timelineWeeks}
          updateJobDescription={updateJobDescription}
        />
      ) : null}

      {page === "saved" ? (
        <SavedPlansPage
          activePlan={activePlan}
          activeTab={activeTab}
          notice={notice}
          openPlan={openPlan}
          openProjectBrief={setSelectedProjectBrief}
          savedPlans={savedPlans}
          setActiveTab={setActiveTab}
          startCreateFlow={startCreateFlow}
          toggleTask={toggleTask}
        />
      ) : null}

      {selectedProjectBrief ? (
        <ProjectBriefDialog
          onClose={() => setSelectedProjectBrief(null)}
          project={selectedProjectBrief}
        />
      ) : null}
    </main>
  );
}

const TopNav = ({ page, setPage }: { page: Page; setPage: (page: Page) => void }) => (
  <header className="sticky top-0 z-10 border-b border-ink/10 bg-[#f7f3ea]/95 backdrop-blur">
    <nav className="mx-auto flex h-16 max-w-7xl items-center justify-center gap-2 px-5">
      <TopNavButton active={page === "home"} onClick={() => setPage("home")}>
        Home
      </TopNavButton>
      <TopNavButton active={page === "create"} prominent onClick={() => setPage("create")}>
        Create New
      </TopNavButton>
      <TopNavButton active={page === "saved"} onClick={() => setPage("saved")}>
        Saved Plans
      </TopNavButton>
    </nav>
  </header>
);

const HomePage = ({
  savedPlanCount,
  startCreateFlow,
  viewSavedPlans
}: {
  savedPlanCount: number;
  startCreateFlow: () => void;
  viewSavedPlans: () => void;
}) => (
  <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-10 px-5 py-10 lg:grid-cols-[1.05fr_0.95fr]">
    <div className="max-w-2xl">
      <p className="text-sm font-semibold uppercase text-moss">For early-career builders</p>
      <h1 className="mt-4 text-4xl font-semibold leading-tight text-ink sm:text-5xl">
        Turn a resume into a practical skill growth plan.
      </h1>
      <p className="mt-5 max-w-xl text-base leading-7 text-ink/68">
        Upload or paste your resume, choose a target role, add job descriptions when you have them,
        and get a reusable plan with skill gaps, weekly tasks, and proof-building projects.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <PrimaryButton onClick={startCreateFlow}>Generate growth plan</PrimaryButton>
        <SecondaryButton onClick={viewSavedPlans}>See saved plans</SecondaryButton>
      </div>
    </div>

    <div className="grid gap-4">
      <FeatureTile
        accent="bg-moss/10 text-moss"
        label="Inputs"
        text="Resume, target role, timeline, preferred stack, and up to five JDs."
      />
      <FeatureTile
        accent="bg-sky/60 text-ink"
        label="Skill Gap"
        text="Qualitative gap cards with severity, signal strength, reasons, and evidence."
      />
      <FeatureTile
        accent="bg-[#f5ddc6] text-clay"
        label="Plan"
        text={`${savedPlanCount} saved plan(s) ready for roadmap progress and project review.`}
      />
    </div>
  </section>
);

type CreatePageProps = {
  addJobDescription: () => void;
  builderStep: BuilderStep;
  createStarted: boolean;
  error: string;
  generatedDraft: GeneratedDraft | null;
  generationStage: GenerationStage;
  importJobDescriptionFile: (file: File | null) => void;
  isRunning: boolean;
  jobDescriptionTexts: string[];
  notice: string;
  openPlan: (planId: string) => void;
  removeJobDescription: (index: number) => void;
  resumeFileName: string;
  resumeText: string;
  runAnalysis: () => void;
  saveDraft: () => void;
  saveGeneratedPlan: () => void;
  savedPlans: SavedPlan[];
  setBuilderStep: (step: BuilderStep) => void;
  setCreateStarted: (started: boolean) => void;
  setResumeFile: (file: File | null) => void;
  setResumeText: (value: string) => void;
  setTargetRole: (value: string) => void;
  setTargetStackText: (value: string) => void;
  setTimelineWeeks: (value: TimelineWeeks) => void;
  startCreateFlow: () => void;
  targetRole: string;
  targetStackText: string;
  timelineWeeks: TimelineWeeks;
  updateJobDescription: (index: number, value: string) => void;
};

const CreatePage = (props: CreatePageProps) => (
  <ShellWithRail
    rail={
      <CreateRail
        openPlan={props.openPlan}
        savedPlans={props.savedPlans}
        startCreateFlow={props.startCreateFlow}
      />
    }
  >
    {!props.createStarted ? (
      <CreateIntro onStart={props.startCreateFlow} />
    ) : (
      <section className="grid gap-5">
        <BuilderSteps activeStep={props.builderStep} setActiveStep={props.setBuilderStep} />

        {props.builderStep === "inputs" ? (
          <InputsStep
            addJobDescription={props.addJobDescription}
            error={props.error}
            generationStage={props.generationStage}
            importJobDescriptionFile={props.importJobDescriptionFile}
            isRunning={props.isRunning}
            jobDescriptionTexts={props.jobDescriptionTexts}
            notice={props.notice}
            removeJobDescription={props.removeJobDescription}
            resumeFileName={props.resumeFileName}
            resumeText={props.resumeText}
            runAnalysis={props.runAnalysis}
            saveDraft={props.saveDraft}
            setCreateStarted={props.setCreateStarted}
            setResumeFile={props.setResumeFile}
            setResumeText={props.setResumeText}
            setTargetRole={props.setTargetRole}
            setTargetStackText={props.setTargetStackText}
            setTimelineWeeks={props.setTimelineWeeks}
            targetRole={props.targetRole}
            targetStackText={props.targetStackText}
            timelineWeeks={props.timelineWeeks}
            updateJobDescription={props.updateJobDescription}
          />
        ) : null}

        {props.builderStep === "gap" ? (
          <BuilderGapStep
            draft={props.generatedDraft}
            onBack={() => props.setBuilderStep("inputs")}
            onContinue={() => props.setBuilderStep("roadmap")}
          />
        ) : null}

        {props.builderStep === "roadmap" ? (
          <BuilderRoadmapStep
            draft={props.generatedDraft}
            onBack={() => props.setBuilderStep("gap")}
            onSave={props.saveGeneratedPlan}
          />
        ) : null}
      </section>
    )}
  </ShellWithRail>
);

const SavedPlansPage = ({
  activePlan,
  activeTab,
  notice,
  openPlan,
  openProjectBrief,
  savedPlans,
  setActiveTab,
  startCreateFlow,
  toggleTask
}: {
  activePlan: SavedPlan | null;
  activeTab: WorkspaceTab;
  notice: string;
  openPlan: (planId: string) => void;
  openProjectBrief: (project: ProjectRecommendation) => void;
  savedPlans: SavedPlan[];
  setActiveTab: (tab: WorkspaceTab) => void;
  startCreateFlow: () => void;
  toggleTask: (plan: SavedPlan, taskKey: string) => void;
}) => (
  <ShellWithRail
    rail={
      <SavedRail
        activePlanId={activePlan?.id ?? ""}
        openPlan={openPlan}
        savedPlans={savedPlans}
        startCreateFlow={startCreateFlow}
      />
    }
  >
    {notice ? <Notice>{notice}</Notice> : null}
    {activePlan ? (
      <PlanWorkspace
        activeTab={activeTab}
        openProjectBrief={openProjectBrief}
        plan={activePlan}
        setActiveTab={setActiveTab}
        toggleTask={toggleTask}
      />
    ) : (
      <CreateIntro onStart={startCreateFlow} />
    )}
  </ShellWithRail>
);

const InputsStep = ({
  addJobDescription,
  error,
  generationStage,
  importJobDescriptionFile,
  isRunning,
  jobDescriptionTexts,
  notice,
  removeJobDescription,
  resumeFileName,
  resumeText,
  runAnalysis,
  saveDraft,
  setCreateStarted,
  setResumeFile,
  setResumeText,
  setTargetRole,
  setTargetStackText,
  setTimelineWeeks,
  targetRole,
  targetStackText,
  timelineWeeks,
  updateJobDescription
}: Omit<
  CreatePageProps,
  | "builderStep"
  | "createStarted"
  | "generatedDraft"
  | "openPlan"
  | "savedPlans"
  | "setBuilderStep"
  | "startCreateFlow"
  | "saveGeneratedPlan"
>) => (
  <section className="rounded-lg border border-ink/10 bg-[#fffdf8] p-5 shadow-sm">
    <div className="grid gap-7">
      <section className="rounded-lg border border-moss/15 bg-moss/5 p-4">
        <h2 className="text-lg font-semibold">Role setup</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_180px]">
          <Label text="Target role">
            <input
              className="field"
              onChange={(event) => setTargetRole(event.target.value)}
              value={targetRole}
            />
          </Label>
          <Label text="Timeline">
            <select
              className="field"
              onChange={(event) => setTimelineWeeks(Number(event.target.value) as TimelineWeeks)}
              value={timelineWeeks}
            >
              {SUPPORTED_TIMELINE_WEEKS.map((weeks) => (
                <option key={weeks} value={weeks}>
                  {timelineLabels[weeks]}
                </option>
              ))}
            </select>
          </Label>
        </div>
        <div className="mt-4">
          <Label text="Preferred stack or focus">
            <input
              className="field"
              onChange={(event) => setTargetStackText(event.target.value)}
              placeholder="React, TypeScript, Node.js"
              value={targetStackText}
            />
          </Label>
        </div>
      </section>

      <section>
        <SectionHeader kicker="Resume input" title="Paste resume text or upload a resume file." />
        <textarea
          className="field mt-3 min-h-44 resize-y leading-6"
          onChange={(event) => setResumeText(event.target.value)}
          value={resumeText}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <FileButton label="Upload resume">
            <input
              accept=".pdf,.docx,.txt"
              className="sr-only"
              onChange={(event) => setResumeFile(event.target.files?.[0] ?? null)}
              type="file"
            />
          </FileButton>
          {resumeFileName ? <SmallMeta>{resumeFileName}</SmallMeta> : null}
        </div>
      </section>

      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <SectionHeader
            kicker="Job descriptions"
            title="Add matching role signals when you have them."
          />
          <div className="flex flex-wrap gap-2">
            <FileButton label="Upload JD">
              <input
                accept=".txt,.md"
                className="sr-only"
                onChange={(event) => void importJobDescriptionFile(event.target.files?.[0] ?? null)}
                type="file"
              />
            </FileButton>
            <SecondaryButton
              disabled={jobDescriptionTexts.length >= MAX_JOB_DESCRIPTIONS}
              onClick={addJobDescription}
            >
              Add JD
            </SecondaryButton>
          </div>
        </div>

        <div className="mt-3 grid gap-3">
          {jobDescriptionTexts.map((description, index) => (
            <div className="grid gap-2" key={index}>
              <div className="flex items-center justify-between gap-3">
                <SmallMeta>JD {index + 1}</SmallMeta>
                <button
                  className="text-sm font-semibold text-clay"
                  onClick={() => removeJobDescription(index)}
                  type="button"
                >
                  Remove
                </button>
              </div>
              <textarea
                className="field min-h-32 resize-y leading-6"
                onChange={(event) => updateJobDescription(index, event.target.value)}
                value={description}
              />
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-3 border-t border-ink/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <button
          className="text-sm font-semibold text-ink/65 transition hover:text-ink"
          onClick={() => setCreateStarted(false)}
          type="button"
        >
          Back
        </button>
        <div className="flex flex-wrap gap-3">
          <SecondaryButton onClick={saveDraft}>Save draft</SecondaryButton>
          <PrimaryButton disabled={isRunning} onClick={runAnalysis}>
            {isRunning ? `Running ${generationStage}...` : "Continue to analysis"}
          </PrimaryButton>
        </div>
      </div>

      {error ? <ErrorNotice>{error}</ErrorNotice> : null}
      {notice ? <Notice>{notice}</Notice> : null}
    </div>
  </section>
);

const BuilderGapStep = ({
  draft,
  onBack,
  onContinue
}: {
  draft: GeneratedDraft | null;
  onBack: () => void;
  onContinue: () => void;
}) => (
  <section className="grid gap-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <SectionHeader kicker="Skill gap review" title="Review missing target signals." />
      <div className="flex flex-wrap gap-3">
        <SecondaryButton onClick={onBack}>Back to inputs</SecondaryButton>
        <SecondaryButton
          disabled={!draft}
          onClick={() =>
            draft
              ? downloadTextFile("skill-gap-summary.md", buildGapSummaryMarkdown(draft.gapResult))
              : undefined
          }
        >
          Export gap summary
        </SecondaryButton>
        <PrimaryButton disabled={!draft} onClick={onContinue}>
          Continue to roadmap
        </PrimaryButton>
      </div>
    </div>
    {draft ? <GapCards output={draft.gapResult} /> : <EmptyState text="Run analysis first." />}
  </section>
);

const BuilderRoadmapStep = ({
  draft,
  onBack,
  onSave
}: {
  draft: GeneratedDraft | null;
  onBack: () => void;
  onSave: () => void;
}) => (
  <section className="grid gap-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <SectionHeader kicker="Roadmap output" title="Weekly milestones for the selected timeline." />
      <div className="flex flex-wrap gap-3">
        <SecondaryButton onClick={onBack}>Back to review</SecondaryButton>
        <SecondaryButton disabled={!draft} onClick={onSave}>
          Save roadmap
        </SecondaryButton>
        <PrimaryButton disabled={!draft} onClick={onSave}>
          Generate final plan
        </PrimaryButton>
      </div>
    </div>
    {draft ? (
      <RoadmapBlocks roadmap={draft.roadmapResult} completedTasks={{}} />
    ) : (
      <EmptyState text="Generate the roadmap from the review step first." />
    )}
  </section>
);

const PlanWorkspace = ({
  activeTab,
  openProjectBrief,
  plan,
  setActiveTab,
  toggleTask
}: {
  activeTab: WorkspaceTab;
  openProjectBrief: (project: ProjectRecommendation) => void;
  plan: SavedPlan;
  setActiveTab: (tab: WorkspaceTab) => void;
  toggleTask: (plan: SavedPlan, taskKey: string) => void;
}) => {
  const warnings = [...plan.resumeResult.warnings, ...plan.jdResult.warnings];

  return (
    <section className="grid gap-5">
      <PlanHeader plan={plan} />
      {warnings.length > 0 ? <WarningList warnings={warnings} /> : null}
      <SegmentedTabs activeTab={activeTab} setActiveTab={setActiveTab} />

      {activeTab === "overview" ? <OverviewTab plan={plan} /> : null}
      {activeTab === "skill-gap" ? <SkillGapTab plan={plan} /> : null}
      {activeTab === "roadmap" ? <RoadmapTab plan={plan} toggleTask={toggleTask} /> : null}
      {activeTab === "projects" ? (
        <ProjectsTab openProjectBrief={openProjectBrief} plan={plan} />
      ) : null}
    </section>
  );
};

const PlanHeader = ({ plan }: { plan: SavedPlan }) => (
  <header className="rounded-lg border border-ink/10 bg-[#fffdf8] p-5 shadow-sm">
    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
      <div className="max-w-2xl">
        <StatusBadge>{plan.status === "Ready" ? "In progress" : plan.status}</StatusBadge>
        <h1 className="mt-3 text-3xl font-semibold">{plan.title}</h1>
        <p className="mt-2 text-sm leading-6 text-ink/65">{plan.roadmapResult.generatedFromNote}</p>
      </div>
      <div className="grid gap-2 text-sm text-ink/70 sm:grid-cols-2 xl:w-[430px]">
        <Metric label="Target role" value={plan.targetRole} />
        <Metric label="Timeline" value={timelineLabels[plan.timelineWeeks]} />
        <Metric label="Gaps found" value={`${plan.gapResult.items.length}`} />
        <Metric label="Progress" value={`${completionPercent(plan)}%`} />
      </div>
    </div>
  </header>
);

const OverviewTab = ({ plan }: { plan: SavedPlan }) => {
  const topGaps = plan.gapResult.items.slice(0, 3).map((gap) => gap.skillName);
  const nextMilestone = plan.roadmapResult.milestones.find((milestone) =>
    milestone.tasks.some((_, index) => !plan.completedTasks[`week-${milestone.week}-task-${index}`])
  );

  return (
    <section className="grid gap-5 lg:grid-cols-2">
      <ResultPanel title="What matters now">
        <div className="grid gap-4 text-sm leading-6 text-ink/72">
          <p>{plan.gapResult.summary}</p>
          <PillList values={topGaps} />
        </div>
      </ResultPanel>
      <ResultPanel title="Continue">
        <div className="grid gap-4 text-sm leading-6 text-ink/72">
          <p>
            {nextMilestone
              ? `Next focus: Week ${nextMilestone.week}, ${nextMilestone.focus}.`
              : "Roadmap tasks are complete."}
          </p>
          <p>
            {plan.projectResult.recommendations[0]?.title ?? "Project recommendations are ready."}
          </p>
          <StatusBadge>{completionPercent(plan)}% complete</StatusBadge>
        </div>
      </ResultPanel>
    </section>
  );
};

const SkillGapTab = ({ plan }: { plan: SavedPlan }) => (
  <section className="grid gap-5 xl:grid-cols-[1fr_280px]">
    <GapCards output={plan.gapResult} />
    <aside className="h-fit rounded-lg border border-ink/10 bg-[#fffdf8] p-4 text-sm leading-6 text-ink/65 shadow-sm">
      <p className="font-semibold text-ink">Summary</p>
      <p className="mt-2">{plan.gapResult.generatedFromNote}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <StatusBadge>{plan.jdResult.acceptedJobDescriptions.length} JD(s)</StatusBadge>
        <SignalBadge>{plan.roadmapResult.signalStrength}</SignalBadge>
      </div>
    </aside>
  </section>
);

const RoadmapTab = ({
  plan,
  toggleTask
}: {
  plan: SavedPlan;
  toggleTask: (plan: SavedPlan, taskKey: string) => void;
}) => (
  <section className="grid gap-5">
    <div className="flex flex-wrap gap-2">
      <StatusBadge>{timelineLabels[plan.roadmapResult.timelineWeeks]}</StatusBadge>
      <SignalBadge>{plan.roadmapResult.signalStrength}</SignalBadge>
      <StatusBadge>{completionPercent(plan)}% complete</StatusBadge>
    </div>
    <RoadmapBlocks
      completedTasks={plan.completedTasks}
      roadmap={plan.roadmapResult}
      toggleTask={(taskKey) => toggleTask(plan, taskKey)}
    />
  </section>
);

const ProjectsTab = ({
  openProjectBrief,
  plan
}: {
  openProjectBrief: (project: ProjectRecommendation) => void;
  plan: SavedPlan;
}) => (
  <section className="grid gap-4">
    {plan.projectResult.recommendations.map((project) => (
      <article
        className="rounded-lg border border-ink/10 bg-[#fffdf8] p-5 shadow-sm"
        key={project.title}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">{project.title}</h3>
          <StatusBadge>{project.type}</StatusBadge>
          <StatusBadge>{project.difficulty}</StatusBadge>
        </div>
        <p className="mt-3 text-sm leading-6 text-ink/70">{project.whyRecommended}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <InfoBlock label="Why it fits" value={project.coveredSkills.join(", ")} />
          <InfoBlock
            label="What it should prove"
            value={`You can apply ${project.coveredSkills.slice(0, 3).join(", ")} in a ${project.estimatedDurationWeeks}-week build.`}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {project.resources.map((resource) => (
            <StatusBadge key={`${project.title}-${resource.label}`}>{resource.label}</StatusBadge>
          ))}
          <SecondaryButton onClick={() => openProjectBrief(project)}>
            Open project brief
          </SecondaryButton>
        </div>
      </article>
    ))}
  </section>
);

const GapCards = ({ output }: { output: GapAnalysisOutput }) => (
  <section className="grid gap-4">
    {output.items.length > 0 ? (
      output.items.map((gap) => (
        <article
          className="rounded-lg border border-ink/10 bg-[#fffdf8] p-5 shadow-sm"
          key={gap.skillName}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">{gap.skillName}</h3>
            <SeverityBadge>{gap.gapSeverity}</SeverityBadge>
            <SignalBadge>{gap.signalStrength}</SignalBadge>
          </div>
          <div className="mt-4 grid gap-3 text-sm text-ink/70 md:grid-cols-2">
            <InfoBlock label="Current state" value={gap.currentLevel} />
            <InfoBlock label="Target state" value={gap.targetLevel} />
          </div>
          <p className="mt-4 text-sm leading-6 text-ink/70">{gap.reason}</p>
          <div className="mt-4">
            <PillList values={gap.evidenceSources.map((source) => source.label)} />
          </div>
        </article>
      ))
    ) : (
      <EmptyState text="No missing target skills were detected." />
    )}
  </section>
);

const RoadmapBlocks = ({
  completedTasks,
  roadmap,
  toggleTask
}: {
  completedTasks: Record<string, boolean>;
  roadmap: RoadmapOutput;
  toggleTask?: (taskKey: string) => void;
}) => (
  <section className="grid gap-4">
    {roadmap.milestones.map((milestone) => (
      <article
        className="rounded-lg border border-ink/10 bg-[#fffdf8] p-5 shadow-sm"
        key={milestone.week}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-moss">Week {milestone.week}</p>
            <h3 className="mt-1 text-lg font-semibold">{milestone.focus}</h3>
          </div>
          <PillList values={milestone.linkedSkills} />
        </div>
        <div className="mt-4 grid gap-2">
          {milestone.tasks.map((task, index) => {
            const taskKey = `week-${milestone.week}-task-${index}`;
            return (
              <label
                className="flex items-start gap-3 rounded-md border border-ink/10 bg-white p-3 text-sm leading-6"
                key={taskKey}
              >
                <input
                  checked={Boolean(completedTasks[taskKey])}
                  className="mt-1 h-4 w-4 accent-moss"
                  disabled={!toggleTask}
                  onChange={() => toggleTask?.(taskKey)}
                  type="checkbox"
                />
                <span className={completedTasks[taskKey] ? "text-ink/45 line-through" : ""}>
                  {task}
                </span>
              </label>
            );
          })}
        </div>
      </article>
    ))}
  </section>
);

const ProjectBriefDialog = ({
  onClose,
  project
}: {
  onClose: () => void;
  project: ProjectRecommendation;
}) => (
  <div
    aria-modal="true"
    className="fixed inset-0 z-20 flex items-center justify-center bg-ink/30 p-5"
    role="dialog"
  >
    <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-ink/10 bg-[#fffdf8] p-5 shadow-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-moss">Project brief</p>
          <h2 className="mt-1 text-2xl font-semibold">{project.title}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge>{project.type}</StatusBadge>
            <StatusBadge>{project.difficulty}</StatusBadge>
            <StatusBadge>{project.estimatedDurationWeeks} weeks</StatusBadge>
          </div>
        </div>
        <button
          className="rounded-md px-3 py-2 text-sm font-semibold text-ink/60 transition hover:bg-moss/10 hover:text-ink"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </div>

      <div className="mt-5 grid gap-4">
        <InfoBlock label="Why it fits" value={project.whyRecommended} />
        <InfoBlock
          label="What it should prove"
          value={`You can apply ${project.coveredSkills.join(", ")} in a practical build that supports your target role story.`}
        />
        <div>
          <SmallMeta>Covered skills</SmallMeta>
          <div className="mt-2">
            <PillList values={project.coveredSkills} />
          </div>
        </div>
        <div>
          <SmallMeta>Resources</SmallMeta>
          <div className="mt-2 grid gap-2">
            {project.resources.map((resource) => (
              <div
                className="rounded-md border border-ink/10 bg-white p-3 text-sm leading-6 text-ink/70"
                key={`${project.title}-${resource.label}`}
              >
                <p className="font-semibold text-ink">{resource.label}</p>
                <p>{resource.relatedSkills.join(", ")}</p>
                {resource.url ? (
                  <a
                    className="font-semibold text-moss"
                    href={resource.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open resource
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-ink/10 pt-4">
        <SecondaryButton
          onClick={() =>
            downloadTextFile(
              `${project.title.toLowerCase().replaceAll(" ", "-")}-brief.md`,
              buildProjectBriefMarkdown(project)
            )
          }
        >
          Download brief
        </SecondaryButton>
        <PrimaryButton onClick={onClose}>Done</PrimaryButton>
      </div>
    </section>
  </div>
);

const ShellWithRail = ({ children, rail }: { children: ReactNode; rail: ReactNode }) => (
  <div className="mx-auto grid max-w-7xl gap-5 px-5 py-6 lg:grid-cols-[260px_1fr]">
    <aside className="h-fit rounded-lg border border-ink/10 bg-[#fffaf1] p-4 shadow-sm">
      {rail}
    </aside>
    <div>{children}</div>
  </div>
);

const CreateRail = ({
  openPlan,
  savedPlans,
  startCreateFlow
}: {
  openPlan: (planId: string) => void;
  savedPlans: SavedPlan[];
  startCreateFlow: () => void;
}) => (
  <div className="grid gap-5">
    <div>
      <p className="text-xs font-semibold uppercase text-moss">Create New</p>
      <h2 className="mt-1 text-lg font-semibold">Plan builder</h2>
    </div>
    <button
      className="rounded-lg border border-moss/20 bg-moss/10 p-4 text-left transition hover:border-moss/40"
      onClick={startCreateFlow}
      type="button"
    >
      <p className="text-2xl leading-none text-moss">+</p>
      <p className="mt-2 text-sm font-semibold">New plan</p>
    </button>
    <RailPlanList openPlan={openPlan} plans={savedPlans.slice(0, 3)} title="Recent plans" />
  </div>
);

const SavedRail = ({
  activePlanId,
  openPlan,
  savedPlans,
  startCreateFlow
}: {
  activePlanId: string;
  openPlan: (planId: string) => void;
  savedPlans: SavedPlan[];
  startCreateFlow: () => void;
}) => (
  <div className="grid gap-5">
    <div>
      <p className="text-xs font-semibold uppercase text-moss">Saved Plans</p>
      <h2 className="mt-1 text-lg font-semibold">Workspace</h2>
    </div>
    <button
      className="rounded-lg border border-moss/20 bg-moss/10 p-4 text-left transition hover:border-moss/40"
      onClick={startCreateFlow}
      type="button"
    >
      <p className="text-sm font-semibold text-moss">Start another track</p>
      <p className="mt-1 text-sm text-ink/62">Create a fresh role plan.</p>
    </button>
    <RailPlanList
      activePlanId={activePlanId}
      openPlan={openPlan}
      plans={savedPlans}
      title="Plans"
    />
  </div>
);

const RailPlanList = ({
  activePlanId,
  openPlan,
  plans,
  title
}: {
  activePlanId?: string;
  openPlan: (planId: string) => void;
  plans: SavedPlan[];
  title: string;
}) => (
  <div>
    <p className="mb-2 text-xs font-semibold uppercase text-ink/45">{title}</p>
    <div className="grid gap-2">
      {plans.length > 0 ? (
        plans.map((plan) => (
          <button
            className={`rounded-md border p-3 text-left transition ${
              activePlanId === plan.id
                ? "border-moss/35 bg-moss/10"
                : "border-ink/10 bg-white hover:border-moss/30"
            }`}
            key={plan.id}
            onClick={() => openPlan(plan.id)}
            type="button"
          >
            <p className="text-sm font-semibold">{plan.title}</p>
            <p className="mt-1 text-xs text-ink/55">{timelineLabels[plan.timelineWeeks]}</p>
          </button>
        ))
      ) : (
        <EmptyState text="No saved plans yet." />
      )}
    </div>
  </div>
);

const CreateIntro = ({ onStart }: { onStart: () => void }) => (
  <section className="flex min-h-[560px] items-center justify-center rounded-lg border border-dashed border-moss/30 bg-[#fffdf8] p-8 text-center shadow-sm">
    <div className="max-w-sm">
      <p className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-moss/10 text-3xl text-moss">
        +
      </p>
      <h1 className="mt-5 text-2xl font-semibold">Create a growth plan</h1>
      <p className="mt-3 text-sm leading-6 text-ink/62">
        Start with a resume, a target role, and the role signals you want the plan to respect.
      </p>
      <div className="mt-6">
        <PrimaryButton onClick={onStart}>Create plan</PrimaryButton>
      </div>
    </div>
  </section>
);

const BuilderSteps = ({
  activeStep,
  setActiveStep
}: {
  activeStep: BuilderStep;
  setActiveStep: (step: BuilderStep) => void;
}) => {
  const steps: { id: BuilderStep; label: string }[] = [
    { id: "inputs", label: "1. Inputs" },
    { id: "gap", label: "2. Skill gap review" },
    { id: "roadmap", label: "3. Roadmap output" }
  ];

  return (
    <div className="flex flex-wrap gap-2 rounded-lg border border-ink/10 bg-[#fffdf8] p-2 shadow-sm">
      {steps.map((step) => (
        <button
          className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
            activeStep === step.id
              ? "bg-moss text-white"
              : "text-ink/55 hover:bg-moss/10 hover:text-ink"
          }`}
          key={step.id}
          onClick={() => setActiveStep(step.id)}
          type="button"
        >
          {step.label}
        </button>
      ))}
    </div>
  );
};

const SegmentedTabs = ({
  activeTab,
  setActiveTab
}: {
  activeTab: WorkspaceTab;
  setActiveTab: (tab: WorkspaceTab) => void;
}) => {
  const tabs: { id: WorkspaceTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "skill-gap", label: "Skill Gap" },
    { id: "roadmap", label: "Roadmap" },
    { id: "projects", label: "Projects" }
  ];

  return (
    <div className="flex flex-wrap gap-2 rounded-lg border border-ink/10 bg-[#fffdf8] p-2 shadow-sm">
      {tabs.map((tab) => (
        <button
          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
            activeTab === tab.id ? "bg-moss text-white" : "text-ink/62 hover:bg-moss/10"
          }`}
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

const FeatureTile = ({ accent, label, text }: { accent: string; label: string; text: string }) => (
  <article className="rounded-lg border border-ink/10 bg-[#fffdf8] p-5 shadow-sm">
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${accent}`}>{label}</span>
    <p className="mt-4 text-sm leading-6 text-ink/68">{text}</p>
  </article>
);

const TopNavButton = ({
  active,
  children,
  onClick,
  prominent
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
  prominent?: boolean;
}) => (
  <button
    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
      active
        ? prominent
          ? "bg-moss text-white shadow-sm"
          : "bg-white text-ink shadow-sm"
        : "text-ink/60 hover:bg-white/70 hover:text-ink"
    }`}
    onClick={onClick}
    type="button"
  >
    {children}
  </button>
);

const PrimaryButton = ({
  children,
  disabled,
  onClick
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <button
    className="min-h-11 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-moss disabled:cursor-not-allowed disabled:bg-ink/35"
    disabled={disabled}
    onClick={onClick}
    type="button"
  >
    {children}
  </button>
);

const SecondaryButton = ({
  children,
  disabled,
  onClick
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <button
    className="min-h-11 rounded-md border border-moss/25 bg-moss/10 px-4 py-2 text-sm font-semibold text-moss transition hover:border-moss/45 disabled:cursor-not-allowed disabled:opacity-45"
    disabled={disabled}
    onClick={onClick}
    type="button"
  >
    {children}
  </button>
);

const FileButton = ({ children, label }: { children: ReactNode; label: string }) => (
  <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-moss/25 bg-moss/10 px-4 py-2 text-sm font-semibold text-moss transition hover:border-moss/45">
    {label}
    {children}
  </label>
);

const Label = ({ children, text }: { children: ReactNode; text: string }) => (
  <label className="grid gap-2 text-sm font-semibold text-ink">
    {text}
    {children}
  </label>
);

const SectionHeader = ({ kicker, title }: { kicker: string; title: string }) => (
  <header>
    <p className="text-xs font-semibold uppercase text-moss">{kicker}</p>
    <h2 className="mt-1 text-lg font-semibold">{title}</h2>
  </header>
);

const ResultPanel = ({ children, title }: { children: ReactNode; title: string }) => (
  <section className="rounded-lg border border-ink/10 bg-[#fffdf8] p-5 shadow-sm">
    <h2 className="text-lg font-semibold">{title}</h2>
    <div className="mt-4">{children}</div>
  </section>
);

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-ink/10 bg-white p-3">
    <p className="text-xs font-semibold uppercase text-ink/45">{label}</p>
    <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
  </div>
);

const InfoBlock = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-ink/10 bg-white p-3 text-sm leading-6">
    <p className="text-xs font-semibold uppercase text-ink/45">{label}</p>
    <p className="mt-1 text-ink/72">{value}</p>
  </div>
);

const EmptyState = ({ text }: { text: string }) => (
  <p className="text-sm leading-6 text-ink/55">{text}</p>
);

const WarningList = ({ warnings }: { warnings: ContractWarning[] }) => (
  <div className="rounded-md border border-clay/30 bg-clay/5 p-3 text-sm leading-6 text-ink/80">
    <p className="font-semibold text-clay">Warnings</p>
    <ul className="mt-1 list-disc pl-5">
      {warnings.map((warning) => (
        <li key={`${warning.code}-${warning.message}`}>{warning.message}</li>
      ))}
    </ul>
  </div>
);

const PillList = ({ values }: { values: string[] }) => (
  <div className="flex flex-wrap gap-2">
    {values.length > 0 ? (
      values.map((value) => (
        <span
          className="rounded-full border border-moss/20 bg-moss/10 px-2.5 py-1 text-xs font-medium text-moss"
          key={value}
        >
          {value}
        </span>
      ))
    ) : (
      <span className="text-sm text-ink/55">No signals yet</span>
    )}
  </div>
);

const SignalBadge = ({ children }: { children: ReactNode }) => (
  <span className="w-fit rounded-full bg-sky px-2.5 py-1 text-xs font-semibold text-ink">
    {children}
  </span>
);

const SeverityBadge = ({ children }: { children: ReactNode }) => (
  <span className="w-fit rounded-full bg-clay/10 px-2.5 py-1 text-xs font-semibold text-clay">
    {children}
  </span>
);

const StatusBadge = ({ children }: { children: ReactNode }) => (
  <span className="w-fit rounded-full border border-ink/10 bg-[#fff4df] px-2.5 py-1 text-xs font-semibold text-ink/70">
    {children}
  </span>
);

const SmallMeta = ({ children }: { children: ReactNode }) => (
  <span className="text-xs font-semibold uppercase text-ink/45">{children}</span>
);

const Notice = ({ children }: { children: ReactNode }) => (
  <div className="rounded-md border border-sky bg-sky/25 p-3 text-sm leading-6 text-ink/70">
    {children}
  </div>
);

const ErrorNotice = ({ children }: { children: ReactNode }) => (
  <div className="rounded-md border border-clay/30 bg-clay/5 p-3 text-sm leading-6 text-clay">
    {children}
  </div>
);

export default App;
