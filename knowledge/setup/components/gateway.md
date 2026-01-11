# MCP Gateway

The MCP entry point for all Machina capabilities. Uses Streamable HTTP transport with
bearer token authentication.

## Installation

```bash
bunx machina-mcp
```

Or install globally:

```bash
bun add -g machina-mcp
```

## Configuration

Environment variables:

- `MACHINA_TOKEN` - Required. Bearer token for authentication.
- `MACHINA_PORT` - Optional. Port to listen on (default: 8080).

## Architecture

```
AI Agent (Carmenta)
    ↓ MCP over Streamable HTTP
    ↓ Bearer token auth
Machina Gateway (port 8080)
    ↓ spawns
apple-mcp (stdio) → iMessage, Mail, Calendar, Notes, Reminders, Contacts, Maps
    ↓ proxies to
WhatsApp bridge (port 3001) → WhatsApp Web
```

The gateway:

1. Accepts MCP requests over Streamable HTTP
2. Validates bearer token
3. Spawns apple-mcp as subprocess for Apple services
4. Proxies WhatsApp requests to the Go bridge on port 3001

## Endpoints

- `POST /mcp` - MCP messages (requires auth)
- `GET /mcp` - SSE notifications (requires auth)
- `DELETE /mcp` - Session termination (requires auth)
- `GET /health` - Health check (no auth)

## Security

- Bearer token via `Authorization: Bearer <token>` header
- Session isolation via `Mcp-Session-Id` header
- Bind to `0.0.0.0` for Tailscale remote access
- Tailscale provides HTTPS and network isolation

## Available Tools

All apple-mcp tools are automatically exposed:

- **messages** - Send/read iMessages, get unread
- **mail** - Send/search email, list mailboxes
- **calendar** - Create/search events
- **notes** - Create/search notes
- **reminders** - Create/search reminders
- **contacts** - Search contacts
- **maps** - Search locations, get directions

WhatsApp tools (when bridge is running):

- **whatsapp.send** - Send WhatsApp message
- **whatsapp.read** - Read recent messages
