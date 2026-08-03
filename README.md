# Resume-to-Skill Growth Planner

A project that takes your resume and provides a skill growth planner for your next interview.

## Prerequisites

- Node.js `20.19.0` or newer
- npm
- PostgreSQL for saved planner runs

Check your versions:

```bash
node --version
npm --version
```

## Setup

Install dependencies from the repository root:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Create the local database named in `.env.example`:

```bash
createdb resume_skill_growth
```

The backend creates the MVP `planner_runs` table automatically on startup.

## Run Frontend And Backend Together

From the repository root:

```bash
npm run dev
```

This starts:

- Frontend: `http://localhost:5173/`
- Backend: `http://localhost:4000/`

Check the backend health endpoint:

```bash
curl http://localhost:4000/health
```

List saved planner runs:

```bash
curl http://localhost:4000/planner-runs
```

## Run Frontend Only

From the repository root:

```bash
npm run dev -w frontend
```

Open:

```text
http://localhost:5173/
```

## Run Backend Only

Build the shared package first, then start the backend dev server:

```bash
npm run build -w shared
npm run dev -w backend
```

Backend health check:

```bash
curl http://localhost:4000/health
```

Parse pasted resume text:

```bash
curl -X POST http://localhost:4000/resumes/parse \
  -F "resumeText=Sample Candidate
Software Engineer
Skills: TypeScript, React, Node.js, PostgreSQL, Git
Experience: 1.5 years of experience building web applications
Projects: Resume-to-Skill Growth Planner
Education: Computer Science"
```

Parse a resume file:

```bash
curl -X POST http://localhost:4000/resumes/parse \
  -F "resume=@/absolute/path/to/resume.pdf"
```

Analyze target role and job descriptions:

```bash
curl -X POST http://localhost:4000/job-descriptions/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "targetRole": "Frontend Engineer",
    "targetStack": ["React", "TypeScript"],
    "jobDescriptions": [
      {
        "id": "jd-1",
        "rawText": "Role: Frontend Engineer. Required: React, TypeScript, REST. Preferred: Testing Library. Build UI features and collaborate with designers."
      }
    ]
  }'
```

Generate skill gap analysis:

```bash
curl -X POST http://localhost:4000/gap-analysis/generate \
  -H "Content-Type: application/json" \
  -d '{
    "targetRole": "Frontend Engineer",
    "targetStack": ["React", "TypeScript", "Testing Library"],
    "parsedResume": {
      "candidateName": "Sample Candidate",
      "experienceYears": 1.5,
      "currentRole": "Software Engineer",
      "skills": {
        "languages": ["TypeScript"],
        "frameworks": ["React"],
        "databases": ["PostgreSQL"],
        "cloud": [],
        "tools": ["Git"],
        "other": []
      },
      "experience": [],
      "projects": [],
      "education": [],
      "inferredDomains": ["frontend web applications"]
    },
    "acceptedJobDescriptions": []
  }'
```

Generate roadmap:

```bash
curl -X POST http://localhost:4000/roadmaps/generate \
  -H "Content-Type: application/json" \
  -d '{
    "targetRole": "Frontend Engineer",
    "timelineWeeks": 8,
    "targetStack": ["React", "TypeScript", "Testing Library"],
    "jobDescriptionCount": 1,
    "gapAnalysisItems": [
      {
        "skillName": "Testing Library",
        "category": "tools",
        "currentLevel": "Not shown",
        "targetLevel": "Interview-ready",
        "gapSeverity": "Critical",
        "reason": "Testing Library is included in the target stack.",
        "signalStrength": "Medium signal",
        "evidenceSources": []
      }
    ]
  }'
```

Generate project recommendations:

```bash
curl -X POST http://localhost:4000/projects/recommend \
  -H "Content-Type: application/json" \
  -d '{
    "targetRole": "Frontend Engineer",
    "targetStack": ["React", "TypeScript", "Testing Library"],
    "gapAnalysisItems": [
      {
        "skillName": "Testing Library",
        "category": "tools",
        "currentLevel": "Not shown",
        "targetLevel": "Interview-ready",
        "gapSeverity": "Critical",
        "reason": "Testing Library is included in the target stack.",
        "signalStrength": "Medium signal",
        "evidenceSources": []
      }
    ]
  }'
```

## Port Already In Use

If the backend fails with `EADDRINUSE: address already in use :::4000`, another process is already using port `4000`.

Find the process:

```bash
lsof -nP -iTCP:4000 -sTCP:LISTEN
```

Stop it by replacing `<PID>` with the process ID from the previous command:

```bash
kill <PID>
```

Or run the backend on another port:

```bash
PORT=4001 npm run dev -w backend
```

If you change the backend port, update `VITE_API_URL` in `.env` to match it.

## Build

Build all workspaces:

```bash
npm run build
```

## Lint And Format

```bash
npm run lint
npm run format:check
```

## Evaluation

Start the app first:

```bash
npm run dev
```

Then run the sample evaluation set in another terminal:

```bash
npm run evaluate
```

Evaluation cases live in `eval/sample-cases.json`.

More details:

- `docs/evaluation.md`
- `docs/demo-script.md`
