# Verification

After installation, verify each component works correctly.

## Quick Health Check

```bash
# Gateway responding?
curl http://localhost:8080/health

# Expected:
# {"status":"ok","timestamp":"..."}
```

If this fails, check:

1. Gateway service running: `launchctl list | grep machina`
2. Logs: `tail ~/machina/logs/gateway.error.log`

## Full Verification Checklist

### 1. Gateway API

```bash
# Load token
source ~/machina/config/.env

# Test describe action
curl -X POST http://localhost:8080/api/machina \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "describe"}'
```

**Expected**: JSON listing available services

**If fails**:

- Check token is correct
- Check gateway logs

### 2. Apple Services (iMessage, etc.)

Test each capability via AppleScript:

```bash
# Messages - list chats
osascript -e 'tell application "Messages" to get name of every chat'

# Contacts - list names
osascript -e 'tell application "Contacts" to get name of first person'

# Calendar - list calendars
osascript -e 'tell application "Calendar" to get name of every calendar'

# Mail - list accounts
osascript -e 'tell application "Mail" to get name of every account'

# Notes - list notes
osascript -e 'tell application "Notes" to get name of first note'

# Reminders - list lists
osascript -e 'tell application "Reminders" to get name of every list'
```

**If fails with "Not authorized"**:

- Grant Automation permission in System Preferences

### 3. Send Test iMessage

**Warning**: This sends a real message!

```bash
# Test via API (when gateway handlers are implemented)
curl -X POST http://localhost:8080/api/machina \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "messages.send", "params": {"to": "YOUR_PHONE", "body": "Test from Machina"}}'
```

Or via AppleScript directly:

```bash
osascript -e 'tell application "Messages"
  set targetService to 1st service whose service type = iMessage
  set targetBuddy to buddy "+1YOUR_NUMBER" of targetService
  send "Test from Machina" to targetBuddy
end tell'
```

### 4. WhatsApp (if enabled)

```bash
# Check Go bridge is running
launchctl list | grep whatsapp

# Check bridge log for "Connected" message
tail ~/machina/logs/whatsapp.log
```

**If not connected**:

- May need to re-authenticate with QR code
- Check `~/machina/components/whatsapp-mcp/whatsapp-bridge/store/` exists

### 5. Remote Access (if Tailscale enabled)

From another device on your Tailscale network:

```bash
# Get your Mac's Tailscale IP
tailscale ip -4

# Test from another device
curl http://YOUR_TAILSCALE_IP:8080/health
```

### 6. Auto-Restart Test

Simulate crash and verify recovery:

```bash
# Kill gateway
pkill -f "bun.*gateway"

# Wait 5 seconds
sleep 5

# Check if restarted
curl http://localhost:8080/health
```

**Expected**: Gateway should auto-restart (KeepAlive)

### 7. Boot Persistence Test

```bash
# Logout and login again
# Or restart Mac

# After login, check services
launchctl list | grep machina
curl http://localhost:8080/health
```

**Expected**: Services running without manual intervention

## Verification Summary

| Check    | Command                                   | Expected              |
| -------- | ----------------------------------------- | --------------------- |
| Health   | `curl localhost:8080/health`              | `{"status":"ok",...}` |
| Token    | `curl -H "Authorization: Bearer xxx" ...` | Service list          |
| Messages | `osascript -e 'tell app "Messages"...'`   | No error              |
| Contacts | `osascript -e 'tell app "Contacts"...'`   | Contact list          |
| WhatsApp | `tail ~/machina/logs/whatsapp.log`        | "Connected"           |
| Remote   | `curl TAILSCALE_IP:8080/health`           | `{"status":"ok",...}` |
| Restart  | Kill and wait                             | Auto-recovers         |
| Boot     | Restart Mac                               | Services running      |

## What Success Looks Like

When fully working:

1. `launchctl list | grep machina` shows both services with PIDs
2. `curl localhost:8080/health` returns OK
3. API requests with correct token return expected data
4. Services restart automatically after crash
5. Services start automatically after login
6. Remote devices can reach via Tailscale

## Report Issues

If verification fails, gather:

1. Which step failed
2. Exact error message
3. Contents of `~/machina/logs/*.error.log`
4. Output of `launchctl list | grep machina`
5. macOS version: `sw_vers`

Then either:

- Check `../maintenance/troubleshooting.md`
- Open issue at https://github.com/TechNickAI/machina/issues
