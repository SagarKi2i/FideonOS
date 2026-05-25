# ADR-002: Self-Hosted Supabase as PostgreSQL Database Only

**Status:** Accepted  
**Date:** 2026-05-21  
**Deciders:** Backend Lead, MLOps Lead, Infrastructure Lead  
**Supersedes:** n/a  
**Superseded by:** n/a

---

## Context

Fideon OS stores sensitive insurance-industry data: carrier portal credentials (AES-256-GCM encrypted), loss run documents, policy comparison outputs, quote data, and user PII. The customer base operates under regulatory frameworks (state DOI, E&O, SOC 2 trajectory) that impose requirements on data residency, audit trails, and access controls.

The initial prototype used Supabase managed cloud (supabase.com). During infrastructure review, two categories of concern were identified:

**Data residency and control:**
- Managed Supabase stores data in shared infrastructure on AWS. For insurance carriers and brokerages with data-residency clauses, this may be contractually blocked.
- Supabase cloud's encryption-at-rest uses AWS-managed keys by default. The project requires customer-controlled KMS keys (AWS KMS) for credential encryption (`carrier_connections.password_ciphertext`, `ams_connections.password_ciphertext`, `ams_connections.api_key_ciphertext`).
- The Supabase Vault integration with AWS KMS is available on self-hosted but not on the free/pro managed tiers.

**Cost and predictability at scale:**
- Managed Supabase pricing is based on compute + egress. At projected scale (thousands of pod runs per day per tenant, large JSONB blobs in `pod_runs.output`, LangGraph checkpoint BYTEAs), egress costs become unpredictable.
- Self-hosted on an Azure VM provides a fixed-cost compute model with no egress metering for internal traffic between the FastAPI App Service and the VM.

**Stack colocation:**
- The Valkey rate-limiter (required by ADR-001) must be low-latency to FastAPI. Colocating Valkey on the same Azure VM as the Supabase PostgreSQL instance means zero cross-datacenter latency for the auth hot path.
- LangGraph's `PostgresSaver` requires a persistent PostgreSQL connection with low overhead. Managed Supabase introduces connection pooler hops (PgBouncer via Supavisor) that add latency on long-running LangGraph state checkpoints.

**Operational flexibility:**
- Self-hosted Supabase (Docker Compose + Kong) gives full access to `postgresql.conf` tuning, extension management (`pgvector`, `pg_cron`, custom FDWs), and backup schedule control.
- Supabase managed cloud does not allow `pg_cron` jobs or custom extensions outside their approved list.

---

## Decision

**Supabase is self-hosted on an Azure VM using Docker Compose + Kong.** It is used exclusively as a PostgreSQL database — no Supabase Auth, no Supabase Storage, no Supabase Realtime (unless explicitly re-evaluated).

Specifics:

- **Hosting:** Azure VM (Standard D-series), same Azure region as FastAPI App Service. Network access restricted to App Service outbound IPs via Azure VNet/NSG rules.
- **Compose stack:** Supabase official `docker-compose.yml` (PostgreSQL + Kong API gateway + Supabase Studio for admin). No Supabase Auth (GoTrue) container running — stopped and removed from compose.
- **Connection:** FastAPI connects via `supabase-py` using the service-role key for all DB operations. No anon-key usage in backend. Frontend never connects directly to Supabase — all DB access is proxied through FastAPI.
- **Credential encryption:** `carrier_connections.password_ciphertext` and `ams_connections.*_ciphertext` encrypted AES-256-GCM via Supabase Vault. Vault master key stored in **AWS KMS** (cross-cloud; chosen for KMS maturity and FIPS 140-2 compliance). Key rotation every 90 days, automated via KMS key policy.
- **Auth tables:** No `auth.*` tables created or used. Supabase's GoTrue service is not running. All auth is `public.*` custom tables per ADR-001.
- **Valkey:** Co-located on the same Azure VM as Supabase PostgreSQL. Bound to `127.0.0.1`; FastAPI reaches it via the VM's private IP. Not exposed to the public internet.
- **Backups:** Azure VM disk snapshots (daily, 7-day retention) + pg_dump exports to Azure Blob Storage (daily, 30-day retention, GRS redundancy).
- **Kong:** Used as the Supabase API gateway. Only PostgREST is exposed through Kong for any direct table queries from FastAPI that use the REST interface. JWT verification is done by FastAPI, not Kong — Kong's JWT plugin is disabled.
- **Environments:**
  - `dev` — Supabase local CLI (`supabase start`) on developer machine. Schema migrations via `supabase db push`.
  - `staging` — Azure VM (smaller SKU), auto-deployed on merge to `main`.
  - `production` — Azure VM (production SKU), manual deploy from branch `v1`.
