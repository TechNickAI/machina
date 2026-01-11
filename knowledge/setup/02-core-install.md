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

## Create Access Token

The gateway needs a token to authenticate incoming requests.

```bash
mkdir -p ~/machina/config
TOKEN=$(openssl rand -hex 32)
echo "MACHINA_TOKEN=$TOKEN" > ~/machina/config/.env
echo "Your access token: $TOKEN"
```

**Important**: Save this token securely. Include it in the `Authorization` header for all
requests to the gateway.

## Assessing What's Installed

There's no config file listing enabled services. Claude assesses the system directly:

```bash
# What components are installed?
ls ~/machina/components/

# What services are running?
launchctl list | grep machina
```

If a component directory exists and builds successfully, it's available. If its LaunchD
service is running, it's active.

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
│   └── .env                # MACHINA_TOKEN only
└── logs/
    └── (empty, will be populated)
```

## Next Steps

After core installation:

1. Configure each component (see `components/` docs)
2. Set up LaunchD (see `04-launchd.md`)
3. Verify everything (see `05-verification.md`)
