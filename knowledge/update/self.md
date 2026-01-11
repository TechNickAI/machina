# Self-Update (Scheduled)

Automatic update of Machina knowledge repo via LaunchD schedule.

## Purpose

Keep Machina current without manual intervention. Runs nightly, pulls latest knowledge,
optionally triggers full update if changes detected.

## LaunchD Job

Create `~/Library/LaunchAgents/com.machina.selfupdate.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.machina.selfupdate</string>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-c</string>
        <string>cd ~/machina && git fetch origin && git diff --quiet HEAD origin/main || claude -p 'Updates available. Run update procedure.' ~/machina</string>
    </array>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>3</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>/Users/USER/machina/logs/selfupdate.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/USER/machina/logs/selfupdate.error.log</string>
</dict>
</plist>
```

## How It Works

1. **3am daily**: LaunchD triggers the job
2. **Fetch**: `git fetch origin` gets latest without applying
3. **Check**: `git diff --quiet HEAD origin/main` checks for differences
4. **If changes**: Invoke Claude to run update
5. **If no changes**: Exit silently

## Load the Job

```bash
launchctl load ~/Library/LaunchAgents/com.machina.selfupdate.plist
```

## Test Manually

```bash
cd ~/machina
git fetch origin
git diff --quiet HEAD origin/main && echo "No updates" || echo "Updates available"
```

## Monitoring

Check if self-update is running:

```bash
# Last update check
ls -la ~/machina/logs/selfupdate.log

# View log
cat ~/machina/logs/selfupdate.log
```

## Disable Self-Update

```bash
launchctl unload ~/Library/LaunchAgents/com.machina.selfupdate.plist
```

## Alternative: Simple Pull Only

If you prefer manual control over when Claude runs, just pull knowledge:

```xml
<key>ProgramArguments</key>
<array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>cd ~/machina && git pull origin main</string>
</array>
```

This updates the knowledge but doesn't run Claude to apply component updates.
Next time user opens Claude, they see the new knowledge.

## Notification on Update

Add to the script:

```bash
# After successful update
osascript -e 'display notification "Machina updated to version X.Y.Z" with title "Machina"'
```

Or send via the gateway to notify cloud AI.
