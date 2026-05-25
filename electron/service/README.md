# Fideon Backend — System Service (FNF-425 / 426 / 427 / 428)

Runs the FastAPI backend as an OS-managed service so it starts on boot and
restarts automatically after a crash.

---

## Windows — WinSW (FNF-425)

**File:** `windows/fideon-backend.xml`

1. Download [WinSW v3](https://github.com/winsw/winsw/releases) — rename to `winsw.exe`,
   place it alongside `fideon-backend.xml`.
2. Open **elevated PowerShell** in `electron/service/windows/`:

```powershell
.\winsw.exe install
.\winsw.exe start
.\winsw.exe status      # should show "Started"
Get-Service fideon-backend
```

Uninstall:
```powershell
.\winsw.exe stop
.\winsw.exe uninstall
```

Crash recovery (FNF-428): restarts immediately on first crash, after 5 s on the
second, after 30 s on subsequent failures. Resets the failure counter after 1 hour
of clean uptime.

---

## macOS — launchd (FNF-426)

**File:** `macos/com.fideon.backend.plist`

```bash
cp com.fideon.backend.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.fideon.backend.plist
launchctl print gui/$(id -u)/com.fideon.backend   # verify
```

Uninstall:
```bash
launchctl bootout gui/$(id -u)/com.fideon.backend
rm ~/Library/LaunchAgents/com.fideon.backend.plist
```

Crash recovery (FNF-428): `KeepAlive.SuccessfulExit = false` tells launchd to
restart on any non-zero exit. `ThrottleInterval = 5` enforces a 5 s delay between
restarts so a tight crash loop doesn't spin the CPU.

Logs: `/tmp/com.fideon.backend.stdout.log` and `.stderr.log`

---

## Linux — systemd (FNF-427)

**File:** `linux/fideon-backend.service`

```bash
mkdir -p ~/.config/systemd/user
cp fideon-backend.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable fideon-backend
systemctl --user start fideon-backend
systemctl --user status fideon-backend    # verify
journalctl --user -u fideon-backend -f   # live logs
```

Uninstall:
```bash
systemctl --user stop fideon-backend
systemctl --user disable fideon-backend
rm ~/.config/systemd/user/fideon-backend.service
systemctl --user daemon-reload
```

Crash recovery (FNF-428): `Restart=on-failure` with `RestartSec=5s`. Gives up
after 3 failures within 60 s (`StartLimitBurst=3`) to avoid infinite restart loops
on hard misconfiguration.

---

## Path variables to update before deploying

| File | Variable | Default (update to match your install) |
|------|----------|----------------------------------------|
| `windows/fideon-backend.xml` | `<executable>` | `C:\Users\HP\AppData\Local\Programs\FideonOS\venv\Scripts\python.exe` |
| `windows/fideon-backend.xml` | `<workingdirectory>` | `C:\Users\HP\AppData\Local\Programs\FideonOS\backend` |
| `macos/com.fideon.backend.plist` | `ProgramArguments[0]` | `/Applications/FideonOS.app/Contents/Resources/venv/bin/python` |
| `macos/com.fideon.backend.plist` | `WorkingDirectory` | `/Applications/FideonOS.app/Contents/Resources/backend` |
| `linux/fideon-backend.service` | `ExecStart` | `/opt/fideon/venv/bin/python` |
| `linux/fideon-backend.service` | `WorkingDirectory` | `/opt/fideon/backend` |

These paths are also read by `electron/main.cjs` IPC handlers (`service:install`,
`service:uninstall`, `service:status`) so the app can trigger install from the
Settings → Device Setup page.
