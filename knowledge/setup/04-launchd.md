# LaunchD Configuration

LaunchD is macOS's native service manager. We use it to auto-start Machina services on
login and restart them if they crash.

## Service Files Location

User services: `~/Library/LaunchAgents/`

Machina creates these plist files:

- `com.machina.gateway.plist` - HTTP gateway
- `com.machina.whatsapp.plist` - WhatsApp Go bridge (if enabled)

apple-mcp doesn't need its own service - the gateway imports it directly.

## Gateway Service

Create `~/Library/LaunchAgents/com.machina.gateway.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.machina.gateway</string>

    <key>ProgramArguments</key>
    <array>
        <string>/Users/USER/.bun/bin/bun</string>
        <string>run</string>
        <string>/Users/USER/machina/components/gateway/src/index.ts</string>
    </array>

    <key>WorkingDirectory</key>
    <string>/Users/USER/machina/components/gateway</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>MACHINA_API_KEY</key>
        <string>YOUR_API_KEY_HERE</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Users/USER/machina/logs/gateway.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/USER/machina/logs/gateway.error.log</string>
</dict>
</plist>
```

**Important**: Replace `USER` with actual username and `YOUR_API_KEY_HERE` with the
generated API key.

## WhatsApp Bridge Service

Create `~/Library/LaunchAgents/com.machina.whatsapp.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.machina.whatsapp</string>

    <key>ProgramArguments</key>
    <array>
        <string>/Users/USER/machina/components/whatsapp-mcp/whatsapp-bridge/whatsapp-bridge</string>
    </array>

    <key>WorkingDirectory</key>
    <string>/Users/USER/machina/components/whatsapp-mcp/whatsapp-bridge</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Users/USER/machina/logs/whatsapp.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/USER/machina/logs/whatsapp.error.log</string>
</dict>
</plist>
```

## Loading Services

After creating plist files:

```bash
# Load gateway
launchctl load ~/Library/LaunchAgents/com.machina.gateway.plist

# Load WhatsApp (if enabled)
launchctl load ~/Library/LaunchAgents/com.machina.whatsapp.plist
```

## Managing Services

### Check Status

```bash
launchctl list | grep machina
```

Shows PID if running, `-` if not.

### Stop Service

```bash
launchctl stop com.machina.gateway
```

### Start Service

```bash
launchctl start com.machina.gateway
```

### Unload (Disable)

```bash
launchctl unload ~/Library/LaunchAgents/com.machina.gateway.plist
```

### Reload After Changes

```bash
launchctl unload ~/Library/LaunchAgents/com.machina.gateway.plist
launchctl load ~/Library/LaunchAgents/com.machina.gateway.plist
```

## Viewing Logs

```bash
# Gateway logs
tail -f ~/machina/logs/gateway.log

# WhatsApp logs
tail -f ~/machina/logs/whatsapp.log

# Error logs
tail -f ~/machina/logs/gateway.error.log
```

## Key Settings Explained

### RunAtLoad

`<true/>` means service starts when user logs in. Set to `<false/>` for manual start
only.

### KeepAlive

`<true/>` means LaunchD restarts the service if it crashes. Essential for reliability.

Can also be conditional:

```xml
<key>KeepAlive</key>
<dict>
    <key>SuccessfulExit</key>
    <false/>
</dict>
```

This restarts only on non-zero exit (crash), not clean shutdown.

### WorkingDirectory

Must be set so relative paths in the service work correctly.

### EnvironmentVariables

Secrets like API keys can be set here. They're only readable by the user.

## Troubleshooting

### Service won't start

Check log files for errors:

```bash
cat ~/machina/logs/gateway.error.log
```

Common issues:

- Wrong path to bun or binary
- Missing environment variables
- Permission denied

### Service keeps restarting

If KeepAlive causes restart loop:

1. Check logs for crash reason
2. Temporarily unload: `launchctl unload ...`
3. Fix the issue
4. Reload

### "Service already loaded"

```bash
launchctl unload ~/Library/LaunchAgents/com.machina.gateway.plist 2>/dev/null
launchctl load ~/Library/LaunchAgents/com.machina.gateway.plist
```

### Finding the Bun Path

```bash
which bun
# Usually: /Users/USER/.bun/bin/bun
# Or: /opt/homebrew/bin/bun
```

Use the full path in the plist.
