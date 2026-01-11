# Gateway

The HTTP entry point for all Machina capabilities. Validates access tokens and routes
requests to the appropriate backend.

## Location

`~/machina/components/gateway/`

## Technology

- Hono (TypeScript HTTP framework)
- Bun runtime

## Implementation

The gateway is generated, not cloned. Create a Hono server with:

### Configuration

- `MACHINA_TOKEN` from environment
- Port 8080
- Bind to `0.0.0.0` (not localhost) for Tailscale remote access

### Endpoints

**Health check** (no auth): `GET /health`
Returns `{ status: "ok", timestamp: "..." }`

**API** (requires Bearer token): `POST /api/machina`
Body: `{ action: "...", params: {...} }`

### Token Auth

Middleware on `/api/*` validates `Authorization: Bearer <token>` header.

### Actions

**describe**: Returns available services and operations.

**service.operation**: Routes to appropriate handler.

Services: messages, mail, calendar, contacts, notes, reminders

### Service Handlers

Import utilities from apple-mcp and call them:

```typescript
// Example structure - Claude implements based on apple-mcp exports
import { sendMessage } from "../apple-mcp/utils/messages";
import { searchContacts } from "../apple-mcp/utils/contacts";

async function handleMessages(operation: string, params: any) {
  switch (operation) {
    case "send":
      return await sendMessage(params.to, params.body);
    // ... other operations
  }
}
```

For WhatsApp, call the Go bridge HTTP API on port 3001.

## API Reference

### Health Check

```
GET /health
→ { "status": "ok", "timestamp": "2026-01-11T..." }
```

### Describe

```
POST /api/machina
Authorization: Bearer <token>
{ "action": "describe" }
→ { services: { messages: {...}, mail: {...}, ... } }
```

### Send Message

```
POST /api/machina
Authorization: Bearer <token>
{ "action": "messages.send", "params": { "to": "Mom", "body": "Hi!" } }
```

## Security

- Token must be set via environment variable
- Never commit token to git
- Tailscale provides HTTPS and network isolation
- Consider rate limiting for production

## Extending

To add new capabilities:

1. Add service to describe response
2. Add handler function
3. Import utilities from component repo
4. Add case to action router
