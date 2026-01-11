# Verification

After installation, verify each component works correctly.

## Quick Health Check

Hit the gateway health endpoint. Should return `{ "status": "ok" }`.

If this fails, check:

1. Gateway service running (check LaunchD status)
2. Error logs in `~/machina/logs/`

## Full Verification

### Gateway API

Test the describe action with the Bearer token. Should return list of available services.

### Apple Services

Run AppleScript to list items from each app:

- Messages: list chats
- Contacts: list people
- Calendar: list calendars
- Mail: list accounts
- Notes: list notes
- Reminders: list reminder lists

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
