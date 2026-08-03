# Resume-to-Skill Growth Planner

## Overview

Resume-to-Skill Growth Planner is an agentic AI application that helps a user upload their resume, define a target role, analyze skill gaps, and generate a structured roadmap for improvement.

The product is designed for job seekers who want a realistic learning plan based on:

- their current resume
- their target role
- selected job descriptions
- timeline constraints such as 8 weeks, 3 months, or 6 months
- preferred learning focus such as DSA, backend, frontend, cloud, or AI

The system should not behave like a generic chatbot. It should act like a guided career upskilling assistant that produces structured, actionable output.

## Primary Goal

Help users move from:

- "I want to switch roles but do not know what to learn next"

to:

- "I know my current gaps, target proficiency levels, weekly roadmap, and project/interview plan"

## Core User Flow

1. User signs in.
2. User uploads a resume.
3. User selects a target role.
4. User optionally uploads or pastes one or more job descriptions.
5. System extracts current skills, experience, and project signals from the resume.
6. System extracts required skills and expectations from job descriptions.
7. System compares current profile against target requirements.
8. System generates:
   - skill gap analysis
   - proficiency levels
   - study roadmap
   - project recommendations
   - interview preparation tasks
9. User tracks progress over time.
10. System updates recommendations based on completed milestones.

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS

### Backend

- Node.js
- TypeScript
- Express or NestJS

### AI Layer

- OpenAI or Azure OpenAI for reasoning and plan generation
- Optional Ollama for local development

### Data Layer

- PostgreSQL for users, plans, progress, and structured outputs
- Optional pgvector if we store embeddings for resume and JD comparison

### Storage

- Local file storage during development
- Azure Blob Storage or S3-compatible storage for production if needed

### Infra

- Docker
- GitHub Actions
- Azure App Service, Azure Container Apps, Railway, or Render

## Agentic Design

The system should use multiple focused agents or tool-based workflows instead of a single monolithic prompt.

### Suggested Agents

#### 1. Resume Parser Agent

Responsibilities:

- extract technical skills
- extract experience summary
- identify projects
- infer strength areas and weak areas

Output:

- structured resume profile JSON

#### 2. Job Description Analyzer Agent

Responsibilities:

- extract required skills
- identify preferred tools and frameworks
- infer expected seniority
- identify role-specific interview expectations

Output:

- structured JD requirements JSON

#### 3. Gap Analysis Agent

Responsibilities:

- compare resume profile against target role and JD requirements
- identify missing skills
- identify weak signals
- rank skill gaps by impact

Output:

- ordered skill gap report

#### 4. Roadmap Generator Agent

Responsibilities:

- generate phased study plan
- assign weekly learning goals
- map gaps to measurable outcomes
- recommend realistic sequencing

Output:

- study plan with milestones

#### 5. Project Recommender Agent

Responsibilities:

- suggest resume-worthy projects based on target role
- match projects to missing skills
- ensure projects are scoped realistically

Output:

- project recommendations with rationale

#### 6. Progress Tracker Agent

Responsibilities:

- update proficiency based on completed tasks
- revise timeline if user falls behind
- highlight what to study next

Output:

- updated learning state

## Suggested MCP Tools

If we add MCP support, expose tools like:

- `parse_resume(file_path)`
- `analyze_job_description(text)`
- `compare_resume_to_target(resume_id, role_id, jd_ids[])`
- `generate_study_plan(user_id, timeline_weeks)`
- `recommend_projects(user_id, target_role)`
- `update_progress(user_id, completed_task_id)`
- `generate_mock_interview(user_id, target_role)`

## Data Model

### users

- id
- name
- email
- target_role
- preferred_timeline_weeks
- created_at

### resumes

- id
- user_id
- file_name
- parsed_text
- parsed_json
- created_at

### job_descriptions

- id
- user_id
- source
- raw_text
- parsed_json
- created_at

### skill_profiles

- id
- user_id
- skill_name
- current_level
- target_level
- evidence
- gap_score

### study_plans

- id
- user_id
- title
- duration_weeks
- plan_json
- created_at

### milestones

- id
- study_plan_id
- week_number
- title
- tasks_json
- status

### progress_logs

- id
- user_id
- milestone_id
- notes
- completion_percent
- created_at

## Proficiency Model

Each tracked skill should support a progression model such as:

1. Beginner
2. Working Knowledge
3. Project-Ready
4. Interview-Ready
5. Production-Ready

Example:

- TypeScript
  - Current: Working Knowledge
  - Target: Interview-Ready

- System Design
  - Current: Beginner
  - Target: Working Knowledge

## MVP Scope

The first version should include:

- resume upload
- target role selection
- JD paste/upload
- skill gap analysis
- proficiency-level mapping
- 8-week or 12-week study plan
- simple dashboard for plan and progress

The first version should not include:

- complex multi-user collaboration
- live scraping of job portals
- overbuilt vector search
- real-time chat memory orchestration
- enterprise SSO

## Success Criteria

The project is successful if a user can:

- upload a resume
- select a target role
- understand their major gaps within a few seconds
- receive a believable, role-specific roadmap
- track progress week by week
- explain the product clearly in a resume or interview

## Engineering Notes

- Prefer structured outputs from the LLM over free-form text where possible.
- Keep prompts auditable and versioned.
- Use deterministic backend validation for required fields.
- Avoid sending full conversation history on every request.
- Add caching for repeated JD analysis and resume parsing.
- Log token usage, latency, and model errors for each AI workflow.

## Resume Positioning

This project should eventually support a resume bullet like:

Built an agentic AI career upskilling platform that parses resumes and job descriptions, identifies role-specific skill gaps, maps proficiency levels, and generates personalized study plans, project recommendations, and interview-preparation roadmaps using React, TypeScript, Node.js, PostgreSQL, and LLM-driven workflows.

## Next Build Steps

1. Define API contract for resume upload and JD analysis.
2. Design database schema.
3. Build resume parser flow.
4. Build JD analyzer flow.
5. Build gap analysis service.
6. Build roadmap generation service.
7. Create frontend dashboard for results.
8. Add progress tracking.
9. Add Docker and deployment setup.
10. Add README with architecture and setup instructions.
