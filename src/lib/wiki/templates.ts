import { today } from '../format';

export interface Template { id: string; name: string; description: string; body: string }

/** Starting points for new pages. %TODAY% becomes the current date. */
export const TEMPLATES: Template[] = [
  { id: 'blank', name: 'Blank page', description: 'Start from nothing', body: '' },
  { id: 'runbook', name: 'Runbook', description: 'Symptoms, checks and fixes for one service', body: '# Runbook: Service name\n\n> [!important]\n> Page the on-call engineer if customers are affected for more than 10 minutes.\n\n[[_TOC_]]\n\n## Symptoms\n\n- Alert name and what it means\n\n## Checks\n\n1. Open the service dashboard.\n2. Look for a recent deploy in the pipeline history.\n\n## Fixes\n\n```bash\nkubectl rollout undo deployment/service-name\n```\n\n## Escalation\n\n| When | Who |\n| --- | --- |\n| No progress after 30 minutes | Team lead |\n' },
  { id: 'adr', name: 'Architecture decision', description: 'Context, decision and consequences', body: '# ADR: Title\n\n| Status | Date | Deciders |\n| --- | --- | --- |\n| Proposed | %TODAY% | @username |\n\n## Context\n\nWhat problem are we solving, and why now?\n\n## Decision\n\nWhat we will do.\n\n## Options considered\n\n1. Option A\n2. Option B\n\n## Consequences\n\n- Positive:\n- Negative:\n' },
  { id: 'howto', name: 'How-to guide', description: 'Steps to get one task done', body: '# How to …\n\n## Before you start\n\n- [ ] Access to …\n- [ ] Tool installed\n\n## Steps\n\n1. First step\n2. Second step\n\n## Check that it worked\n\n> [!tip]\n> Describe what success looks like.\n' },
  { id: 'meeting', name: 'Meeting notes', description: 'Agenda, notes and action items', body: '# Meeting: Topic, %TODAY%\n\n**Attendees:** @username\n\n## Agenda\n\n1. Item\n\n## Notes\n\n- \n\n## Action items\n\n- [ ] Action, @owner\n' },
  { id: 'postmortem', name: 'Incident review', description: 'Timeline, impact and follow-ups', body: '# Incident review: Title\n\n| Severity | Started | Resolved | Duration |\n| --- | --- | --- | --- |\n| S2 | %TODAY% 10:00 | %TODAY% 11:15 | 1h 15m |\n\n## Impact\n\nWho was affected and how.\n\n## Timeline\n\n| Time | Event |\n| --- | --- |\n| 10:00 | Alert fired |\n\n## Root cause\n\n```mermaid\ngraph LR\n  A[Deploy] --> B[Config change]\n  B --> C[Error spike]\n```\n\n## Follow-ups\n\n- [ ] Follow-up issue #\n' },
  { id: 'onboarding', name: 'Onboarding', description: 'Checklist for new team members', body: '# Welcome to the team\n\n## Week 1\n\n- [ ] Get access to the GitLab group\n- [ ] Clone the main repositories\n- [ ] Pair with your buddy\n\n## Useful links\n\n- [Home](home)\n\n<details>\n<summary>Terms we use</summary>\n\n- **MR**: merge request\n- **ADR**: architecture decision record\n\n</details>\n' },
];

export const fillTemplate = (body: string) => body.replace(/%TODAY%/g, today());
