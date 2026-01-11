# Gateway Setup

The gateway is the HTTP entry point for all Machina capabilities. It validates access
tokens and routes requests to the appropriate backend.

## Location

`~/machina/components/gateway/`

## Technology

- Hono (TypeScript HTTP framework)
- Bun runtime
- Simple, focused implementation

## Creating the Gateway

The gateway isn't cloned - we generate it. Create these files:

### package.json

```bash
cd ~/machina/components/gateway
bun init -y
bun add hono
```

### src/index.ts

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

// Load config
const TOKEN = process.env.MACHINA_TOKEN || Bun.env.MACHINA_TOKEN;
const PORT = parseInt(process.env.PORT || "8080");

if (!TOKEN) {
  console.error("MACHINA_TOKEN not set. Check ~/machina/config/.env");
  process.exit(1);
}

// CORS for remote access
app.use("*", cors());

// Health check (no auth required)
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Token auth middleware
app.use("/api/*", async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ") || auth.slice(7) !== TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

// Main API endpoint
app.post("/api/machina", async (c) => {
  const body = await c.req.json();
  const { action, params } = body;

  if (!action) {
    return c.json({ error: "Missing action" }, 400);
  }

  // Describe action - list available operations
  if (action === "describe") {
    return c.json({
      services: {
        messages: {
          operations: ["send", "read", "list_chats"],
          description: "iMessage and WhatsApp messaging",
        },
        mail: {
          operations: ["send", "search", "list_unread"],
          description: "Email via Mail.app",
        },
        calendar: {
          operations: ["create", "search", "list"],
          description: "Calendar events",
        },
        contacts: {
          operations: ["search", "get"],
          description: "Contact lookup",
        },
        notes: {
          operations: ["create", "search", "list"],
          description: "Apple Notes",
        },
        reminders: {
          operations: ["create", "list", "search"],
          description: "Apple Reminders",
        },
      },
    });
  }

  // Route to appropriate handler
  try {
    const result = await handleAction(action, params);
    return c.json(result);
  } catch (error) {
    console.error(`Error handling ${action}:`, error);
    return c.json({ error: String(error) }, 500);
  }
});

// Action router
async function handleAction(action: string, params: any) {
  const [service, operation] = action.split(".");

  switch (service) {
    case "messages":
      return handleMessages(operation, params);
    case "mail":
      return handleMail(operation, params);
    case "calendar":
      return handleCalendar(operation, params);
    case "contacts":
      return handleContacts(operation, params);
    case "notes":
      return handleNotes(operation, params);
    case "reminders":
      return handleReminders(operation, params);
    default:
      throw new Error(`Unknown service: ${service}`);
  }
}

// Service handlers - import from apple-mcp
// These will be implemented to call apple-mcp utilities

async function handleMessages(operation: string, params: any) {
  // TODO: Import from apple-mcp
  // import { sendMessage, readMessages } from '../apple-mcp/utils/messages';
  throw new Error("Messages handler not yet implemented");
}

async function handleMail(operation: string, params: any) {
  throw new Error("Mail handler not yet implemented");
}

async function handleCalendar(operation: string, params: any) {
  throw new Error("Calendar handler not yet implemented");
}

async function handleContacts(operation: string, params: any) {
  throw new Error("Contacts handler not yet implemented");
}

async function handleNotes(operation: string, params: any) {
  throw new Error("Notes handler not yet implemented");
}

async function handleReminders(operation: string, params: any) {
  throw new Error("Reminders handler not yet implemented");
}

// Start server
// Bind to 0.0.0.0 for Tailscale remote access (not just localhost)
console.log(`Machina gateway starting on 0.0.0.0:${PORT}...`);
export default {
  port: PORT,
  hostname: "0.0.0.0",
  fetch: app.fetch,
};
```

## Running the Gateway

### Development

```bash
cd ~/machina/components/gateway
source ~/machina/config/.env  # Load token
bun run src/index.ts
```

### Production

Use LaunchD (see `../04-launchd.md`).

## API Reference

### Health Check

```bash
curl http://localhost:8080/health
```

Response:

```json
{ "status": "ok", "timestamp": "2026-01-11T10:00:00.000Z" }
```

### Describe (List Operations)

```bash
curl -X POST http://localhost:8080/api/machina \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "describe"}'
```

### Send Message

```bash
curl -X POST http://localhost:8080/api/machina \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "messages.send", "params": {"to": "Mom", "body": "Hi!"}}'
```

### Search Contacts

```bash
curl -X POST http://localhost:8080/api/machina \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "contacts.search", "params": {"query": "John"}}'
```

## Implementing Service Handlers

The gateway currently has stub handlers. To implement:

1. Import the relevant utility from apple-mcp:

   ```typescript
   import { sendMessage } from "../../apple-mcp/utils/messages";
   ```

2. Call the utility in the handler:

   ```typescript
   async function handleMessages(operation: string, params: any) {
     switch (operation) {
       case "send":
         return await sendMessage(params.to, params.body);
       case "read":
         return await readMessages(params.chatId, params.limit);
       default:
         throw new Error(`Unknown operation: messages.${operation}`);
     }
   }
   ```

3. Handle errors and format responses

## Security Notes

1. Token must be set via environment variable
2. Never commit token to git
3. Use HTTPS in production (Tailscale handles this)
4. Consider rate limiting for production use

## Extending the Gateway

To add new capabilities:

1. Add service to `describe` response
2. Add handler function
3. Import utilities from component repo
4. Add case to action router
