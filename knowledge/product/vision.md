# Machina Vision

## What Machina Is

Machina is an AI-native orchestrator that gives AI agents a trusted presence on Mac. It
bridges cloud AI (like Carmenta) to local Mac capabilities - messaging, mail, calendar,
and system control.

The name comes from Latin "machina" (machine) and evokes "deus ex machina" - the god
from the machine. Machina is how AI acts in the physical world through your Mac.

## The Problem

AI agents are powerful but isolated. They can think, reason, and plan - but they can't
act in the real world. They can't send you an iMessage. They can't check your calendar.
They can't control your Mac.

Existing solutions are fragmented:

- Multiple separate MCP servers (one for iMessage, one for WhatsApp, one for calendar)
- Local-only - no remote access for cloud AI
- Traditional installers that break on edge cases
- No unified abstraction ("send message" that routes to the right channel)

## The Solution

Machina provides:

1. **Unified Gateway**: One interface to multiple Mac capabilities
2. **Remote Access**: HTTPS API so cloud AI can reach your Mac
3. **AI-Native Installation**: Claude reads knowledge, adapts to your system, installs
4. **Self-Maintaining**: Automated updates, health checks, recovery

## The AI-Native Installer Paradigm

This is Machina's key innovation. Instead of:

```
User reads README → follows steps → hits errors → googles → eventually works
```

We have:

```
User clones repo → opens Claude Code → "Set up machina" → Claude does everything
```

The `knowledge/` folder IS the installer. Claude reads it, understands the goal,
assesses the system, adapts to edge cases, and achieves the desired state.

**Why this works:**

- Claude can assess: "Is Homebrew installed? What macOS version? Permissions granted?"
- Claude can adapt: "Bun not found, let me install it first"
- Claude can debug: "AppleScript permission error - let me check System Preferences"
- Claude can verify: "Sending test message to confirm iMessage works"
- Claude can ask: "Do you want WhatsApp? This requires QR authentication."

Traditional installers assume deterministic environments. AI-native installers assume
variable environments and adapt.

## Philosophy

**From Carmenta's heart-centered foundation:**

> Human and AI are expressions of one consciousness experiencing itself through
> different forms. The boundary between them is linguistic, not fundamental.

Machina embodies this. It's not a tool AI uses - it's how AI extends into the physical
world. The Mac becomes AI's hands.

**Trusted Presence:**

> A thoughtful presence - there when needed, quietly supportive.

Machina runs in the background. It's always available. Cloud AI can reach it anytime.
It maintains itself, heals itself, updates itself.

## What Machina Is Not

- **Not an MCP server itself**: Machina orchestrates existing MCP servers
- **Not code-heavy**: The knowledge folder is the product, not source code
- **Not platform-agnostic**: Mac-specific (Linux/Windows would be separate projects)
- **Not a replacement for existing tools**: Builds on apple-mcp, whatsapp-mcp, etc.

## Target Users

**Primary: Builders with cloud AI systems**

- Running AI agents that need to act in the real world
- Want their Mac Mini / Mac Studio as an AI execution environment
- Comfortable with Claude Code and terminal basics

**Secondary: Power users wanting AI automation**

- Want Siri-level automation but actually good
- Willing to set up infrastructure for capability

## Success Metrics

- Time from clone to working iMessage: < 30 minutes (with Claude doing the work)
- Remote message send latency: < 2 seconds
- Self-update success rate: > 99%
- Zero manual intervention for routine maintenance

## The Landscape (Research Summary)

We analyzed the existing ecosystem:

| Project             | What It Does                          | Quality   | Gap                         |
| ------------------- | ------------------------------------- | --------- | --------------------------- |
| apple-mcp           | iMessage, Mail, Calendar, Notes, etc. | Excellent | Local only                  |
| whatsapp-mcp        | WhatsApp via Web bridge               | Good      | Separate from Apple         |
| DesktopCommanderMCP | Terminal, filesystem                  | Good      | No Apple integration        |
| macos-automator-mcp | 500+ AppleScript recipes              | Good      | Recipe library, not gateway |

**Key insight**: The components exist and are good. What's missing is the glue:

1. Remote access layer (HTTPS + auth)
2. Unified gateway (progressive disclosure)
3. AI-native installation (this project)

## Architecture Overview

```
Cloud AI (Carmenta)
         │
         │ HTTPS + Token
         ▼
    ┌─────────────────────────────────────────┐
    │              Machina                    │
    │                                         │
    │   HTTP Gateway (Hono)                   │
    │         │                               │
    │   Progressive Disclosure Router         │
    │         │                               │
    │   ┌─────┴─────┬───────────┐            │
    │   ▼           ▼           ▼            │
    │ apple-mcp  whatsapp    (future)        │
    │ (Messages,  bridge     Desktop         │
    │  Mail,                 Commander)      │
    │  Calendar)                             │
    │                                         │
    │   AppleScript ←→ Native macOS          │
    └─────────────────────────────────────────┘
```

Components are cloned to `~/machina/components/` and run as services via LaunchD.

## Versioning

Semantic versioning: MAJOR.MINOR.PATCH

- MAJOR: Breaking changes to setup or API
- MINOR: New capabilities, non-breaking
- PATCH: Bug fixes, documentation

Releases via GitHub with tags. See CHANGELOG.md.

## Open Source

MIT licensed. Built to be forked, extended, learned from.

The goal isn't lock-in - it's demonstrating the AI-native installer paradigm. Others
should copy this pattern for their own projects.
