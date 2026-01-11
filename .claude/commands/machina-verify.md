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

### 1. Health Check

```bash
curl -s http://localhost:8080/health
```

Expected: `{"status":"ok","version":"..."}` with current version

### 2. MCP Describe

List available operations:

```bash
curl -s http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"machina","arguments":{"action":"describe"}}}'
```

Expected: JSON with list of operations (messages, contacts, notes, reminders)

### 3. Messages Test

```bash
curl -s http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"machina","arguments":{"action":"messages_recent","params":{"limit":1}}}}'
```

### 4. Contacts Test

```bash
curl -s http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"machina","arguments":{"action":"contacts_search","params":{"name":"John"}}}}'
```

### 5. Notes Test

```bash
curl -s http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"machina","arguments":{"action":"notes_list","params":{"limit":3}}}}'
```

### 6. Reminders Test

```bash
curl -s http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MACHINA_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"machina","arguments":{"action":"reminders_list"}}}'
```

## Output Format

```
Machina MCP Verification: X/6 passed

Health: Gateway responding (version X.X.X)
Describe: Listed all operations
Messages: Retrieved recent messages
Contacts: Searched contacts
Notes: Listed notes
Reminders: Listed reminders

All MCP capabilities working!
```

## What This Verifies

- Gateway is running and healthy
- Authentication with Bearer token works
- MCP JSON-RPC protocol is functioning
- Each Mac capability is accessible through the API
- Stateless mode - no session complexity
