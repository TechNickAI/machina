# Tailscale Setup

Enable secure remote access to Machina via Tailscale.

## Prerequisites

- Tailscale installed and connected
- Machina gateway running on port 9900

## Enable Tailscale Serve

Tailscale Serve provides HTTPS termination for your MCP server.

```bash
tailscale serve https:443 / http://127.0.0.1:9900
```

If you see "Serve is not enabled on your tailnet", visit the provided URL to enable it
in your Tailscale admin console.

## Verify

Check serve status:

```bash
tailscale serve status
```

Should show:

```
https://<your-hostname>.ts.net/ (Funnel off)
|-- / proxy http://127.0.0.1:9900
```

## Test Remote Access

From another device on your Tailscale network:

```bash
curl https://<your-hostname>.ts.net/health
```

Should return `{"status":"ok","version":"..."}` with current version.

## Public Access (Optional)

If you need access from outside your Tailscale network, enable Funnel:

```bash
tailscale funnel https:443 / http://127.0.0.1:9900
```

This exposes your MCP server publicly. The bearer token provides authentication.

## Security Notes

- HTTP over Tailscale is already encrypted (WireGuard)
- Tailscale Serve adds HTTPS for compatibility with clients that require it
- Bearer token authentication protects the MCP endpoint
- Tailscale ACLs can further restrict which devices can access the server
