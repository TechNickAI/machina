---
description: Test all Machina MCP capabilities through the API
---

# Machina Verify

Test Machina by calling the MCP API. Stateless mode - no sessions needed.

## Setup

Get the auth token:

```bash
MACHINA_TOKEN=$(cat ~/machina/config/.env | grep MACHINA_TOKEN | cut -d= -f2)
```

## Tests

Run each test and report results. If a test fails, note the error message.

### 1. Gateway Health

```bash
curl -s http://localhost:9900/health
```

Expected: `{"status":"ok","version":"..."}` with current version

**If fails:** Gateway not running. Check `launchctl list | grep machina` and logs at `~/machina/logs/gateway-stderr.log`

### 2. WhatsApp Service Health

```bash
curl -s http://localhost:9901/health
```

Expected: `{"status":"connected",...}` or similar

**If fails:** WhatsApp service not running or not authenticated. Check `~/machina/logs/whatsapp-stderr.log`

### 3. MCP Describe

List available operations:

```bash
curl -s -X POST 'http://localhost:9900/mcp' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"machina","arguments":{"action":"describe"}}}'
```

Expected: JSON with list of operations (messages, whatsapp, contacts, notes, reminders)

### 4. WhatsApp Database (No FDA Required)

```bash
curl -s -X POST 'http://localhost:9900/mcp' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"machina","arguments":{"action":"whatsapp_chats"}}}'
```

Expected: List of WhatsApp chats

**If fails with database error:** Check WhatsApp service is running and authenticated

### 5. Messages Database (FDA Required)

```bash
curl -s -X POST 'http://localhost:9900/mcp' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"machina","arguments":{"action":"messages_recent","params":{"limit":1}}}}'
```

Expected: Most recent message

**If fails with "unable to open database file":**
This is a Full Disk Access issue. The Node.js binary needs FDA to read `~/Library/Messages/chat.db`.

Fix - run these commands:

```bash
# Open FDA settings and copy node path to clipboard
open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
echo -n "$(dirname $(which node))/node" | pbcopy && echo "Path copied!"
```

Then: Click **+**, press `Cmd+Shift+G`, press `Cmd+V` to paste, click "Open".

Finally: `launchctl kickstart -k gui/$(id -u)/com.machina.gateway`

### 6. Contacts (AppleScript)

```bash
curl -s -X POST 'http://localhost:9900/mcp' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"machina","arguments":{"action":"contacts_search","params":{"name":"John"}}}}'
```

### 7. Notes (AppleScript)

```bash
curl -s -X POST 'http://localhost:9900/mcp' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"machina","arguments":{"action":"notes_list","params":{"limit":3}}}}'
```

### 8. Reminders (AppleScript)

```bash
curl -s -X POST 'http://localhost:9900/mcp' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"machina","arguments":{"action":"reminders_list"}}}'
```

## Output Format

```
Machina MCP Verification: X/8 passed

1. Gateway Health:     OK (version X.X.X)
2. WhatsApp Service:   OK (connected)
3. MCP Describe:       OK (24 operations)
4. WhatsApp Database:  OK (X chats)
5. Messages Database:  OK / NEEDS FDA (see fix above)
6. Contacts:           OK
7. Notes:              OK
8. Reminders:          OK

[If all pass]
All MCP capabilities working!

[If Messages fails with FDA error]
Messages needs Full Disk Access. Run:
  open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
Then add your node binary and restart the gateway.
```

## What This Verifies

- Gateway is running and healthy
- WhatsApp service is running and connected
- Authentication with Bearer token works
- MCP JSON-RPC protocol is functioning
- Database access (WhatsApp + Messages)
- AppleScript capabilities (Contacts, Notes, Reminders)
- Full Disk Access status for protected databases

## Common Issues

### "unable to open database file" for Messages

Full Disk Access needed. See Test 5 above.

### "better-sqlite3 is not yet supported in Bun"

Gateway is running under Bun instead of Node.js. Check the plist:

```bash
grep -A2 ProgramArguments ~/Library/LaunchAgents/com.machina.gateway.plist
```

Should show `tsx` or `node`, NOT `bun`. See machina.md for correct plist template.

### WhatsApp "disconnected"

Re-authenticate:

```bash
launchctl unload ~/Library/LaunchAgents/com.machina.whatsapp.plist
rm -rf ~/machina/components/whatsapp-mcp-ts/auth_info
cd ~/machina/components/whatsapp-mcp-ts && node src/server.ts
# Scan QR code, then Ctrl+C
launchctl load ~/Library/LaunchAgents/com.machina.whatsapp.plist
```
