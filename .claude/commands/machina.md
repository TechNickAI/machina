---
description: Smart setup and update for Machina - detects current state and does the right thing
---

# Machina

Smart setup and update for Machina. Detects current state and does the right thing.

## Process

### 1. Detect Current State

Check installation status:

```bash
# Check for config file (created during setup)
ls ~/machina/config/.env 2>/dev/null

# Check for LaunchD plists
ls ~/Library/LaunchAgents/com.machina.gateway.plist 2>/dev/null
ls ~/Library/LaunchAgents/com.machina.whatsapp.plist 2>/dev/null
```

- **If config file exists** → Already installed, do UPDATE
- **If config file doesn't exist** → Not installed, do SETUP

Check service health:

```bash
# Gateway health
curl -s http://localhost:9900/health

# WhatsApp service health
curl -s http://localhost:9901/health
```

### 2a. SETUP (Not Installed)

#### Step 1: Prerequisites

Verify macOS and required tools:

```bash
# Check for Node.js (v22+ required for TypeScript support)
node --version || echo "Install Node.js v22+ via nvm or brew"

# Check for tsx (TypeScript executor)
which tsx || npm install -g tsx

# Create directories
mkdir -p ~/machina/{config,components,logs}
mkdir -p ~/src
```

**Note:** The gateway uses Node.js with tsx (not Bun) because better-sqlite3 is required for Messages/WhatsApp database access, and Bun doesn't support native Node.js addons.

#### Step 2: Ask User Preferences

Ask the user:

- Which capabilities? (iMessage, WhatsApp, Notes, Reminders, Contacts)
- Remote access? (Tailscale recommended, or local only)
- Auto-start on login? (recommended)

#### Step 3: Clone Repositories

```bash
# Clone Machina (if not already in it)
cd ~/src
git clone https://github.com/your-org/machina.git 2>/dev/null || true

# Clone WhatsApp MCP (if WhatsApp selected)
git clone https://github.com/TechNickAI/whatsapp-mcp-ts.git 2>/dev/null || true

# Create symlinks
ln -sf ~/src/machina ~/machina/machina
ln -sf ~/src/whatsapp-mcp-ts ~/machina/components/whatsapp-mcp-ts
```

#### Step 4: Install Dependencies

```bash
# Machina gateway
cd ~/src/machina && npm install

# WhatsApp service (if selected)
cd ~/machina/components/whatsapp-mcp-ts && npm install
```

#### Step 5: Deploy WhatsApp Service

The upstream whatsapp-mcp-ts uses stdio MCP. We need an HTTP service wrapper.

Deploy the service from machina/services/:

```bash
# Copy the WhatsApp HTTP service wrapper
cp ~/src/machina/services/whatsapp/server.ts ~/machina/components/whatsapp-mcp-ts/src/server.ts
```

The service provides:

- `/health` - Connection status check
- `/api/send` - Send messages via POST

#### Step 6: Generate Auth Token

```bash
# Generate secure token
MACHINA_TOKEN=$(openssl rand -hex 32)
echo "MACHINA_TOKEN=$MACHINA_TOKEN" > ~/machina/config/.env
echo "Token generated: $MACHINA_TOKEN"
```

#### Step 7: WhatsApp First-Time Authentication

**IMPORTANT**: This step requires GUI access (Terminal app or VNC). QR code won't display over SSH.

```bash
cd ~/machina/components/whatsapp-mcp-ts
node src/server.ts
```

1. A browser window opens with QR code
2. On phone: WhatsApp → Settings → Linked Devices → Link a Device → Scan QR
3. Wait for "WhatsApp service running on port 9901" message
4. Ctrl+C to stop (LaunchD will manage it)

Verify authentication worked:

```bash
ls ~/machina/components/whatsapp-mcp-ts/auth_info/creds.json
```

#### Step 8: Create LaunchD Services

