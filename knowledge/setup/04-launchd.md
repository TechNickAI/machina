# LaunchD Configuration

LaunchD is macOS's native service manager. We use it to auto-start Machina services on
login and restart them if they crash.

## Services

User LaunchAgents go in `~/Library/LaunchAgents/`.

Machina needs these services:

- **com.machina.gateway** - HTTP gateway (Bun process)
- **com.machina.whatsapp** - WhatsApp Go bridge (if enabled)

apple-mcp doesn't need its own service - the gateway imports it directly.

## Gateway Service Configuration

- Program: Bun running the gateway TypeScript
- Working directory: `~/machina/components/gateway`
- Environment: `MACHINA_TOKEN` set to the generated token
- RunAtLoad: true (start on login)
- KeepAlive: true (restart on crash)
- Logs: stdout and stderr to `~/machina/logs/`

Note: Use the actual Bun path from `which bun` (varies by install method).

## WhatsApp Service Configuration

- Program: The compiled Go binary with `--port 3001`
- Working directory: `~/machina/components/whatsapp-mcp/whatsapp-bridge`
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
