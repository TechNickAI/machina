#!/usr/bin/env bun
/**
 * Machina MCP Gateway
 *
 * Exposes Mac capabilities via Streamable HTTP MCP transport.
 * Proxies to apple-mcp (stdio) and WhatsApp bridge (HTTP).
 *
 * Environment:
 *   MACHINA_TOKEN - Required bearer token for auth
 *   MACHINA_PORT  - Port to listen on (default: 8080)
 */

import express, { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { spawn, ChildProcess } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

const PORT = parseInt(process.env.MACHINA_PORT || "8080", 10);
const TOKEN = process.env.MACHINA_TOKEN;

if (!TOKEN) {
  console.error("MACHINA_TOKEN environment variable is required");
  process.exit(1);
}

// Bearer token auth middleware
function authenticate(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ") || auth.slice(7) !== TOKEN) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null,
    });
    return;
  }
  next();
}

// Session management
const sessions: Record<
  string,
  {
    transport: StreamableHTTPServerTransport;
    server: McpServer;
    appleClient?: Client;
    appleProcess?: ChildProcess;
  }
> = {};

// Initialize apple-mcp client for a session
async function initAppleClient(): Promise<{
  client: Client;
  process: ChildProcess;
}> {
  const proc = spawn("bunx", ["apple-mcp"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const transport = new StdioClientTransport({
    command: "bunx",
    args: ["apple-mcp"],
  });

  const client = new Client({ name: "machina-gateway", version: "1.0.0" });
  await client.connect(transport);

  return { client, process: proc };
}

// Create MCP server with proxied tools
async function createServer(appleClient: Client): Promise<McpServer> {
  const server = new McpServer({
    name: "machina",
    version: "1.0.0",
  });

  // Get tools from apple-mcp and register them
  const { tools } = await appleClient.listTools();

  for (const tool of tools) {
    server.tool(
      tool.name,
      tool.description || "",
      tool.inputSchema as Record<string, unknown>,
      async (args) => {
        const result = await appleClient.callTool({
          name: tool.name,
          arguments: args,
        });
        return result;
      },
    );
  }

  // TODO: Add WhatsApp tools (proxy to localhost:3001)

  return server;
}

// Express app
const app = express();
app.use(express.json());

// Health check (no auth required)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", version: "1.0.0" });
});

// MCP endpoint
app.post("/mcp", authenticate, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  try {
    if (sessionId && sessions[sessionId]) {
      // Reuse existing session
      const { transport } = sessions[sessionId];
      await transport.handleRequest(req, res, req.body);
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New session
      const { client: appleClient, process: appleProcess } =
        await initAppleClient();
      const server = await createServer(appleClient);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions[id] = { transport, server, appleClient, appleProcess };
          console.log(`Session initialized: ${id}`);
        },
        onsessionclosed: (id) => {
          const session = sessions[id];
          if (session) {
            session.appleProcess?.kill();
            delete sessions[id];
          }
          console.log(`Session closed: ${id}`);
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          const session = sessions[transport.sessionId];
          if (session) {
            session.appleProcess?.kill();
            delete sessions[transport.sessionId];
          }
        }
      };

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid session" },
        id: null,
      });
    }
  } catch (error) {
    console.error("MCP error:", error);
    res.status(500).json({
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal error" },
      id: null,
    });
  }
});

// SSE endpoint for notifications (GET)
app.get("/mcp", authenticate, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  const session = sessions[sessionId];

  if (session) {
    await session.transport.handleRequest(req, res);
  } else {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Invalid session" },
      id: null,
    });
  }
});

// Session termination (DELETE)
app.delete("/mcp", authenticate, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  const session = sessions[sessionId];

  if (session) {
    await session.transport.handleRequest(req, res);
  } else {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Invalid session" },
      id: null,
    });
  }
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Machina MCP gateway running on http://0.0.0.0:${PORT}`);
  console.log(`MCP endpoint: POST /mcp`);
  console.log(`Health check: GET /health`);
});
