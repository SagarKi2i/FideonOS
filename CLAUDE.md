# Fideon OS

## Stack (single source of truth)
- Frontend: Next.js 15 SSR — Azure App Service
- Backend: FastAPI — Azure App Service
- DB: Self-hosted Supabase (Azure VM, Docker Compose + Kong) — NOT managed cloud
- Auth: Custom FastAPI (RS256/Argon2id) — zero Supabase Auth
- Desktop: Electron — dev/QA only, not a production deploy target
- GPU: RunPod via Cloudflare Tunnel
- Queue: Valkey, co-located on Supabase Azure VM
- Envs: dev (auto) / staging (auto) / production (manual, branch v1)

## Alignment status (READ FIRST)
- Canonical schema = 24 tables in supabase/migrations. Only **auth, agents, devices** are real & aligned.
- Governance/workflows/schedules/inbox/documents/pods = NO tables yet → BLOCKED, owned by others.
- Full status + per-owner handoff → ALIGNMENT_AND_REMAINING_WORK.md
- Do NOT regenerate frontend/integrations/supabase/types.ts until all consumers migrated (it's load-bearing).

## Where to find things
- Cross-team interfaces → .claude/interfaces/
- Architecture decisions → .claude/decisions/
- Auth implementation → backend/docs/Auth_Module_Plan.md
- API endpoint index (cross-team reference) → backend/docs/api_overview.md
- Electron implementation → electron/docs/plan.md
- CI/CD + infra truth → mlops/docs/

## Open blockers (must resolve before coding)
- [x] fideon:// sub-path routing — RESOLVED: `fideon://auth?otc=<value>`
       see .claude/interfaces/ipc_contract.md §1
- [ ] Valkey location confirmed with MLOps
       see mlops/docs/azure_infra.md
- [x] auth:set-token IPC — RESOLVED: eliminated (old Supabase design, not implemented)
       see .claude/interfaces/electron_auth_handoff.md §5

## Conventions
- All cross-team interface changes → update .claude/interfaces/ first, PR required
- Completed execution records → move to <team>/docs/records/
- ADRs are append-only — never edit a past decision, add a new one
