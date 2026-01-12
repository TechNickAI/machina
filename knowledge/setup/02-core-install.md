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

2. **Install Node.js 22+** (if needed):

```bash
brew install node@22
```

3. **Install dependencies**:

```bash
cd ~/machina && npm install
```

4. **Trigger all permissions at once** (frontloads permission dialogs):

```bash
npm run permissions
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
npm start
```

Or **background with logging**:

```bash
export MACHINA_TOKEN=$(cat ~/machina/config/.env | grep MACHINA_TOKEN | cut -d= -f2)
nohup npm start >> ~/machina/logs/gateway.log 2>&1 &
```

7. **Verify**: `curl http://localhost:9900/health` should return `{"status":"ok","version":"..."}`

## WhatsApp Bridge (Optional)

Only if user wants WhatsApp support. See `components/whatsapp.md` for full setup.

The WhatsApp service uses Baileys library and runs on port 9901. It requires one-time
QR code authentication from your phone.

## Next Steps

1. Set up LaunchD for auto-start (see `04-launchd.md`)
2. Configure Tailscale for remote access
3. Verify everything (see `05-verification.md`)
