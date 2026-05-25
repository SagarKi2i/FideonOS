# Valkey Setup (Queue / Cache)

How Valkey is provisioned and wired to the FastAPI backend. Valkey is the
Redis-compatible store used by the **rate limiter** (`services/ratelimit_service.py`)
and the **Electron one-time-code (OTC) flow** (`routers/auth.py`). If `VALKEY_URL`
is unset or unreachable, the backend silently falls back to a per-instance
in-memory store — fine for local dev, but **not shared across App Service
instances**, so rate limits and OTCs break under scale-out.

> ⚠️ **Secrets:** Do not commit the Valkey password. It lives only on the VM
> (`valkey/valkey.conf`) and in the per-environment GitHub `VALKEY_URL` secret.
> This doc uses `<VALKEY_PASSWORD>` as a placeholder.

---

## Architecture

- **Backend:** FastAPI on Azure App Service (`fideon-dev-backend`, etc.) — *off-VM*.
- **Valkey:** runs as a standalone Docker container on the **Supabase Azure VM**
  (the same VM that hosts the self-hosted Supabase stacks).
- The backend reaches Valkey **across the network**, not via a shared Docker
  network — so connectivity depends on Azure networking (see §4).

Client library: **`valkey-py`** (`valkey==6.0.2` in `backend/requirements.txt`),
a drop-in fork of `redis-py`. The code uses `import valkey` / `valkey.from_url(...)`.

---

## 1. Valkey container on the VM

SSH to the Supabase VM (`azureuser@<vm>`). Valkey runs **independently** of the
Supabase compose stacks (no compose file edits — safer given the multiple
`supabase-*` stacks on the box). One Valkey instance **per environment**, each on
its own host port.

### 1.1 Config file

`/home/azureuser/<stack-dir>/valkey/valkey.conf`:

```conf
save 60 1000
appendonly yes
appendfsync everysec
maxmemory 256mb
maxmemory-policy allkeys-lru
requirepass <VALKEY_PASSWORD>
bind 0.0.0.0
protected-mode no
```

Generate the password with `openssl rand -base64 32` (prefer one without `/` or
`+` so it's URL-safe in `VALKEY_URL`).

Write it without an editor (paste-into-nano corrupts it):

```bash
cat > /home/azureuser/<stack-dir>/valkey/valkey.conf <<'EOF'
save 60 1000
appendonly yes
appendfsync everysec
maxmemory 256mb
maxmemory-policy allkeys-lru
requirepass <VALKEY_PASSWORD>
bind 0.0.0.0
protected-mode no
EOF
```

### 1.2 Run the container

```bash
# confirm the host port is free first
sudo ss -ltnp | grep <host-port>

docker run -d --name <env>-valkey --restart unless-stopped \
  -p <host-port>:6379 \
  -v /home/azureuser/<stack-dir>/valkey/valkey.conf:/etc/valkey/valkey.conf:ro \
  -v <env>-valkey-data:/data \
  valkey/valkey:8 valkey-server /etc/valkey/valkey.conf
```

### 1.3 Verify

```bash
docker ps | grep valkey
docker exec -it <env>-valkey valkey-cli -a '<VALKEY_PASSWORD>' ping   # -> PONG
```

---

## 2. VALKEY_URL format

```
valkey://:<VALKEY_PASSWORD>@<host>:<host-port>
```

- `<host>` = VM **private IP** (`10.0.0.x`) if the App Service is VNet-integrated,
  or the VM **public IP** if using the public-IP path (see §4).
- Use `valkeys://` (TLS) instead of `valkey://` if TLS is configured.
- `valkey-py` parses the password from the URL automatically.

Set it as a **per-environment GitHub secret**, NOT in the repo:

```bash
gh secret set VALKEY_URL --env <dev|staging|production> --body 'valkey://:<VALKEY_PASSWORD>@<host>:<port>'
```

The deploy workflow injects it into the App Service app settings
(`.github/workflows/deploy-app-service.yml`, lines ~163 and ~263). If the secret
is empty, the workflow **skips** it and the backend falls back to in-memory.

---

## 3. Backend deploy requirement

`valkey` must be installed on the App Service. It's pinned in
`backend/requirements.txt` (`valkey==6.0.2`). After adding/changing it, **redeploy
the backend** — otherwise the app shows `ModuleNotFoundError: No module named 'valkey'`
and stays on the in-memory fallback.

---

## 4. Networking — two paths

The backend is off-VM, so it must traverse Azure networking to reach Valkey.

### Path A — Private (recommended for staging/prod)

1. **VNet-integrate** the App Service into the VM's VNet (App Service →
   Networking → VNet integration; needs a dedicated subnet delegated to
   `Microsoft.Web`, e.g. /28).
