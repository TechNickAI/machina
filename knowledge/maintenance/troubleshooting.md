# Troubleshooting

Common issues and how to resolve them.

## Service Issues

### Gateway not responding

Check if service is running (LaunchD status). Check error logs. Try starting manually
to see error output.

### Service keeps crashing

Check error logs. Common causes: missing token, wrong path, port in use, dependency
not installed.

For port conflicts, check what's using port 8080.

### WhatsApp disconnected

Check WhatsApp logs for "disconnected" or "session expired". May need to re-authenticate:
stop bridge, delete `store/` directory, start bridge, scan new QR code.

## Permission Issues

### "Not authorized to send Apple events"

Automation permission not granted. System Preferences → Privacy & Security → Automation.
Find the app running machina and enable checkboxes for target apps.

### "Operation not permitted" for database

Full Disk Access not granted. System Preferences → Privacy & Security → Full Disk Access.
Add Terminal or the app running machina. Restart the app after granting.

## Installation Issues

### Package not found

Install with Homebrew: Bun, Go, Python, ffmpeg.

### Build fails

Update the package manager. Clear caches. Check dependency versions.

## Network Issues

### Can't reach from Tailscale

Check Tailscale is connected on both devices. Verify gateway is listening on `0.0.0.0`
not just localhost. Check firewall isn't blocking port 8080.

### Token rejected

Verify token matches what gateway was started with. Check for trailing whitespace in
.env file. Restart gateway after changing token.

## Update Issues

### Git pull fails

Stash local changes, pull, reapply. For unresolvable conflicts, reset to remote.

### Component update breaks things

Rollback to previous commit. Reinstall dependencies. Restart service.

## Diagnostic Approach

1. Check service status (LaunchD)
2. Read error logs
3. Try running manually to see output
4. Verify permissions
5. Check network connectivity

## Getting Help

Gather diagnostics:

- macOS version
- Error logs
- Service status
- What you tried

Open issue at https://github.com/TechNickAI/machina/issues
