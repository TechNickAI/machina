# Remote Update

Cloud-triggered update via HTTP API.

## Use Case

Carmenta (or another cloud AI) triggers update on remote Mac without user presence.

## Trigger

POST request to gateway:

```bash
curl -X POST http://MAC_TAILSCALE_IP:8080/api/machina \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "system.update"}'
```

## Implementation

Gateway handles `system.update` action by invoking Claude:

```typescript
async function handleSystemUpdate() {
  // Spawn Claude to run update
  const result = await Bun.spawn([
    "claude",
    "-p",
    "Run update procedure per knowledge/update/local.md",
    "/Users/USER/machina",
  ]);

  // Wait for completion
  await result.exited;

  // Return result
  return {
    success: result.exitCode === 0,
    output: await new Response(result.stdout).text(),
  };
}
```

## Security Considerations

1. **Require token** - All system actions require valid token
2. **Audit log** - Log all remote update requests
3. **Rate limit** - Prevent update spam (max 1 per hour?)
4. **Notification** - Optionally notify user when remote update occurs

## Response

```json
{
  "success": true,
  "updated": ["machina", "apple-mcp"],
  "version": "0.2.0",
  "verification": {
    "health": "ok",
    "services": ["gateway", "whatsapp"]
  }
}
```

Or on failure:

```json
{
  "success": false,
  "error": "Component apple-mcp failed to build",
  "logs": "..."
}
```

## Fallback

If remote update fails:

1. Services should remain running (don't stop before update succeeds)
2. Error logged to ~/machina/logs/update.log
3. Error returned to caller
4. User notified (if notification configured)

## Scheduling

Remote updates can be scheduled by cloud AI:

- Daily at 3am: Check for updates, apply if available
- After push to main: Webhook triggers update
- Manual: User requests via Carmenta

## Testing

Before relying on remote updates:

1. Test locally first
2. Test with a non-critical change
3. Verify rollback works
4. Ensure notification/logging works
