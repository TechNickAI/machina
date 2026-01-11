# Verification

After installation, verify each component works correctly.

## Quick Health Check

Hit the gateway health endpoint. Should return `{ "status": "ok" }`.

```bash
curl http://localhost:8080/health
```

If this fails, check:

1. Gateway service running (check LaunchD status)
2. Error logs in `~/machina/logs/`

## Full Verification

### Gateway API

Test the describe action with the Bearer token. Should return list of available services.

### Apple Services

Test via the machina describe action, then try individual operations:

- Messages: `messages_conversations` or `messages_recent`
- Contacts: `contacts_search` with a known name
- Notes: `notes_list`
- Reminders: `reminders_list`

Success: returns data without "not authorized" errors.

### Send Test iMessage

**Warning**: This sends a real message.

Use the API to send a test message to yourself or a known contact.

### WhatsApp (if enabled)

Check the Go bridge is running. Logs should show "Connected" or similar.

If not connected, may need to re-authenticate with QR code.

### Remote Access (if Tailscale enabled)

From another device on your Tailscale network, hit the health endpoint using the
Mac's Tailscale IP.

### Auto-Restart

Kill the gateway process. Wait a few seconds. It should auto-restart (KeepAlive).

### Boot Persistence

Log out and back in (or restart). Services should start automatically.

## Success Criteria

When fully working:

1. LaunchD shows machina services with PIDs
2. Health endpoint returns OK
3. API requests with correct token return expected data
4. Services restart automatically after crash
5. Services start automatically after login
6. Remote devices can reach via Tailscale

## Troubleshooting

If verification fails:

1. Which step failed?
2. What's the exact error?
3. What do the logs say?
4. Is the service running?

See `../maintenance/troubleshooting.md` for common issues.

## Installation Complete - MCP Config

After successful verification, generate the MCP config for external AI tools.

### Get Connection Details

```bash
# Get Tailscale hostname
TAILSCALE_HOST=$(tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//')

# Get token
MACHINA_TOKEN=$(cat ~/machina/config/.env | grep MACHINA_TOKEN | cut -d= -f2)

echo "Tailscale hostname: $TAILSCALE_HOST"
echo "Token: $MACHINA_TOKEN"
```

### MCP Config (copy this)

For Claude Desktop, Cursor, or other MCP-compatible tools:

```json
{
  "mcpServers": {
    "machina": {
      "transport": {
        "type": "streamable-http",
        "url": "https://<TAILSCALE_HOST>/mcp",
        "headers": {
          "Authorization": "Bearer <MACHINA_TOKEN>"
        }
      }
    }
  }
}
```

Replace `<TAILSCALE_HOST>` and `<MACHINA_TOKEN>` with the values from above.

### Enable Tailscale HTTPS (if not already)

Run:

```bash
tailscale serve --bg http://localhost:8080
```

If prompted, visit the URL to enable Tailscale Serve on your tailnet.

### Verify Remote Access

From another device on your Tailscale network:

```bash
curl https://<TAILSCALE_HOST>/health
```

Should return `{"status":"ok","version":"1.0.0"}`.
