# Fideon OS

## Architecture

```
Frontend (Next.js 15)  →  Backend (FastAPI Python)  →  Database (Self-Hosted Supabase PostgreSQL)
        ↕
  Electron Desktop App (dev/QA only — wraps Next.js renderer)
```

**Rule:** The frontend NEVER touches the database directly. All data flows through FastAPI.  
**Auth:** Custom FastAPI auth — RS256 JWT in HttpOnly cookie. No Supabase Auth SDK. See ADR-001.

---

## Project Structure

```
Fideon-OS-Project/
├── frontend/          # Next.js 15 App Router
├── backend/           # FastAPI Python
├── electron/          # Electron desktop wrapper (dev/QA only)
└── .claude/           # Cross-team interfaces, decisions, architecture
```

---

## Backend Setup (FastAPI)

```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Generate RS256 key pair (first time only — never commit these)
mkdir backend\keys
openssl genrsa -out backend/keys/private.pem 2048
openssl rsa -in backend/keys/private.pem -pubout -out backend/keys/public.pem

# Configure environment
copy .env.example .env
# Edit .env:
#   SUPABASE_URL
#   SUPABASE_SERVICE_ROLE_KEY   ← from self-hosted Supabase service_role key
#   JWT_PRIVATE_KEY_PATH=backend/keys/private.pem
#   JWT_PUBLIC_KEY_PATH=backend/keys/public.pem
#   ANTHROPIC_API_KEY
#   RESEND_API_KEY

# Run dev server
uvicorn main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

---

## Frontend Setup (Next.js)

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
copy .env.local.example .env.local
# Edit .env.local:
#   NEXT_PUBLIC_API_URL=http://localhost:8000
#   JWT_PUBLIC_KEY_PEM=   # PEM content of backend/keys/public.pem (edge runtime only — never sent to browser)

# Run dev server
npm run dev
```

Frontend: http://localhost:3000

---

## Auth Flow

1. Admin sends invite → user clicks link → signs up with password
2. `POST /api/auth/login` — FastAPI verifies Argon2id password → sends 6-digit OTP email
3. `POST /api/auth/otp/verify` — FastAPI issues RS256 JWT as `HttpOnly` cookie (`access_token`) + refresh cookie
4. Every protected request sends the `access_token` cookie automatically — Next.js `middleware.ts` verifies it with `jose` (no network round-trip to FastAPI)
5. Access token expires after 15 min → `POST /api/auth/token/refresh` rotates silently

**No Supabase Auth. No `SUPABASE_JWT_SECRET`. No `Authorization: Bearer` from the frontend.**

For Electron: after OTP verify, the renderer fires `fideon://auth?otc=<value>` → Electron main exchanges the 90-second OTC for a long-lived service token stored in the OS keychain. See `.claude/interfaces/electron_auth_handoff.md`.

---

## API Endpoints

Full index → [`backend/docs/api_overview.md`](backend/docs/api_overview.md) — 114 endpoints across 19 sections.

| Group | Prefix | Auth |
|-------|--------|------|
| Auth | `/api/auth/` | Public / JWT / Cookie / OTC / Bearer |
| Admin | `/api/admin/` | JWT+Admin |
| Marketplace | `/api/marketplace/` | JWT |
| Agents | `/api/agents/` | JWT / Bearer |
| Runs | `/api/runs/` | JWT / Device |
| Agent Access Requests | `/api/agent-requests/` | JWT |
| Custom Agent Requests | `/api/custom-agent-requests/` | JWT |
| Approvals | `/api/approvals/` | JWT |
| Workflows | `/api/workflows/` | JWT |
| Workflow AI | `/api/workflow-ai/` | JWT |
| Governance | `/api/governance/` | JWT |
| Settings | `/api/settings/` | JWT |
| Notifications | `/api/notifications/` | JWT |
| Devices | `/api/devices/` | JWT / Device |
| Training | `/api/training/` | Device / JWT |
| MCP | `/api/mcp/` | JWT |
| Chat | `/api/chat/` | JWT |
| Help | `/api/help/` | JWT |
| System | `/api/health` | Public |

---

## Running Both Servers

```bash
# Terminal 1 — Backend
cd backend && uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend && npm run dev
```

---

## Key Architecture References

| Topic | File |
|-------|------|
| Auth implementation (full spec) | `backend/docs/Auth_Module_Plan.md` |
| Why custom auth (no Supabase Auth) | `.claude/decisions/adr_001_custom_auth.md` |
| Why self-hosted Supabase | `.claude/decisions/adr_002_supabase_selfhosted.md` |
| API endpoint index (114 endpoints) | `backend/docs/api_overview.md` |
| API request/response contracts | `.claude/interfaces/api_contracts.md` |
| Electron auth handoff (OTC/service token) | `.claude/interfaces/electron_auth_handoff.md` |
| IPC channel contract | `.claude/interfaces/ipc_contract.md` |
| Agent DB structure & queries | `backend/docs/pod_structure.md` |
| Electron implementation plan | `electron/docs/plan.md` |
