# Machina Setup

This folder contains procedures for Claude to bootstrap machina on a Mac.

## Goal

After setup completes, the Mac will have:

1. HTTP gateway running on port 8080
2. Token authentication configured
3. Selected services installed and running (iMessage, WhatsApp, etc.)
4. LaunchD configured for auto-start
5. All services verified working

## How to Use (for Claude)

1. Read this file to understand the setup process
2. Read `01-prerequisites.md` and verify/install prerequisites
3. Ask the user which capabilities they want
4. Read the relevant component docs in `components/`
5. Install and configure each component
6. Read `05-verification.md` and verify everything works
7. Report status to user

## Setup Sequence

```
01-prerequisites.md     → Homebrew, Bun, Go, permissions
02-core-install.md      → Clone repos, create directories
components/
  ├── apple-services.md → apple-mcp setup
  ├── whatsapp.md       → whatsapp-mcp setup
  └── gateway.md        → HTTP gateway setup
03-networking.md        → Tailscale, tokens
04-launchd.md          → Auto-start configuration
05-verification.md     → Test everything works
```

## User Preferences

Before installing, ask the user:

1. **Which capabilities?**
   - iMessage (requires apple-mcp)
   - WhatsApp (requires whatsapp-mcp + Go)
   - Mail, Calendar, Notes, Reminders (all via apple-mcp)

2. **Remote access?**
   - Tailscale (recommended)
   - Local only (development/testing)

3. **Auto-start?**
   - Yes, run on login (recommended)
   - No, manual start only

## Verification Criteria

Setup is complete when:

- [ ] `curl http://localhost:8080/health` returns 200
- [ ] `curl -H "Authorization: Bearer xxx" http://localhost:8080/api/machina -d '{"action":"describe"}'` lists services
- [ ] Test message sends successfully (if messaging enabled)
- [ ] Services restart after simulated crash
- [ ] Services start on login (if auto-start enabled)

## Troubleshooting

See `../maintenance/troubleshooting.md` for common issues.
