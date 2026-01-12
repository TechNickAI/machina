# MCP Gateway

The MCP entry point for all Machina capabilities. Uses Streamable HTTP transport with
bearer token authentication.

## Quick Start

```bash
# Install dependencies
npm install

# Set token
export MACHINA_TOKEN=<your-token>

# Run
npm start
```

## Configuration

Environment variables:

- `MACHINA_TOKEN` - Required. Bearer token for authentication.
- `MACHINA_PORT` - Optional. Port to listen on (default: 9900).
- `WHATSAPP_PORT` - Optional. Port for WhatsApp service (default: 9901).

## Architecture

The gateway directly executes AppleScript for Apple services (no external dependencies).
Messages and WhatsApp are read via SQLite for better reliability.

```
AI Agent (Carmenta)
    ↓ MCP over Streamable HTTP
    ↓ Bearer token auth
Machina Gateway (port 9900)
    ↓ executes
AppleScript → Contacts, Notes, Reminders
SQLite → Messages (chat.db), WhatsApp (whatsapp.db)
HTTP → WhatsApp service (for sending)
```

## Endpoints

- `POST /mcp` - MCP messages (requires auth)
- `GET /health` - Health check (no auth)

## Available Operations

Uses progressive disclosure pattern - single `machina` tool, operations listed via
`action='describe'`.

**Messages (5)**:

- `messages_send` - Send iMessage
- `messages_read` - Read messages from contact
- `messages_recent` - Get recent messages
- `messages_search` - Search message content
- `messages_conversations` - List conversations

**Notes (5)**:

- `notes_list` - List notes
- `notes_read` - Read note content
- `notes_create` - Create new note
- `notes_search` - Search notes

**Reminders (3)**:

- `reminders_list` - List reminders
- `reminders_create` - Create reminder
- `reminders_complete` - Mark complete

**Contacts (2)**:

- `contacts_search` - Search contacts
- `contacts_get` - Get contact details

**WhatsApp (7)**:

- `whatsapp_status` - Check connection
- `whatsapp_chats` - List conversations
- `whatsapp_messages` - Read chat messages
- `whatsapp_search` - Search messages
- `whatsapp_contacts` - Find contacts
- `whatsapp_send` - Send messages
- `whatsapp_raw_sql` - Custom read queries

**System (2)**:

- `system_status` - Gateway status
- `system_update` - Pull updates and restart

**Advanced (1)**:

- `raw_applescript` - Execute custom AppleScript

## Connecting from External AI

To connect from Carmenta or another AI agent:

1. **Tailscale**: Ensure both machines are on the same Tailscale network
2. **Tailscale serve**: Run `tailscale serve https:443 / http://127.0.0.1:9900` on the Mac
3. **URL**: `https://<tailscale-hostname>/mcp`
4. **Auth**: `Authorization: Bearer <MACHINA_TOKEN>`
5. **Headers**: `Accept: application/json, text/event-stream`

### MCP Protocol Flow

1. Initialize session:

```json
POST /mcp
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"carmenta","version":"1.0"}}}
```

2. Call tools (stateless - no session required):

```json
POST /mcp
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"machina","arguments":{"action":"describe"}}}
```

## Security

- Bearer token via `Authorization: Bearer <token>` header
- Bind to `0.0.0.0` for Tailscale remote access
- Tailscale provides encrypted network layer
- Read-only SQLite access for message databases
- SQL injection prevention with LIKE escaping

## Permissions Required

On first tool call, macOS will prompt for permissions:

- Automation access for each Apple app
- Full Disk Access for reading Messages database

Grant all permissions when prompted. See `01-prerequisites.md` for details.

## Adding New Operations

1. Add operation to `operations` object in `handleMachina`
2. Add Zod schema for parameters
3. Implement handler function
4. Add to `describe` output
