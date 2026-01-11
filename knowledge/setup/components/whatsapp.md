# WhatsApp (whatsapp-mcp)

WhatsApp messaging via the WhatsApp Web protocol.

## Source

Repository: `lharries/whatsapp-mcp`
Location: `~/machina/components/whatsapp-mcp`

## Architecture

Two-layer bridge:

1. **Go bridge**: Connects to WhatsApp Web, handles E2E encryption, stores messages
2. **Python MCP**: Query interface, calls Go bridge HTTP API

The Go bridge runs on **port 3001** (not 8080, to avoid collision with gateway).

## Installation

1. Clone the repo
2. Build the Go bridge in `whatsapp-bridge/` subdirectory
3. Install Python dependencies

## First-Time Authentication

WhatsApp requires QR code authentication:

1. Start the Go bridge with `--port 3001`
2. QR code appears in terminal
3. On phone: WhatsApp → Settings → Linked Devices → Link a Device → Scan QR
4. Bridge connects and starts receiving messages
5. Session saved to `store/` directory

**Important**: The Go bridge must stay running. If it stops, messages won't sync.

## Session Persistence

- Session stored in `whatsapp-bridge/store/`
- Lasts approximately 20 days
- After expiration, re-scan QR code
- Health check should warn when session expires soon

## Integration

Gateway calls WhatsApp via HTTP to the Go bridge on port 3001.

## Media Support

Supports images, videos, documents, and voice messages. Voice conversion requires ffmpeg.

## Troubleshooting

### QR code not appearing

Go bridge not running or terminal doesn't support Unicode.

### Session expired

Delete the `store/` directory and re-authenticate with new QR code.

### Messages not sending

Check phone number format: `+[country][number]` (e.g., +14155551234).
Verify Go bridge is running and recipient has WhatsApp.

### Connection closed

Phone may have lost internet, WhatsApp app force-closed, or session expired.
Restart Go bridge. Re-scan QR if needed.
