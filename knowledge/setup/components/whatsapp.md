# WhatsApp Setup (whatsapp-mcp)

This component provides WhatsApp messaging via the WhatsApp Web protocol.

## Source

Repository: https://github.com/lharries/whatsapp-mcp
Location: `~/machina/components/whatsapp-mcp`

## Architecture

Two-layer bridge:

1. **Go bridge**: Connects to WhatsApp Web, handles E2E encryption, stores messages
2. **Python MCP**: Query interface, calls Go bridge HTTP API

```
Gateway → Python MCP → HTTP (localhost:3001) → Go Bridge → WhatsApp Web
                              ↓
                        SQLite (messages.db)
```

**Note**: WhatsApp bridge runs on port 3001 to avoid collision with gateway (port 8080).

## Installation

### Go Bridge

```bash
cd ~/machina/components/whatsapp-mcp/whatsapp-bridge
go build -o whatsapp-bridge
```

**Verification**: `./whatsapp-bridge --help` runs without error

### Python Dependencies

```bash
cd ~/machina/components/whatsapp-mcp
pip install -e .
```

Or with uv:

```bash
uv pip install -e .
```

## First-Time Authentication

WhatsApp requires QR code authentication:

1. Start the Go bridge:

   ```bash
   cd ~/machina/components/whatsapp-mcp/whatsapp-bridge
   ./whatsapp-bridge --port 3001
   ```

2. QR code appears in terminal

3. On your phone:
   - Open WhatsApp
   - Go to Settings → Linked Devices
   - Tap "Link a Device"
   - Scan the QR code

4. Bridge connects and starts receiving messages

5. Session saved to `store/whatsapp.db` (persists ~20 days)

**Important**: Keep the Go bridge running. If it stops, messages won't sync.

## Session Persistence

- Session stored in `~/machina/components/whatsapp-mcp/whatsapp-bridge/store/`
- Lasts approximately 20 days
- After expiration, re-scan QR code
- Machina health check will warn when session expires soon

## Testing

### Send Test Message

With Go bridge running:

```bash
cd ~/machina/components/whatsapp-mcp
python -c "
from whatsapp import send_message
send_message('+1234567890', 'Test from Machina')
"
```

Replace with a real phone number you can verify.

### Read Messages

```bash
python -c "
from whatsapp import list_messages
messages = list_messages(limit=5)
for m in messages:
    print(f'{m.sender}: {m.content}')
"
```

## Running as Service

### Go Bridge (Required)

Must run continuously. Use LaunchD (see `../04-launchd.md`).

**Manual start**:

```bash
cd ~/machina/components/whatsapp-mcp/whatsapp-bridge
./whatsapp-bridge --port 3001
```

### Python MCP (Optional)

Only needed if using MCP protocol directly. Gateway can call Python functions directly.

## Integration with Gateway

Gateway calls WhatsApp via HTTP to the Go bridge:

```typescript
// HTTP to Go bridge on port 3001
const response = await fetch("http://localhost:3001/api/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ to: "+1234567890", message: "Hello" }),
});
```

## Troubleshooting

### QR code not appearing

- Check Go bridge is running
- Check terminal supports Unicode
- Try: `./whatsapp-bridge 2>&1 | cat`

### "Session expired"

Re-authenticate:

1. Stop Go bridge
2. Delete `store/` directory
3. Start Go bridge
4. Scan new QR code

### Messages not sending

1. Verify phone number format: `+[country][number]` (e.g., +14155551234)
2. Check Go bridge is running
3. Check recipient has WhatsApp

### "Connection closed"

WhatsApp may disconnect if:

- Phone loses internet connection
- WhatsApp app is force-closed on phone
- Session expired

**Fix**: Restart Go bridge. May need to re-scan QR if session expired.

## Data Storage

Messages stored in SQLite:

- `store/whatsapp.db` - Device session
- `store/messages.db` - Message history

Both are local to the Mac. Not synced externally.

## Media Support

WhatsApp MCP supports:

- Images (sent as image message)
- Videos (sent as video message)
- Documents (sent as document)
- Voice messages (converted to Opus OGG format)

Voice conversion requires ffmpeg:

```bash
brew install ffmpeg
```
