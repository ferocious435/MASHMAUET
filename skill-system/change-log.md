# Skill System Change Log

## 2026-04-13

- Added runtime `SkillOrchestratorService` to route task categories through primary, supporting, validation, and fallback skills with JSONL trace logging.
- Updated `skill-system/router.json` and `skill-system/groups.json` so product/discovery and document-flow routes visibly include `product-manager` and `brainstorming` where appropriate.
- Declared `brainstorming` in `skill-system/supplemental-skills.json` as a platform-resident support skill because the workspace-managed `.codex/skills` directory rejected creating a new local skill folder during this session.
- Extended visible attribution so routed responses expose the selected skill plus source metadata for project-local and supplemental skills.
- Extended the same routing model into `CaseService` and `CaseAnalysisPipeline`, so internal stages now record real route decisions in persisted pipeline trace instead of relying on static hardcoded skill labels.
- Added `CaseOutputExportService` so `generate` now persists a real export package on disk and stores artifact manifests inside the case state.

## 2026-04-16

- Reduced default context load by moving long roadmap/policy/SOP documents into `docs/reference/` and replacing root copies with slim entry files.
- Archived original source-input documents into `docs/archive/source-inputs/` and kept root-level stubs for explicit on-demand access only.
- Archived full `skill-system` governance artifacts under `skill-system/reference/` and replaced active `PROJECT-SKILLS.md`, `router.json`, `governance.json`, `registry.json`, and `groups.json` with slim runtime-focused versions.
- Archived non-runtime-heavy `loki-mode` payload (`benchmarks`, `demo`, `examples`, screenshots) into `skill-system/archive/skills/loki-mode/` while keeping the active skill itself callable.
