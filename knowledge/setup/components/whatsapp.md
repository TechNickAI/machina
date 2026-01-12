# WhatsApp (whatsapp-mcp-ts)

WhatsApp messaging via the WhatsApp Web protocol using Baileys library.

## Source

- **Upstream library**: `TechNickAI/whatsapp-mcp-ts` (fork of jlucaso1/whatsapp-mcp-ts)
- **HTTP service**: `machina/services/whatsapp/server.ts`
- **Deployed to**: `~/machina/components/whatsapp-mcp-ts`

## Architecture

Two-layer design for efficient gateway integration:

```
┌─────────────────────────────────────────────────────────────┐
│                      Machina Gateway                        │
│                       (port 9900)                           │
└─────────────────┬───────────────────────────┬───────────────┘
                  │ SQLite queries            │ HTTP POST
                  │ (reads)                   │ (sends)
                  ▼                           ▼
┌─────────────────────────────────────────────────────────────┐
│              WhatsApp Service (server.ts)                   │
│                       (port 9901)                           │
├─────────────────────────────────────────────────────────────┤
│  Baileys (WebSocket) ◄──► WhatsApp Web servers              │
│  SQLite sync         ──► data/whatsapp.db                   │
└─────────────────────────────────────────────────────────────┘
```

**Why this design:**

- **Reads via SQLite**: Fast, no network round-trip, works even if WhatsApp connection hiccups
- **Sends via HTTP**: Requires live WebSocket connection that only the service maintains
- **Separation of concerns**: Gateway handles MCP protocol, service handles WhatsApp protocol

The service runs on **port 9901**.

## Installation

```bash
# Clone repository
cd ~/src
git clone https://github.com/TechNickAI/whatsapp-mcp-ts.git

# Create symlink in machina components
mkdir -p ~/machina/components
ln -sf ~/src/whatsapp-mcp-ts ~/machina/components/whatsapp-mcp-ts

# Install dependencies
cd ~/machina/components/whatsapp-mcp-ts
npm install

# Deploy the HTTP service wrapper from machina
cp ~/src/machina/services/whatsapp/server.ts ~/machina/components/whatsapp-mcp-ts/src/server.ts
```

## First-Time Authentication

WhatsApp requires QR code authentication:

1. Start the service manually: `cd ~/machina/components/whatsapp-mcp-ts && node src/server.ts`
2. A browser window opens with QR code
3. On phone: WhatsApp → Settings → Linked Devices → Link a Device → Scan QR
4. Service connects and starts syncing messages
5. Session saved to `auth_info_baileys/` directory

**Important**: The service must stay running for real-time message sync.

## Session Persistence

- Session stored in `auth_info_baileys/`
- Lasts approximately 20 days
- After expiration, re-scan QR code
- `/health` endpoint shows connection status

## LaunchD Service

Create `~/Library/LaunchAgents/com.machina.whatsapp.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.machina.whatsapp</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/node</string>
        <string>src/server.ts</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/YOUR_USER/machina/components/whatsapp-mcp-ts</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>WHATSAPP_PORT</key>
        <string>9901</string>
        <key>WHATSAPP_MCP_DATA_DIR</key>
        <string>/Users/YOUR_USER/machina/components/whatsapp-mcp-ts</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/YOUR_USER/machina/logs/whatsapp-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USER/machina/logs/whatsapp-stderr.log</string>
</dict>
</plist>
```

Load with: `launchctl load ~/Library/LaunchAgents/com.machina.whatsapp.plist`

## Gateway Integration

Gateway accesses WhatsApp via:

- **Reads**: Direct SQLite queries to `data/whatsapp.db`
- **Sends**: HTTP POST to `http://localhost:9901/api/send`

Available gateway operations:

- `whatsapp_status` - Check connection
- `whatsapp_chats` - List conversations
- `whatsapp_messages` - Read chat messages
- `whatsapp_search` - Search messages
- `whatsapp_contacts` - Find contacts
- `whatsapp_send` - Send messages
- `whatsapp_raw_sql` - Custom read queries

## Database Schema

SQLite at `data/whatsapp.db`:

- **chats**: `jid`, `name`, `last_message_time`
- **messages**: `id`, `chat_jid`, `sender`, `content`, `timestamp`, `is_from_me`
- **contacts**: `jid`, `name`, `notify`, `phone_number`

## Troubleshooting

### QR code not appearing

Try running in terminal: `cd ~/machina/components/whatsapp-mcp-ts && node src/server.ts`
Baileys opens a browser window for QR code.

### Session expired

Delete `auth_info_baileys/` directory and re-authenticate.

### Messages not syncing

Check daemon is running: `curl http://localhost:9901/health`
Restart if needed: `launchctl kickstart -k gui/$(id -u)/com.machina.whatsapp`

### Connection status "disconnected"

Phone may have lost internet or WhatsApp app force-closed.
Check phone, then restart daemon if needed.
