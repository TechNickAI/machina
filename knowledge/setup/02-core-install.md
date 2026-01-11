# Core Installation

## Directory Structure

```
~/machina/
├── config/         # .env with MACHINA_TOKEN
├── logs/           # Service logs (optional)
└── server/         # Gateway code (in repo)
```

## Install Steps

1. **Clone the repo** (if not already done):

```bash
git clone https://github.com/TechNickAI/machina ~/machina
```

2. **Install Bun** (if needed):

```bash
curl -fsSL https://bun.sh/install | bash
```

3. **Install dependencies**:

```bash
cd ~/machina && bun install
```

4. **Generate token**:

```bash
mkdir -p ~/machina/config
openssl rand -hex 32 > ~/machina/config/.env
# Edit to make it: MACHINA_TOKEN=<the-hex-value>
```

5. **Test the server**:

```bash
export MACHINA_TOKEN=$(cat ~/machina/config/.env | grep MACHINA_TOKEN | cut -d= -f2)
bun run server/index.ts
```

6. **Verify**: Hit `http://localhost:8080/health` - should return `{"status":"ok"}`

## First Run Permissions

On first tool call, expect **multiple macOS permission prompts**:

- Contacts access
- Messages access
- Mail access
- Calendar access
- Notes access
- Reminders access
- Full Disk Access (for message database)

**Grant all of them.** The gateway needs these to execute AppleScript.

If you miss a prompt, go to System Preferences → Privacy & Security → Automation
and grant access manually.

## WhatsApp Bridge (Optional)

Only if user wants WhatsApp support.

Clone from `lharries/whatsapp-mcp` and build the Go bridge.
Run on port 3001. The gateway can proxy WhatsApp requests to it.

(WhatsApp integration not yet implemented in gateway)

## Next Steps

1. Set up LaunchD for auto-start (see `04-launchd.md`)
2. Configure Tailscale for remote access
3. Verify everything (see `05-verification.md`)