- **No Supabase cloud dependency at runtime.** Supabase.com is used only for:
  - `supabase` CLI (local dev schema management)
  - Docker image source for the self-hosted compose stack

---

## Consequences

### Positive

- **Data residency:** All data stays in the specified Azure region. Contractually compliant with insurance carrier data-residency clauses.
- **KMS-controlled encryption:** Vault + AWS KMS gives customer-auditable key lifecycle. Key rotation is operationally clean (KMS rotation, Vault re-encrypt, no app downtime).
- **Fixed cost model:** VM SKU determines cost; no egress metering surprises at scale.
- **Valkey colocation:** Auth rate-limit checks are sub-millisecond. LangGraph checkpoint writes have no cross-region overhead.
- **PostgreSQL tuning:** `work_mem`, `max_connections`, `shared_buffers`, WAL settings all controllable. `pg_cron` available for stats maintenance jobs (e.g. nightly `completed_today` reset in `activated_model_stats`).
- **Extension freedom:** `pgvector` available if semantic search is added to pod outputs. Custom FDWs possible for carrier data pipelines.

### Negative / Trade-offs

- **Operational burden:** The team owns PostgreSQL upgrades, vacuuming, index maintenance, replication setup (if needed), and disaster recovery. Supabase managed cloud handles all of this automatically.
- **No Supabase Dashboard for production data:** Supabase Studio runs on the VM but is not internet-accessible in production. Admin DB operations require SSH tunnel or internal VPN.
- **Backup ownership:** pg_dump + snapshot strategy is manually configured. A missed retention policy or disk failure before a snapshot window is a data-loss risk. Managed Supabase has point-in-time recovery (PITR) built in.
- **Schema migrations:** `supabase db push` works against local and staging. Production migrations require a coordinated deploy step. No automatic migration runner — a CI/CD migration job must be added (see mlops/docs/).
- **GoTrue not available:** Any future requirement for social OAuth (Google, Microsoft) would require either adding GoTrue back to the compose stack or integrating a separate OAuth provider. This is currently out of scope.
- **Cross-cloud KMS dependency:** Vault is on Azure VM, KMS is on AWS. This adds an AWS account dependency. Mitigated by: KMS calls are only on credential encrypt/decrypt operations (not on every request), and Azure Key Vault is an alternative if the AWS dependency is later undesirable.

### Neutral

- Supabase RLS is enabled on all tables as a defence-in-depth layer. FastAPI enforces access control in Python (service-role connection bypasses RLS at the DB level), but RLS policies exist to catch any accidental direct-connection queries.
- `supabase-py` client works identically against self-hosted and managed cloud — no code changes needed if hosting is ever migrated.
- Supabase Studio is available on the VM for dev/staging inspection but is explicitly not a production admin tool.

---

## Alternatives Considered

| Alternative | Reason rejected |
|-------------|----------------|
| Supabase managed cloud (pro/team tier) | Data residency clauses; KMS not available on managed; egress cost at scale; no `pg_cron`; Valkey must still be colocated separately |
| AWS RDS PostgreSQL (no Supabase) | Losing Supabase Studio, PostgREST, and the `supabase-py` client would require replacing tooling with no net benefit; RDS is more expensive than a VM for this workload |
| Neon (serverless PostgreSQL) | No persistent connections for LangGraph `PostgresSaver`; data residency not guaranteed; no self-hosting option |
| PlanetScale (MySQL) | Not PostgreSQL; JSONB queries, `pg_cron`, and `pgvector` unavailable; major migration cost |
| Azure Database for PostgreSQL (Flexible Server) | Viable alternative; rejected in favour of self-hosted Supabase to keep the Supabase toolchain (Studio, migrations, `supabase-py`) while gaining Azure VM cost model. Re-evaluate if operational burden of self-hosting becomes unsustainable. |

---

## Open Items

- [ ] Confirm Valkey VM colocation with MLOps — see `mlops/docs/azure_infra.md`
- [ ] Define `pg_cron` job schedule for nightly `completed_today` reset in `user_agent_stats`
- [ ] Add production migration CI/CD step to GitHub Actions — see `mlops/docs/`
- [ ] Decide on Azure Key Vault vs. AWS KMS as long-term single KMS provider

---

## References

- `.claude/decisions/adr_001_custom_auth.md` — companion decision on auth architecture
- `backend/docs/pod_structure.md` — complete schema reference
- `backend/docs/Auth_Module_Plan.md` — auth tables and migration list
- `mlops/docs/azure_infra.md` — VM sizing, networking, Valkey placement
- Supabase self-hosting docs: https://supabase.com/docs/guides/self-hosting/docker

---

*ADRs are append-only. Do not edit this record. Add a new ADR to supersede.*
