# Core Installation

After prerequisites are verified, install the core components.

## Directory Structure

Create the machina directories:

```
~/machina/
├── components/     # Cloned repos live here
├── config/         # .env with MACHINA_TOKEN
└── logs/           # Service logs
```

## Component Repos

### apple-mcp (Required)

Clone from `TechNickAI/apple-mcp` to `~/machina/components/apple-mcp`.

This is our fork of supermemoryai/apple-mcp. Install dependencies with Bun.

Verify: build succeeds.

### whatsapp-mcp (Optional)

Only if user wants WhatsApp support.

Clone from `lharries/whatsapp-mcp` to `~/machina/components/whatsapp-mcp`.

Build the Go bridge in the `whatsapp-bridge` subdirectory. Install Python dependencies.

Verify: Go binary runs with `--help`.

### Gateway (Required)

The gateway is generated, not cloned. Create a Hono server in
`~/machina/components/gateway/`.

See `components/gateway.md` for the implementation spec.

## Access Token

Generate a random token and save to `~/machina/config/.env` as `MACHINA_TOKEN`.

This token authenticates all API requests. Store it securely.

## Assessing Installation State

There's no config file listing enabled services. Assess the system directly:

- What components exist in `~/machina/components/`?
- What LaunchD services are running?

If a component directory exists and builds successfully, it's available.
If its LaunchD service is running, it's active.

## Next Steps

1. Configure each component (see `components/` docs)
2. Set up LaunchD (see `04-launchd.md`)
3. Verify everything (see `05-verification.md`)
