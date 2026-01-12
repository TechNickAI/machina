# Machina Architecture

## System Overview

Machina runs on a Mac and exposes Mac capabilities to AI agents via MCP over HTTPS.
It's a single Node.js process with optional WhatsApp service.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Your Mac                                    │
│                                                                     │
│  ~/machina/                                                         │
│  ├── server/         # MCP Gateway (Express + MCP SDK)              │
│  ├── services/       # WhatsApp HTTP wrapper                        │
│  ├── knowledge/      # This documentation                           │
│  └── config/         # Token and environment                        │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                Machina Gateway (port 9900)                   │   │
│  │              Express + MCP SDK + Bearer auth                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│         ┌────────────────────┼────────────────────┐                │
│         │                    │                    │                │
│         ▼                    ▼                    ▼                │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐          │
│  │ AppleScript │     │   SQLite    │     │  WhatsApp   │          │
│  │ (osascript) │     │  chat.db    │     │   :9901     │          │
│  │             │     │             │     │  (optional) │          │
│  └─────────────┘     └─────────────┘     └─────────────┘          │
│         │                    │                    │                │
│         ▼                    ▼                    ▼                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Native macOS / External Services                │   │
│  │    Notes   Reminders   Contacts   Messages   WhatsApp Web   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS via Tailscale
                              ▼
                     ┌─────────────────┐
                     │   Cloud AI      │
                     │   (Carmenta)    │
                     └─────────────────┘
```

## Component Details

### MCP Gateway (server/index.ts)

**Purpose**: Single entry point for all Mac capabilities with MCP protocol support.

**Technology**: Express 5 + @modelcontextprotocol/sdk + better-sqlite3 + tsx

**Location**: `~/machina/server/index.ts`

**Key features**:

- Bearer token authentication (Authorization header)
- Progressive disclosure (single `machina` tool, operations via describe)
- Direct AppleScript execution (no external dependencies)
- Direct SQLite for Messages (faster than AppleScript)
- Stateless MCP over HTTP with JSON responses

**Operations** (31 total):

- Messages: send, read, recent, search, conversations
- Notes: list, read, create, search
- Reminders: list, create, complete
- Contacts: search, get
- WhatsApp: send, chats, messages, search, contacts, status, raw_sql
- System: update (auto-restart), status
- Advanced: raw_applescript (escape hatch)

### WhatsApp Service (services/whatsapp/)

**Purpose**: Bridge to WhatsApp Web via Baileys library.

**Location**: `~/machina/services/whatsapp/server.ts`

**Architecture**:

- Baileys maintains WebSocket connection to WhatsApp servers
- Messages synced to local SQLite database
- HTTP API on port 9901 for sending messages
- Gateway reads SQLite directly for queries (faster)

**Why this design**:

- Reads via SQLite: No network round-trip, works even if connection hiccups
- Sends via HTTP: Requires live WebSocket that only the service maintains
- Separation of concerns: Gateway handles MCP, service handles WhatsApp protocol

## Networking

### Tailscale (Recommended)

Tailscale provides zero-config VPN between your devices:

1. Mac joins Tailscale network
2. Gets address like `100.x.x.x` or `mac-mini.tailnet`
3. Cloud AI connects via Tailscale
4. All traffic encrypted

**Benefits**:

- No port forwarding needed
- No public IP exposure
- Handles NAT traversal
- Free for personal use

### Token Authentication

Even with Tailscale, we add token auth:

- Token stored in `~/machina/config/.env` as `MACHINA_TOKEN`
- Passed via `Authorization: Bearer` header
- Gateway validates before processing

Defense in depth: Tailscale for network isolation, token for application auth.

## Service Management

### LaunchD

macOS native service manager. Each service gets a plist:

```xml
<!-- ~/Library/LaunchAgents/com.machina.gateway.plist -->
<plist>
  <dict>
    <key>Label</key>
    <string>com.machina.gateway</string>
    <key>ProgramArguments</key>
    <array>
      <string>/usr/local/bin/node</string>
      <string>/Users/nick/machina/node_modules/.bin/tsx</string>
      <string>/Users/nick/machina/server/index.ts</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/nick/machina/logs/gateway.log</string>
  </dict>
</plist>
```

**Key settings**:

- `RunAtLoad`: Start on login
- `KeepAlive`: Restart if crashes
- Logs to `~/machina/logs/`

## Data Flow Example: Send iMessage

1. Cloud AI sends MCP request:

   ```json
   { "action": "messages_send", "params": { "to": "Mom", "body": "Hi!" } }
   ```

2. Gateway validates token, routes to messages_send handler

3. Handler resolves "Mom" via Contacts AppleScript

4. Handler executes AppleScript:

   ```applescript
   tell application "Messages"
     set targetService to 1st service whose service type = iMessage
     set targetBuddy to buddy "+1234567890" of targetService
     send "Hi!" to targetBuddy
   end tell
   ```

5. Message sends via Messages.app

6. Gateway returns success to cloud AI

## Directory Structure

```
~/machina/
├── server/                # MCP Gateway code
│   ├── index.ts          # Main server (Express + MCP)
│   └── trigger-permissions.ts
│
├── services/             # Optional services
│   └── whatsapp/         # WhatsApp HTTP wrapper
│
├── knowledge/            # This documentation
│   ├── product/
│   ├── setup/
│   ├── update/
│   └── maintenance/
│
├── config/
│   └── .env              # MACHINA_TOKEN
│
└── logs/
    ├── gateway.log
    └── whatsapp.log
```

## Security Model

1. **Network**: Tailscale VPN - only your devices can reach Mac
2. **Application**: Token validates each request
3. **Process**: Services run as your user, not root
4. **Permissions**: macOS grants access per-app (Messages, Notes, etc.)
5. **Read-only databases**: SQLite access is read-only where possible
6. **SQL injection prevention**: LIKE escaping, parameterized queries

**Required macOS permissions**:

- Automation: Allow terminal/Claude to control Messages, Notes, etc.
- Full Disk Access: Required for reading message databases directly

## Future Expansion

### Desktop Commander Integration

Add terminal and filesystem access:

- Execute shell commands
- Read/write files
- Manage processes

### Browser Automation

Add Playwright-based browser control:

- Navigate to URLs
- Fill forms
- Extract data
- Take screenshots

### Multi-Mac

Orchestrate multiple Macs from single control plane:

- Mac Mini A: Personal messaging
- Mac Studio B: Development environment
- Cloud AI routes to appropriate machine
