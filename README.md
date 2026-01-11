# Machina

**AI's home on your Mac.**

Give AI agents remote access to iMessage, WhatsApp, Mail, Calendar, Notes, Reminders, and more. Installed and maintained by Claude Code - not bash scripts.

```
Cloud AI ──HTTPS──▶ Machina ──▶ Your Mac's capabilities
```

## The Problem

AI agents can think, reason, and plan - but they can't act. They can't send you an iMessage. They can't check your calendar. They can't control your Mac.

Existing solutions are fragmented: separate MCP servers for each capability, local-only access, traditional installers that break on edge cases.

## The Solution

Machina provides:

- **Unified Gateway** - One HTTPS API to all Mac capabilities
- **Remote Access** - Cloud AI agents can reach your Mac from anywhere
- **AI-Native Installation** - Claude reads the knowledge, adapts to your system, installs everything
- **Self-Maintaining** - Automated updates, health checks, auto-recovery

## Installation

Requires [Claude Code](https://claude.ai/code).

```bash
git clone https://github.com/TechNickAI/machina ~/machina
cd ~/machina && claude
```

Then say: **"Set up machina"**

Claude will:

1. Assess your system (Homebrew, permissions, macOS version)
2. Ask which capabilities you want
3. Install and configure everything
4. Test that it works
5. Set up auto-start and remote access

**That's it.** No manual steps. No debugging permission errors. Claude handles everything.

## The AI-Native Installer

This is Machina's key innovation.

Traditional installers follow deterministic steps and break on edge cases. Machina's `knowledge/` folder contains goals and verification criteria. Claude reads it, understands the goal, assesses your system, adapts, and achieves the desired state.

| Traditional Installer             | AI-Native Installer          |
| --------------------------------- | ---------------------------- |
| Assumes deterministic environment | Adapts to your actual system |
| Breaks on edge cases              | Debugs and fixes issues      |
| User googles errors               | Claude resolves errors       |
| One-size-fits-all                 | Asks what you want           |

**Why this works:**

- Claude can assess: "Is Homebrew installed? What permissions are granted?"
- Claude can adapt: "Bun not found - installing it first"
- Claude can debug: "AppleScript permission error - checking System Preferences"
- Claude can verify: "Sending test message to confirm iMessage works"
- Claude can ask: "Do you want WhatsApp? This requires QR authentication."

## Capabilities

| Capability | Source                                                   | Status |
| ---------- | -------------------------------------------------------- | ------ |
| iMessage   | [apple-mcp](https://github.com/supermemoryai/apple-mcp)  | Ready  |
| Mail       | apple-mcp                                                | Ready  |
| Calendar   | apple-mcp                                                | Ready  |
| Notes      | apple-mcp                                                | Ready  |
| Reminders  | apple-mcp                                                | Ready  |
| Contacts   | apple-mcp                                                | Ready  |
| WhatsApp   | [whatsapp-mcp](https://github.com/lharries/whatsapp-mcp) | Ready  |

Machina orchestrates these existing projects - it doesn't reinvent them.

## Architecture

```
Cloud AI (your agent)
         │
         │ HTTPS + API Key + Tailscale
         ▼
┌─────────────────────────────────────────┐
│              Machina                    │
│                                         │
│   HTTP Gateway (Hono on Bun)            │
│         │                               │
│   ┌─────┴─────┬───────────┐             │
│   ▼           ▼           ▼             │
│ apple-mcp  whatsapp    (future)         │
│             bridge                      │
│                                         │
│   AppleScript ←→ Native macOS           │
└─────────────────────────────────────────┘
```

Components are cloned to `~/machina/components/` and run as LaunchD services.

## Updates

```bash
cd ~/machina && claude
```

Say: **"Update machina"**

Or trigger remotely via the HTTP API. Machina can also self-update on a schedule.

## Requirements

- macOS (Apple Silicon or Intel)
- [Claude Code](https://claude.ai/code)
- [Tailscale](https://tailscale.com) (for remote access)
- Willingness to grant Automation permissions

## Philosophy

> The knowledge folder IS the installer.

Machina embodies a new paradigm: AI-native software. Instead of writing bash scripts that break, we write knowledge that Claude reads and executes. Claude adapts, debugs, and verifies. Humans approve and oversee.

This pattern should spread. Fork this. Learn from it. Apply it to your own projects.

## License

MIT

---

Built for [Carmenta](https://github.com/TechNickAI/carmenta) - AI that actually cares.
