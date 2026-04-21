# Project Skills Rules

This project uses a project-local skill layer from `.codex/skills`.
Active routing artifacts live in `skill-system/`.
Detailed governance/reference material is archived under `skill-system/reference/` and `docs/reference/`.

## Core Visible Rule

Every task, analysis step, planning step, implementation step, status update, handoff, and final report must explicitly show the responsible skill.

Use:

- `Skill: <primary-skill>`
- `Skills: <primary-skill>, <support-skill>`
- `Skill: base`
- `Handoff: <from-skill> -> <to-skill>` when responsibility changes

## Core Working Order

1. Read `skill-system/router.json` and resolve the task category.
2. Read `skill-system/registry.json` only to confirm the skill is project-local and callable.
3. Use `skill-system/supplemental-skills.json` only when a required skill is intentionally platform-resident.
4. Use `skill-system/governance.json` for manager, routing executor, logging, and final gates.
5. Open archived reference files only when route resolution, audits, or maintenance work require more detail.

## Canonical Source Policy

- Project-local skills are canonical for project logic.
- Global skills remain universal background assets and must not override project-local routing.
- A global/platform skill may be used only when it is explicitly declared in `skill-system/supplemental-skills.json`.

## Gates

- Do not mark a step complete without a traceable result.
- Do not skip review after doubtful or high-risk stages.
- Do not finalize document output before validated aggregation, testing, and security gates pass.