**Gateway plist** (`~/Library/LaunchAgents/com.machina.gateway.plist`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.machina.gateway</string>
    <key>ProgramArguments</key>
    <array>
        <string>NODE_BIN_PATH/tsx</string>
        <string>server/index.ts</string>
    </array>
    <key>WorkingDirectory</key>
    <string>USER_HOME/src/machina</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>NODE_BIN_PATH:/usr/bin:/bin</string>
        <key>MACHINA_PORT</key>
        <string>9900</string>
        <key>MACHINA_TOKEN</key>
        <string>TOKEN_VALUE</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>USER_HOME/machina/logs/gateway-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>USER_HOME/machina/logs/gateway-stderr.log</string>
</dict>
</plist>
```

**Important:** `NODE_BIN_PATH` is the directory containing node/tsx (e.g., `~/.nvm/versions/node/v24.12.0/bin`). The PATH environment variable is required because tsx needs to find the `node` binary.

**WhatsApp plist** (`~/Library/LaunchAgents/com.machina.whatsapp.plist`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.machina.whatsapp</string>
    <key>ProgramArguments</key>
    <array>
        <string>NODE_BIN_PATH/node</string>
        <string>src/server.ts</string>
    </array>
    <key>WorkingDirectory</key>
    <string>USER_HOME/machina/components/whatsapp-mcp-ts</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>WHATSAPP_PORT</key>
        <string>9901</string>
        <key>WHATSAPP_MCP_DATA_DIR</key>
        <string>USER_HOME/machina/components/whatsapp-mcp-ts</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>USER_HOME/machina/logs/whatsapp-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>USER_HOME/machina/logs/whatsapp-stderr.log</string>
</dict>
</plist>
```

Replace placeholders with actual values:

- `USER_HOME` → Your home directory (e.g., `/Users/nick`)
- `NODE_BIN_PATH` → Node.js bin directory (e.g., `/Users/nick/.nvm/versions/node/v24.12.0/bin`)
- `TOKEN_VALUE` → The generated MACHINA_TOKEN

Load services:

```bash
launchctl load ~/Library/LaunchAgents/com.machina.gateway.plist
launchctl load ~/Library/LaunchAgents/com.machina.whatsapp.plist
```

#### Step 9: Grant Full Disk Access (Required for Messages)

The Messages database (`~/Library/Messages/chat.db`) is protected by macOS. The Node.js binary needs Full Disk Access to read it.

**Check if FDA is needed:**

```bash
# Test Messages access via the gateway
curl -s -X POST 'http://localhost:9900/mcp' \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"machina","arguments":{"action":"messages_recent","params":{"limit":1}}},"id":1}'
```

If you see `"unable to open database file"`, FDA is needed.

**Grant FDA (interactive):**

Run these commands to open System Settings and copy the node path to clipboard:

```bash
# Open FDA settings
open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"

# Copy node path to clipboard (adjust path if different)
echo -n "$(dirname $(which node))/node" | pbcopy
echo "Node path copied to clipboard!"
```

Then in System Settings:

1. Click the **+** button under Full Disk Access
2. Press `Cmd+Shift+G` to open "Go to folder"
3. Press `Cmd+V` to paste the path from clipboard
4. Click "Open"

Finally, restart the gateway:

```bash
launchctl kickstart -k gui/$(id -u)/com.machina.gateway
```

**Note:** WhatsApp database access does NOT require FDA (it's stored in `~/machina/` which is user-accessible).

#### Step 10: Verify Everything Works

Run comprehensive verification:

```bash
# 1. Service health
echo "=== Service Health ==="
curl -s http://localhost:9900/health && echo ""
curl -s http://localhost:9901/health && echo ""

# 2. Gateway responds to MCP
echo -e "\n=== Gateway MCP ==="
curl -s -X POST 'http://localhost:9900/mcp' \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"machina","arguments":{"action":"system_status"}},"id":1}'

# 3. WhatsApp database (no FDA needed)
echo -e "\n\n=== WhatsApp DB ==="
curl -s -X POST 'http://localhost:9900/mcp' \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"machina","arguments":{"action":"whatsapp_status"}},"id":2}'

# 4. Messages database (FDA required)
echo -e "\n\n=== Messages DB (requires FDA) ==="
curl -s -X POST 'http://localhost:9900/mcp' \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"machina","arguments":{"action":"messages_recent","params":{"limit":1}}},"id":3}'
```

**Expected results:**

- Service health: Both return `{"status":"ok",...}`
- WhatsApp DB: Returns status (should work immediately)
- Messages DB: Returns recent message OR "unable to open database file" (needs FDA - see Step 9)

#### Step 11: Configure Tailscale Serve

Check if Tailscale serve is already configured for port 9900:

```bash
# Check current serve status
tailscale serve status 2>&1
```

**If output shows `proxy http://127.0.0.1:9900`** → Already configured, skip to Step 12.

**If output shows nothing or a different port** → Configure it:

```bash
# Enable HTTPS proxy (proxies port 443 → 9900)
tailscale serve https:443 / http://127.0.0.1:9900

# Verify it's serving
tailscale serve status
```

Get the hostname:

```bash
tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//'
```

#### Step 12: Provide MCP Configuration

Give user the MCP config for their AI client:

**For local access:**

```json
{
  "mcpServers": {
    "machina": {
      "transport": {
        "type": "streamable-http",
        "url": "http://localhost:9900/mcp",
        "headers": {
          "Authorization": "Bearer TOKEN_VALUE"
        }
      }
    }
  }
}
```

**For remote access via Tailscale:**

```json
{
  "mcpServers": {
    "machina": {
      "transport": {
        "type": "streamable-http",
        "url": "https://YOUR-MAC.tailnet.ts.net/mcp",
        "headers": {
          "Authorization": "Bearer TOKEN_VALUE"
        }
      }
    }
  }
}
```

Replace `YOUR-MAC.tailnet.ts.net` with your actual Tailscale hostname and `TOKEN_VALUE` with the generated token.

### 2b. UPDATE (Already Installed)

1. Check for updates: `cd ~/src/machina && git fetch`
2. If updates available:
   - `git pull`
   - `npm install`
   - Restart services: `launchctl kickstart -k gui/$(id -u)/com.machina.gateway`
3. Check WhatsApp updates: `cd ~/machina/components/whatsapp-mcp-ts && git pull && npm install`
4. Restart WhatsApp: `launchctl kickstart -k gui/$(id -u)/com.machina.whatsapp`
5. Verify health endpoints

## Output

### After Setup

```
Setup complete!

Installed: iMessage, WhatsApp, Notes, Reminders, Contacts
Services:
  - Gateway: Running on port 9900 (PID 12345)
  - WhatsApp: Running on port 9901 (PID 12346)
Remote: https://your-mac.tailnet.ts.net/mcp

MCP Config:
{
  "mcpServers": {
    "machina": {
      "transport": {
        "type": "streamable-http",
        "url": "https://your-mac.tailnet.ts.net/mcp",
        "headers": { "Authorization": "Bearer abc123..." }
      }
    }
  }
}

Would you like me to run verification?
```

### After Update

```
Updated Machina from v1.1.0 to v1.2.0
Updated WhatsApp MCP (3 new commits)

Services restarted. Health check:
  - Gateway: OK
  - WhatsApp: connected (Nick Sullivan)

Would you like me to run verification?
```

## Troubleshooting

### WhatsApp shows "disconnected"

Session may have expired. Re-authenticate:

```bash
launchctl unload ~/Library/LaunchAgents/com.machina.whatsapp.plist
rm -rf ~/machina/components/whatsapp-mcp-ts/auth_info
cd ~/machina/components/whatsapp-mcp-ts && node src/server.ts
# Scan QR code, then Ctrl+C
launchctl load ~/Library/LaunchAgents/com.machina.whatsapp.plist
```

### Gateway returns 401

Token mismatch. Check `~/machina/config/.env` matches the plist and your MCP config.

### Services not starting

Check logs:

```bash
tail -50 ~/machina/logs/gateway-stderr.log
tail -50 ~/machina/logs/whatsapp-stderr.log
```

### Messages returns "unable to open database file"

This means the Node.js binary doesn't have Full Disk Access. The Messages database is protected by macOS.

**Quick fix:**

```bash
# Open FDA settings and copy node path to clipboard
open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
echo -n "$(dirname $(which node))/node" | pbcopy && echo "Path copied!"
```

Then:

1. Click **+** under Full Disk Access
2. Press `Cmd+Shift+G`, then `Cmd+V` to paste
3. Click "Open"
4. Restart gateway: `launchctl kickstart -k gui/$(id -u)/com.machina.gateway`

**Note:** WhatsApp database access does NOT require FDA - if WhatsApp queries fail, it's a different issue.

### better-sqlite3 errors

If you see errors about `better-sqlite3`, the gateway may be running under Bun instead of Node.js. Bun doesn't support native Node.js addons.

Check the plist is using tsx/node:

```bash
grep -A2 ProgramArguments ~/Library/LaunchAgents/com.machina.gateway.plist
```

Should show `tsx` or `node`, NOT `bun`.

## Get MCP Configuration

When the user asks for the MCP config (e.g., "give me the MCP config", "MCP configuration URL"):

### 1. Get the token

```bash
cat ~/machina/config/.env | grep MACHINA_TOKEN | cut -d= -f2
```

### 2. Check and configure Tailscale serve

```bash
tailscale serve status 2>&1
```

**If output does NOT show `proxy http://127.0.0.1:9900`**, configure it:

```bash
tailscale serve https:443 / http://127.0.0.1:9900
```

### 3. Get Tailscale hostname

```bash
tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//'
```

### 4. Output the config

**For remote access:**

```json
{
  "mcpServers": {
    "machina": {
      "transport": {
        "type": "streamable-http",
        "url": "https://<TAILSCALE_HOSTNAME>/mcp",
        "headers": {
          "Authorization": "Bearer <TOKEN>"
        }
      }
    }
  }
}
```

**For local access:**

```json
{
  "mcpServers": {
    "machina": {
      "transport": {
        "type": "streamable-http",
        "url": "http://localhost:9900/mcp",
        "headers": {
          "Authorization": "Bearer <TOKEN>"
        }
      }
    }
  }
}
```

Replace `<TAILSCALE_HOSTNAME>` and `<TOKEN>` with actual values from the commands above.
