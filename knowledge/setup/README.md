# Machina Setup

This folder contains knowledge for Claude to bootstrap machina on a Mac.

## Goal

After setup completes:

1. HTTP gateway running on port 8080
2. Token authentication configured
3. Selected services installed (iMessage, WhatsApp, etc.)
4. LaunchD configured for auto-start
5. All services verified working

## Process

1. Read prerequisites, verify/install what's missing
2. Ask user which capabilities they want
3. Install components based on selection
4. Create and configure gateway
5. Set up LaunchD services
6. Verify everything works
7. Report status and provide access details

## User Preferences to Ask

**Capabilities:**

- iMessage (direct SQLite + AppleScript)
- Notes (AppleScript)
- Reminders (AppleScript)
- Contacts (AppleScript)
- WhatsApp (requires whatsapp-mcp bridge, planned)

**Remote access:**

- Tailscale (recommended)
- Local only

**Auto-start:**

- Run on login (recommended)
- Manual start only

## Success Criteria

- Health endpoint returns OK
- API with token returns service list
- Test message sends successfully
- Services restart after crash
- Services start on login

## Files

```
01-prerequisites.md  → Required software and permissions
02-core-install.md   → Clone repos, create directories
03-tailscale.md      → Remote access via Tailscale
components/
  ├── gateway.md        → MCP gateway implementation
  └── whatsapp.md       → whatsapp-mcp bridge (planned)
04-launchd.md        → Auto-start configuration
05-verification.md   → Test everything, get MCP config
```

## Troubleshooting

See `../maintenance/troubleshooting.md`.
