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

4. **Trigger all permissions at once** (frontloads permission dialogs):

```bash
bun run server/trigger-permissions.ts
```

This will trigger permission prompts for:

- Contacts
- Messages (Full Disk Access for chat.db)
- Notes
- Reminders

**Grant all of them.** Approve each dialog as it appears.

If you miss any:

- System Preferences → Privacy & Security → Automation (for AppleScript)
- System Preferences → Privacy & Security → Full Disk Access (for Messages)

5. **Generate token and create directories**:

```bash
mkdir -p ~/machina/config ~/machina/logs
TOKEN=$(openssl rand -hex 32)
echo "MACHINA_TOKEN=$TOKEN" > ~/machina/config/.env
echo "Token: $TOKEN"
```

6. **Start the server** (foreground for testing):

```bash
export MACHINA_TOKEN=$(cat ~/machina/config/.env | grep MACHINA_TOKEN | cut -d= -f2)
bun run server/index.ts
```

Or **background with logging**:

```bash
export MACHINA_TOKEN=$(cat ~/machina/config/.env | grep MACHINA_TOKEN | cut -d= -f2)
nohup bun run server/index.ts >> ~/machina/logs/gateway.log 2>&1 &
```

7. **Verify**: `curl http://localhost:8080/health` should return `{"status":"ok","version":"1.0.0"}`

## WhatsApp Bridge (Optional)

Only if user wants WhatsApp support.

Clone from `lharries/whatsapp-mcp` and build the Go bridge.
Run on port 3001. The gateway can proxy WhatsApp requests to it.

(WhatsApp integration not yet implemented in gateway)

## Next Steps

1. Set up LaunchD for auto-start (see `04-launchd.md`)
2. Configure Tailscale for remote access
3. Verify everything (see `05-verification.md`)
