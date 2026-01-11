# Machina Architecture

## System Overview

Machina runs on a Mac (Mini, Studio, or laptop) and exposes Mac capabilities to AI
agents via HTTPS. It orchestrates multiple component repos, each providing different
capabilities.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Your Mac                                    │
│                                                                     │
│  ~/machina/                    ~/machina/components/                │
│  ├── knowledge/ (this repo)    ├── apple-mcp/                      │
│  ├── config/                   ├── whatsapp-mcp/                   │
│  └── logs/                     └── gateway/                        │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    HTTP Gateway (port 8080)                  │   │
│  │              Hono server with token auth                     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│         ┌────────────────────┼────────────────────┐                │
│         │                    │                    │                │
│         ▼                    ▼                    ▼                │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐          │
│  │  apple-mcp  │     │  whatsapp   │     │  (future)   │          │
│  │  TypeScript │     │  Go bridge  │     │  desktop    │          │
│  │  + Bun      │     │  + Python   │     │  commander  │          │
│  └─────────────┘     └─────────────┘     └─────────────┘          │
│         │                    │                                      │
│         ▼                    ▼                                      │
│  ┌─────────────┐     ┌─────────────┐                               │
│  │ AppleScript │     │ WhatsApp    │                               │
│  │ (osascript) │     │ Web API     │                               │
│  └─────────────┘     └─────────────┘                               │
│         │                    │                                      │
│         ▼                    ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Native macOS / External Services                │   │
│  │    Messages.app   Mail.app   Calendar.app   WhatsApp Web    │   │
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

### HTTP Gateway

**Purpose**: Single entry point for all Mac capabilities with authentication.

**Technology**: Hono (TypeScript HTTP framework, works with Bun)

**Location**: `~/machina/components/gateway/`

**Key features**:

- Token authentication (Authorization: Bearer header)
- Progressive disclosure (describe action lists available operations)
- Routes requests to appropriate backend service
- Health check endpoint for monitoring

**API Pattern** (matching mcp-hubby):

```
POST /api/machina
{
  "action": "describe"  // Lists available services
}

POST /api/machina
{
  "action": "messages.send",
  "params": { "to": "+1234567890", "body": "Hello" }
}
```

### apple-mcp

**Purpose**: Access to native Apple apps via AppleScript.

**Source**: https://github.com/TechNickAI/apple-mcp (forked from supermemoryai)

**Location**: `~/machina/components/apple-mcp/`

**Capabilities**:

- Messages: Send, read, schedule iMessage
- Mail: Send, search, read emails
- Calendar: Create, search, list events
- Notes: Create, search, list notes
- Reminders: Create, list, search reminders
- Contacts: Search, lookup contacts
- Maps: Search locations, get directions

**How it works**: TypeScript calls `osascript` subprocess to execute AppleScript.
Each Apple app has a utility file in `utils/` with specific AppleScript commands.

**Maturity**: Excellent. 8,300 lines, 100+ tests, production quality.

### whatsapp-mcp

**Purpose**: WhatsApp messaging via WhatsApp Web protocol.

**Source**: https://github.com/lharries/whatsapp-mcp

**Location**: `~/machina/components/whatsapp-mcp/`

**Architecture**: Two-layer bridge

- Go bridge: Connects to WhatsApp Web, handles encryption, stores messages in SQLite
- Python MCP: Exposes tools to Claude, queries database, calls Go HTTP API

**Capabilities**:

- Send text messages
- Send media (images, video, documents)
- Send voice messages (auto-converts to Opus)
- Read message history
- Search contacts and chats

**Authentication**: QR code scan on first run, session persists ~20 days.

**Maturity**: Good. Stable, actively maintained.

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
- Gateway validates before routing

Defense in depth: Tailscale for network isolation, token for application auth.

## Service Management

### LaunchD

macOS native service manager. Each component gets a plist:

```xml
<!-- ~/Library/LaunchAgents/com.machina.gateway.plist -->
<plist>
  <dict>
    <key>Label</key>
    <string>com.machina.gateway</string>
    <key>ProgramArguments</key>
    <array>
      <string>/Users/nick/.bun/bin/bun</string>
      <string>run</string>
      <string>/Users/nick/machina/components/gateway/src/index.ts</string>
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

### Service Hierarchy

```
com.machina.gateway      (HTTP server - depends on others)
    │
    ├── com.machina.apple     (apple-mcp - standalone)
    │
    └── com.machina.whatsapp  (whatsapp Go bridge - standalone)
```

Gateway starts last, depends on backends being available.

## Data Flow Example: Send iMessage

1. Cloud AI sends request:

   ```
   POST https://mac-mini.tailnet:8080/api/machina
   Authorization: Bearer xxx
   { "action": "messages.send", "params": { "to": "Mom", "body": "Hi!" } }
   ```

2. Gateway validates token, routes to apple-mcp handler

3. apple-mcp resolves "Mom" via Contacts, gets phone number

4. apple-mcp executes AppleScript:

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
├── knowledge/              # This repo - the orchestrator
│   ├── product/
│   ├── setup/
│   ├── update/
│   └── maintenance/
│
├── components/             # Cloned repos (not in git)
│   ├── apple-mcp/
│   ├── whatsapp-mcp/
│   └── gateway/
│
├── config/
│   └── .env               # MACHINA_TOKEN (only secret needed)
│
└── logs/
    ├── gateway.log
    ├── apple.log
    └── whatsapp.log
```

## Security Model

1. **Network**: Tailscale VPN - only your devices can reach Mac
2. **Application**: Token validates each request
3. **Process**: Services run as your user, not root
4. **Permissions**: macOS grants access per-app (Messages, Mail, etc.)

**Required macOS permissions**:

- Automation: Allow terminal/Claude to control Messages, Mail, etc.
- Full Disk Access: Required for reading message databases directly
- Accessibility: If using screen automation (future)

## Future Expansion

### Desktop Commander Integration

Add terminal and filesystem access via DesktopCommanderMCP:

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
