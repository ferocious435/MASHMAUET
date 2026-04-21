# Project-local Skill Operating Guide

This file defines how the project-local skill system must be used during real work.

## Locations

- Local skills: `.codex/skills`
- Registry: `skill-system/registry.json`
- Groups: `skill-system/groups.json`
- Router: `skill-system/router.json`
- Governance: `skill-system/governance.json`
- Install report: `skill-system/install-report.json`
- Duplicate source report: `skill-system/source-duplicates.json`

## Mandatory Attribution Rule

Every visible work artifact must show the responsible skill:

- task execution
- analysis
- planning
- implementation
- status updates
- handoffs
- final summaries

Use:

- `Skill: <name>`
- `Skills: <name1>, <name2>`
- `Skill: base` if no specialized skill is in charge

If responsibility changes, write:

- `Handoff: <from-skill> -> <to-skill>`

## Canonical Flow

1. Determine the task category from `router.json`.
2. Select the primary, support, validation, and fallback skills from `registry.json`.
3. Check whether a review checkpoint is required.
4. Produce a traceable result before any handoff.
5. Record the responsible skill in every visible step.
6. Do not proceed to final output before testing and security gates pass.

## Central Roles

- Main skill manager: `manage-skills`
- Routing executor: `antigravity-skill-orchestrator`
- Long-running operating mode: `loki-mode`

## Policy Notes

- Use the project-local set as the active project skill layer.
- Use the root `skills/<name>` source as canonical.
- Do not activate plugin or bundle duplicates in parallel with the canonical local copy.
