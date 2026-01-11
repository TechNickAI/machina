# Machina

> AI's home on your Mac. Remote control of iMessage, WhatsApp, Mail, Calendar, and more.

Machina is an AI-native orchestrator that gives AI agents access to Mac capabilities.
It's installed and maintained by Claude Code - not bash scripts.

## What It Does

- **Messaging**: Send and receive iMessage, WhatsApp
- **Productivity**: Access Mail, Calendar, Notes, Reminders, Contacts
- **Remote Access**: HTTPS API with authentication for cloud AI agents
- **Self-Maintaining**: Automated updates, health checks, auto-recovery

## Installation

Requires [Claude Code](https://claude.ai/code) installed.

```bash
git clone https://github.com/TechNickAI/machina ~/machina
cd ~/machina && claude
```

Then tell Claude: **"Set up machina on this machine"**

Claude will:

1. Assess your system
2. Ask which capabilities you want
3. Install and configure everything
4. Test that it works
5. Set up auto-start and remote access

## Architecture

Machina doesn't contain the MCP server code - it orchestrates setup of existing
projects:

- [apple-mcp](https://github.com/supermemoryai/apple-mcp) - iMessage, Mail, Calendar,
  Notes, Reminders, Contacts, Maps
- [whatsapp-mcp](https://github.com/lharries/whatsapp-mcp) - WhatsApp via Web bridge
- HTTP gateway for remote access (Hono + API key auth)

These are cloned to `~/machina/components/` during setup.

## Updates

```bash
cd ~/machina && claude
```

Tell Claude: **"Update machina"**

Or trigger remotely via the HTTP API.

## License

MIT
