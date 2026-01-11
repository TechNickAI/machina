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

# WhatsApp daemon health
curl -s http://localhost:9901/health
```

### 2a. SETUP (Not Installed)

#### Step 1: Prerequisites

Verify macOS and required tools:

```bash
# Check for Bun
which bun || curl -fsSL https://bun.sh/install | bash

# Check for Node (needed for WhatsApp daemon)
which node || echo "Install Node.js via nvm or brew"

# Create directories
mkdir -p ~/machina/{config,components,logs}
mkdir -p ~/src
```

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
git clone https://github.com/jlucaso1/whatsapp-mcp-ts.git 2>/dev/null || true

# Create symlinks
ln -sf ~/src/machina ~/machina/machina
ln -sf ~/src/whatsapp-mcp-ts ~/machina/components/whatsapp-mcp-ts
```

#### Step 4: Install Dependencies

```bash
# Machina gateway
cd ~/src/machina && bun install

# WhatsApp daemon (if selected)
cd ~/machina/components/whatsapp-mcp-ts && npm install
```

#### Step 5: Create WhatsApp Daemon

The upstream whatsapp-mcp-ts uses stdio MCP. We need a daemon with HTTP API.

Create `~/machina/components/whatsapp-mcp-ts/src/daemon.ts`:

```typescript
/**
 * WhatsApp Daemon Mode
 *
 * Runs WhatsApp connection as a background service with HTTP API.
 * - Maintains WhatsApp connection
 * - Syncs messages to SQLite
 * - Exposes HTTP API on port 9901 for sends
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { pino } from "pino";
import { initializeDatabase } from "./database.ts";
import {
  startWhatsAppConnection,
  sendWhatsAppMessage,
  type WhatsAppSocket,
} from "./whatsapp.ts";

const PORT = parseInt(process.env.WHATSAPP_PORT || "9901", 10);
const dataDir = process.env.WHATSAPP_MCP_DATA_DIR || ".";

const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination(`${dataDir}/whatsapp-daemon.log`),
);

let whatsappSocket: WhatsAppSocket | null = null;

async function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: any) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || "/";
  const method = req.method || "GET";

  if (url === "/health" && method === "GET") {
    const connected = whatsappSocket?.user != null;
    sendJson(res, connected ? 200 : 503, {
      status: connected ? "connected" : "disconnected",
      user: whatsappSocket?.user?.name || null,
    });
    return;
  }

  if (url === "/api/send" && method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const { recipient, message } = body;

      if (!recipient || !message) {
        sendJson(res, 400, {
          success: false,
          error: "Missing recipient or message",
        });
        return;
      }

      if (!whatsappSocket || !whatsappSocket.user) {
        sendJson(res, 503, { success: false, error: "WhatsApp not connected" });
        return;
      }

      const result = await sendWhatsAppMessage(
        logger,
        whatsappSocket,
        recipient,
        message,
      );

      if (result && result.key?.id) {
        sendJson(res, 200, {
          success: true,
          message_id: result.key.id,
          recipient,
        });
      } else {
        sendJson(res, 500, { success: false, error: "Failed to send message" });
      }
    } catch (error: any) {
      logger.error({ err: error }, "Error handling /api/send");
      sendJson(res, 500, { success: false, error: error.message });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

async function main() {
  logger.info("Starting WhatsApp Daemon...");
  try {
    initializeDatabase();
    whatsappSocket = await startWhatsAppConnection(logger);
  } catch (error: any) {
    logger.fatal({ err: error }, "Failed to initialize");
    process.exit(1);
  }

  const server = createServer(handleRequest);
  server.listen(PORT, () => {
    logger.info(`HTTP API listening on port ${PORT}`);
    console.log(`WhatsApp daemon running on port ${PORT}`);
  });
}

process.on("SIGINT", () => {
  process.exit(0);
});
process.on("SIGTERM", () => {
  process.exit(0);
});

main().catch((error) => {
  logger.fatal({ err: error }, "Unhandled error");
  process.exit(1);
});
```

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
node src/daemon.ts
```

1. A browser window opens with QR code
2. On phone: WhatsApp → Settings → Linked Devices → Link a Device → Scan QR
3. Wait for "WhatsApp daemon running on port 9901" message
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
        <string>NODE_PATH/bun</string>
        <string>run</string>
        <string>server/index.ts</string>
    </array>
    <key>WorkingDirectory</key>
    <string>USER_HOME/src/machina</string>
    <key>EnvironmentVariables</key>
    <dict>
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
        <string>NODE_PATH/node</string>
        <string>src/daemon.ts</string>
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

Replace `USER_HOME`, `NODE_PATH`, and `TOKEN_VALUE` with actual values.

Load services:

```bash
launchctl load ~/Library/LaunchAgents/com.machina.gateway.plist
launchctl load ~/Library/LaunchAgents/com.machina.whatsapp.plist
```

#### Step 9: Verify Everything Works

```bash
# Gateway health
curl -s http://localhost:9900/health

# WhatsApp health
curl -s http://localhost:9901/health

# Test gateway operation
curl -s -X POST http://localhost:9900/mcp \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"machina","arguments":{"action":"describe"}},"id":1}'
```

#### Step 10: Provide MCP Configuration

Give user the MCP config for their AI client:

```json
{
  "mcpServers": {
    "machina": {
      "url": "http://localhost:9900/mcp",
      "headers": {
        "Authorization": "Bearer TOKEN_VALUE"
      }
    }
  }
}
```

For remote access via Tailscale, replace `localhost:9900` with `your-mac.tailnet.ts.net:9900`.

### 2b. UPDATE (Already Installed)

1. Check for updates: `cd ~/src/machina && git fetch`
2. If updates available:
   - `git pull`
   - `bun install`
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
Remote: https://your-mac.tailnet.ts.net/

MCP Config:
{
  "mcpServers": {
    "machina": {
      "url": "http://localhost:9900/mcp",
      "headers": { "Authorization": "Bearer abc123..." }
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
cd ~/machina/components/whatsapp-mcp-ts && node src/daemon.ts
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

## Get MCP Configuration

When the user asks for the MCP config (e.g., "give me the MCP config", "MCP configuration URL"):

### 1. Get the token

```bash
cat ~/machina/config/.env | grep MACHINA_TOKEN | cut -d= -f2
```

### 2. Check if Tailscale is serving

```bash
tailscale serve status 2>/dev/null
```

- If output shows port 9900 being served → Use Tailscale URL
- If error or not serving → Use localhost

### 3. Get Tailscale hostname (if serving)

```bash
tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//'
```

### 4. Output the config

**If Tailscale is serving:**

```json
{
  "mcpServers": {
    "machina": {
      "url": "https://<TAILSCALE_HOSTNAME>/mcp",
      "headers": {
        "Authorization": "Bearer <TOKEN>"
      }
    }
  }
}
```

**If local only:**

```json
{
  "mcpServers": {
    "machina": {
      "url": "http://localhost:9900/mcp",
      "headers": {
        "Authorization": "Bearer <TOKEN>"
      }
    }
  }
}
```

Replace `<TAILSCALE_HOSTNAME>` and `<TOKEN>` with actual values from the commands above.
