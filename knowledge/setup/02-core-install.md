# Core Installation

After prerequisites are verified, install the core components.

## Clone Component Repos

### apple-mcp (Required for Apple Services)

```bash
git clone https://github.com/supermemoryai/apple-mcp ~/machina/components/apple-mcp
cd ~/machina/components/apple-mcp
bun install
```

**Verification**: `cd ~/machina/components/apple-mcp && bun run build` succeeds

**Note**: This repo is archived (read-only) but the code is complete and stable.

### whatsapp-mcp (Optional - for WhatsApp)

Only install if user wants WhatsApp support.

```bash
# Clone the repo
git clone https://github.com/lharries/whatsapp-mcp ~/machina/components/whatsapp-mcp

# Build Go bridge
cd ~/machina/components/whatsapp-mcp/whatsapp-bridge
go build -o whatsapp-bridge

# Install Python dependencies
cd ~/machina/components/whatsapp-mcp
pip install -e .
```

**Verification**:

- `~/machina/components/whatsapp-mcp/whatsapp-bridge/whatsapp-bridge --help` runs
- Go binary exists

### Gateway (Required)

The gateway is a simple Hono server we create. This isn't a cloned repo - we generate it.

```bash
mkdir -p ~/machina/components/gateway
cd ~/machina/components/gateway
bun init -y
bun add hono
```

Then create the gateway code. See `components/gateway.md` for the implementation.

## Create Configuration

### Environment File

Create `~/machina/config/.env`:

```bash
# Generate a random API key
API_KEY=$(openssl rand -hex 32)
echo "MACHINA_API_KEY=$API_KEY" > ~/machina/config/.env
echo "Your API key: $API_KEY"
```

**Important**: Save this API key securely. It's required for all API requests.

### Services Configuration

Create `~/machina/config/services.json`:

```json
{
  "apple": {
    "enabled": true,
    "capabilities": [
      "messages",
      "mail",
      "calendar",
      "notes",
      "reminders",
      "contacts"
    ]
  },
  "whatsapp": {
    "enabled": false
  },
  "gateway": {
    "port": 8080,
    "host": "127.0.0.1"
  }
}
```

Update `whatsapp.enabled` to `true` if user wants WhatsApp.

## Directory Structure After Install

```
~/machina/
├── components/
│   ├── apple-mcp/          # Cloned from GitHub
│   │   ├── index.ts
│   │   ├── utils/
│   │   └── ...
│   ├── whatsapp-mcp/       # Cloned from GitHub (optional)
│   │   ├── whatsapp-bridge/
│   │   └── ...
│   └── gateway/            # Generated
│       ├── src/
│       │   └── index.ts
│       └── package.json
├── config/
│   ├── .env
│   └── services.json
└── logs/
    └── (empty, will be populated)
```

## Next Steps

After core installation:

1. Configure each component (see `components/` docs)
2. Set up networking (see `03-networking.md`)
3. Configure LaunchD (see `04-launchd.md`)
4. Verify everything (see `05-verification.md`)
