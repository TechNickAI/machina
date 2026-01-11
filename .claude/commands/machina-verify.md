---
description: Test all Machina MCP capabilities through the API
---

# Machina Verify

Test Machina by calling the actual MCP API endpoints. This verifies the full stack: gateway, authentication, and each capability.

## Setup

Get the auth token:

```bash
MACHINA_TOKEN=$(cat ~/machina/config/.env | grep MACHINA_TOKEN | cut -d= -f2)
```

## Tests

Run these tests in sequence through the MCP API:

### 1. Health Check (unauthenticated)

```bash
curl -s http://localhost:8080/health
```

Expected: `{"status":"ok","version":"..."}` with current version

### 2. MCP Describe (authenticated)

Test that MCP endpoint responds and lists available operations:

```bash
curl -s http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"machina","arguments":{"action":"describe"}}}'
```

Expected: JSON response listing available operations (messages, contacts, notes, reminders)

### 3. Messages Test

Read recent messages through MCP:

```bash
curl -s http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"machina","arguments":{"action":"messages_recent","limit":1}}}'
```

Expected: Returns recent message data (not an error)

### 4. Contacts Test

Search contacts through MCP:

```bash
curl -s http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"machina","arguments":{"action":"contacts_search","query":"a"}}}'
```

Expected: Returns contact data (not an error)

### 5. Notes Test

List notes through MCP:

```bash
curl -s http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"machina","arguments":{"action":"notes_list"}}}'
```

Expected: Returns notes list (not an error)

### 6. Reminders Test

List reminders through MCP:

```bash
curl -s http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"machina","arguments":{"action":"reminders_list"}}}'
```

Expected: Returns reminders list (not an error)

## Output Format

```
Machina MCP Verification: X/6 passed

Health: Gateway responding (version X.X.X)
Auth: MCP endpoint authenticated successfully
Messages: Retrieved recent messages via API
Contacts: Searched contacts via API
Notes: Listed notes via API
Reminders: Listed reminders via API

All MCP capabilities working!
```

Or if failures:

```
Machina MCP Verification: X/6 passed

Health: OK
Auth: FAILED - check MACHINA_TOKEN in ~/machina/config/.env
...

Check the gateway logs: tail ~/machina/logs/gateway.log
```

## What This Verifies

- Gateway is running and healthy
- Authentication with Bearer token works
- MCP JSON-RPC protocol is functioning
- Each Mac capability is accessible through the API
- End-to-end flow that cloud AI agents will use
