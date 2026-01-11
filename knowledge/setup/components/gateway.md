# MCP Gateway

The MCP entry point for all Machina capabilities. Uses Streamable HTTP transport with
bearer token authentication.

## Quick Start

```bash
# Install dependencies
bun install

# Set token
export MACHINA_TOKEN=<your-token>

# Run
bun run server/index.ts
```

## Configuration

Environment variables:

- `MACHINA_TOKEN` - Required. Bearer token for authentication.
- `MACHINA_PORT` - Optional. Port to listen on (default: 8080).

## Architecture

The gateway directly executes AppleScript for Apple services (no dependency on apple-mcp).
Messages are read via SQLite for better reliability.

```
AI Agent (Carmenta)
    ↓ MCP over Streamable HTTP
    ↓ Bearer token auth
Machina Gateway (port 8080)
    ↓ executes
AppleScript → Contacts, Mail, Calendar, Notes, Reminders
SQLite → Messages (chat.db)
```

## Endpoints

- `POST /mcp` - MCP messages (requires auth)
- `GET /mcp` - SSE notifications (requires auth)
- `DELETE /mcp` - Session termination (requires auth)
- `GET /health` - Health check (no auth)

## Available Tools

- **contacts_search** - Search contacts by name
- **messages_unread** - Get recent iMessages
- **messages_send** - Send iMessage
- **messages_read** - Read messages from specific contact
- **calendar_list** - List upcoming calendar events
- **notes_list** - List recent notes
- **reminders_list** - List reminders

## Connecting from External AI

To connect from Carmenta or another AI agent:

1. **Tailscale**: Ensure both machines are on the same Tailscale network
2. **URL**: `http://<tailscale-hostname>:8080/mcp`
3. **Auth**: `Authorization: Bearer <MACHINA_TOKEN>`
4. **Headers**: `Accept: application/json, text/event-stream`

### MCP Protocol Flow

1. Initialize session:

```json
POST /mcp
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"carmenta","version":"1.0"}}}
```

2. Capture session ID from response header: `mcp-session-id`

3. Call tools with session ID:

```json
POST /mcp
mcp-session-id: <session-id>
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"messages_unread","arguments":{"limit":5}}}
```

## Security

- Bearer token via `Authorization: Bearer <token>` header
- Session isolation via `Mcp-Session-Id` header
- Bind to `0.0.0.0` for Tailscale remote access
- Tailscale provides encrypted network layer

## Permissions Required

On first tool call, macOS will prompt for permissions:

- Automation access for each Apple app
- Full Disk Access for reading Messages database

Grant all permissions when prompted. See `01-prerequisites.md` for details.

## Adding New Tools

1. Add tool definition to `tools` array
2. Add case in `handleTool` switch
3. Implement via AppleScript or direct system access
