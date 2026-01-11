# Core Installation

After prerequisites are verified, install the core components.

## Directory Structure

Create the machina directories:

```
~/machina/
├── config/         # .env with MACHINA_TOKEN
└── logs/           # Service logs
```

## Gateway (Required)

The gateway is an npm package:

```bash
bunx machina-mcp
```

Or install globally for LaunchD:

```bash
bun add -g machina-mcp
```

See `components/gateway.md` for configuration details.

## apple-mcp (Auto-installed)

The gateway spawns apple-mcp automatically. It uses `bunx apple-mcp` to run it on demand.

If you want to pre-install for faster startup:

```bash
bun add -g apple-mcp
```

## WhatsApp Bridge (Optional)

Only if user wants WhatsApp support.

Clone from `lharries/whatsapp-mcp` and build the Go bridge.
Run on port 3001. The gateway proxies WhatsApp requests to it.

## Access Token

Generate a random token and save to `~/machina/config/.env` as `MACHINA_TOKEN`.

This token authenticates all MCP requests. Store it securely.

## Assessing Installation State

- Is machina-mcp installed? (`which machina-mcp` or check global bun packages)
- Is the LaunchD service running?
- Can you reach the health endpoint?

## Next Steps

1. Set up LaunchD (see `04-launchd.md`)
2. Verify everything (see `05-verification.md`)
