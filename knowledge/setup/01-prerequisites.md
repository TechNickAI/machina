# Prerequisites

Before installing machina, verify these requirements are met.

## System Requirements

- macOS 12 (Monterey) or later
- Apple Silicon or Intel Mac
- Admin access for installing packages
- iCloud account signed in (for iMessage)

## Required Software

### Always Required

- **Homebrew** - Package manager
- **Bun** - JavaScript runtime (for apple-mcp and gateway)
- **Git** - Version control

### For WhatsApp Support

- **Go** - For building the WhatsApp bridge
- **Python 3** - For WhatsApp MCP layer
- **ffmpeg** - For WhatsApp media (images, video, voice)

## macOS Permissions

### Automation Permission

Required for AppleScript to control apps (Messages, Mail, Calendar, Contacts, Notes, Reminders).

**Expect multiple permission popups** on first run - one for each app. Grant all of them.
Configure in System Preferences → Privacy & Security → Automation.

Apps that need automation access:

- Contacts
- Messages
- Mail
- Calendar
- Notes
- Reminders

### Full Disk Access

Required for reading message databases directly (faster than AppleScript for queries).

Configure in System Preferences → Privacy & Security → Full Disk Access. Add Terminal
or whatever app runs machina.

Verify by checking if `~/Library/Messages/chat.db` is readable.

## Network Requirements

### For Local-Only Setup

No special requirements. Gateway runs on localhost:8080.

### For Remote Access

**Tailscale** must be installed and connected. This provides secure remote access
without exposing the Mac to the public internet.

## Verification

Before proceeding:

- All required software is installed and runnable
- `~/machina/` directories exist (components, config, logs)
- User is signed into iCloud (for iMessage)
- Tailscale connected (if remote access wanted)
- Full Disk Access granted (verify by reading chat.db)

## Common Issues

### Homebrew not in PATH

On Apple Silicon, Homebrew installs to `/opt/homebrew`. May need to add to shell profile.

### Permission denied for chat.db

Full Disk Access not granted, or Terminal needs restart after granting.

### iMessage not working

Verify signed into iCloud and iMessage is enabled in Messages preferences.
