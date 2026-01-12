# LaunchD Configuration

LaunchD is macOS's native service manager. We use it to auto-start Machina services on
login and restart them if they crash.

## Services

User LaunchAgents go in `~/Library/LaunchAgents/`.

Machina needs these services:

- **com.machina.gateway** - MCP gateway (Node.js + tsx)
- **com.machina.whatsapp** - WhatsApp service (optional, Node.js)

## Gateway Service Configuration

- Program: Node.js with tsx running the gateway TypeScript
- Working directory: `~/machina`
- Environment: `MACHINA_TOKEN` set to the generated token
- RunAtLoad: true (start on login)
- KeepAlive: true (restart on crash)
- Logs: stdout and stderr to `~/machina/logs/`

Note: Use the actual node/tsx paths from `which node` and the project's node_modules.

## WhatsApp Service Configuration

- Program: Node.js running the WhatsApp service TypeScript
- Working directory: `~/machina/components/whatsapp-mcp-ts`
- Environment: `WHATSAPP_PORT=9901`, `WHATSAPP_MCP_DATA_DIR` set
- RunAtLoad: true
- KeepAlive: true
- Logs: to `~/machina/logs/`

## Managing Services

Load services to start them. Unload to stop. Services auto-restart on crash due to
KeepAlive. Check status by listing LaunchD jobs filtered for "machina".

## Key Settings

- **RunAtLoad**: Start when user logs in
- **KeepAlive**: Restart if process exits
- **WorkingDirectory**: Set so relative paths work
- **EnvironmentVariables**: For tokens and config

## Troubleshooting

### Service won't start

Check error logs in `~/machina/logs/`. Common issues: wrong path to binary, missing
environment variables, permission denied.

### Restart loop

KeepAlive causes infinite restarts if the process keeps crashing. Unload the service,
check logs, fix the issue, reload.

### "Service already loaded"

Unload before loading again to reload configuration changes.