2. **Enable Route All** (`vnetRouteAllEnabled=true`) so private (RFC1918) traffic
   to `10.0.0.x` routes through the VNet.
3. **NSG inbound rule** on the VM: Source = App Service integration subnet CIDR,
   Destination port = `6379`, Protocol TCP, Action Allow. No `Internet`/`Any`.
4. `VALKEY_URL` uses the **private IP** (`10.0.0.5`).

### Path B — Public IP (acceptable for dev only)

Used when VNet integration is skipped.

1. Get the App Service **outbound IPs** (App Service → Networking → Outbound
   addresses; use the full "all outbound IPs" list).
2. **NSG inbound rule** on the VM: Source = those outbound IPs (comma-separated),
   Destination port = `6379`, TCP, Allow, priority e.g. `310`,
   name `Allow-AppService-Valkey`. **Do not** use `Internet`/`Any` as source.
3. `VALKEY_URL` uses the VM **public IP**.

> ⚠️ Path B exposes the Valkey port to the internet (gated only by password and
> the NSG source scope). App Service outbound IPs are shared across tenants and
> can change on tier changes. Plaintext unless TLS is added. **Do not use Path B
> for staging/production** — migrate those to Path A.

---

## 5. Verify end-to-end (from the App Service)

Use the App Service SSH console (Portal → Development Tools → SSH, or
`https://<app>.scm.azurewebsites.net/webssh/host`).

```bash
# network reachability (no deps) — replace host/port for the env
timeout 3 bash -c "cat < /dev/null > /dev/tcp/<host>/<port>" && echo "network OK" || echo "blocked"

# full client check (requires backend redeployed with valkey)
python3 -c "import valkey; valkey.from_url('valkey://:<VALKEY_PASSWORD>@<host>:<port>', socket_connect_timeout=3).ping()" && echo OK
```

- `network OK` → NSG / routing is correct.
- `OK` → fully wired; rate limiter + OTC use Valkey.
- `ModuleNotFoundError: valkey` → redeploy the backend (§3).
- `blocked` / timeout → networking (§4): VNet integration, Route All, or NSG.

---

## 6. Current state (dev) — 2026-05-25

| Item | Value |
|------|-------|
| Stack dir | `/home/azureuser/supabase-dev-v2/` |
| Container | `supabase-dev-valkey` (`valkey/valkey:8`, `--restart unless-stopped`) |
| Config | `/home/azureuser/supabase-dev-v2/valkey/valkey.conf` |
| Volume | `supabase-dev-valkey-data` |
| Host port | `6379` |
| VM private IP | `10.0.0.5` |
| VM public IP | `52.249.220.12` |
| Networking path | **Path B (public IP)** — VNet integration skipped for dev |
| NSG rule | inbound `6379` scoped to `fideon-dev-backend` outbound IPs |
| App Service | `fideon-dev-backend` |
| `VALKEY_URL` (dev) | `valkey://:<VALKEY_PASSWORD>@52.249.220.12:6379` |
| Network test | ✅ `network OK` from App Service |
| `valkey` dep on app | ⏳ pending backend redeploy |
| `VALKEY_URL` secret set | ⏳ pending |

### Remaining for dev
- [ ] Set `VALKEY_URL` dev GitHub secret
- [ ] Redeploy `fideon-dev-backend` (installs `valkey`, injects secret)
- [ ] Re-run §5 python check, expect `OK`

### Remaining for staging/prod
- [ ] Stand up a Valkey container per env (distinct host port, e.g. staging `6380`)
- [ ] Use **Path A (private, VNet)** — do not expose publicly
- [ ] Set per-env `VALKEY_URL` secrets
