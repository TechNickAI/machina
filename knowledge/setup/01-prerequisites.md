# Prerequisites

Before installing machina components, verify these prerequisites are met.

## System Requirements

- macOS 12 (Monterey) or later
- Apple Silicon or Intel Mac
- Admin access (for installing packages)
- iCloud account signed in (for iMessage)

## Required Software

### Homebrew

**Verification**: `which brew` returns a path

**If not installed**:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

After install, follow the instructions to add brew to PATH.

### Bun (for apple-mcp and gateway)

**Verification**: `bun --version` returns 1.x or higher

**If not installed**:

```bash
brew install oven-sh/bun/bun
```

### Go (for whatsapp-mcp)

**Only required if user wants WhatsApp support.**

**Verification**: `go version` returns 1.21 or higher

**If not installed**:

```bash
brew install go
```

### Git

**Verification**: `git --version` returns a version

Usually pre-installed on macOS. If not:

```bash
xcode-select --install
```

## Directory Setup

Create the machina directories:

```bash
mkdir -p ~/machina/{components,config,logs}
```

## macOS Permissions

These permissions are required for full functionality. Claude should guide the user
through granting them.

### Automation Permission

Required for AppleScript to control apps (Messages, Mail, Calendar, etc.).

**How to grant**:

1. When first AppleScript runs, macOS will prompt
2. Click "OK" to allow
3. Or: System Preferences → Privacy & Security → Automation

### Full Disk Access

Required for reading message databases directly (faster than AppleScript for queries).

**How to grant**:

1. System Preferences → Privacy & Security → Full Disk Access
2. Click + and add Terminal (or Claude Desktop, or whatever runs machina)

**Verification**: After granting, test with:

```bash
ls ~/Library/Messages/chat.db
```

Should show the file, not "Operation not permitted".

### Accessibility (Future)

Only needed for screen automation features (not in MVP).

## Network Requirements

### For Local-Only Setup

No special requirements. Gateway runs on localhost:8080.

### For Remote Access (Tailscale)

**Verification**: `tailscale status` shows "Logged in"

**If not installed**:

```bash
brew install tailscale
```

Then:

1. Open Tailscale from Applications
2. Sign in with your account
3. Enable on this Mac

## Verification Checklist

Before proceeding to installation:

- [ ] `brew --version` works
- [ ] `bun --version` works
- [ ] `git --version` works
- [ ] `go version` works (if WhatsApp wanted)
- [ ] `~/machina/` directory exists
- [ ] User is signed into iCloud (for iMessage)
- [ ] Tailscale connected (if remote access wanted)

## Common Issues

### Homebrew not in PATH

After installing Homebrew on Apple Silicon, add to shell profile:

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
source ~/.zprofile
```

### Permission denied errors

If `ls ~/Library/Messages/chat.db` fails:

1. Check Full Disk Access is granted
2. Try closing and reopening Terminal
3. May need to restart Mac

### iMessage not working

Verify:

1. Signed into iCloud in System Preferences
2. Messages app is set up and can send manually
3. iMessage is enabled in Messages → Preferences → iMessage
