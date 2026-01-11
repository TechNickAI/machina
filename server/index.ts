#!/usr/bin/env bun
/**
 * Machina MCP Gateway
 *
 * Exposes Mac capabilities via Streamable HTTP MCP transport.
 * Directly executes AppleScript for Apple services.
 *
 * Environment:
 *   MACHINA_TOKEN - Required bearer token for auth
 *   MACHINA_PORT  - Port to listen on (default: 8080)
 */

import express, { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  isInitializeRequest,
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const execAsync = promisify(exec);

const PORT = parseInt(process.env.MACHINA_PORT || "8080", 10);
const TOKEN = process.env.MACHINA_TOKEN;

if (!TOKEN) {
  console.error("MACHINA_TOKEN environment variable is required");
  process.exit(1);
}

// Run AppleScript and return result
async function runAppleScript(script: string): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `osascript -e '${script.replace(/'/g, "'\"'\"'")}'`,
    );
    return stdout.trim();
  } catch (error: any) {
    throw new Error(`AppleScript error: ${error.message}`);
  }
}

// Tool definitions
const tools = [
  {
    name: "contacts_search",
    description: "Search for contacts by name",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name to search for" },
      },
      required: ["name"],
    },
  },
  {
    name: "messages_unread",
    description: "Get unread iMessages",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Max messages to return",
          default: 10,
        },
      },
    },
  },
  {
    name: "messages_send",
    description: "Send an iMessage",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Phone number or email to send to" },
        message: { type: "string", description: "Message text" },
      },
      required: ["to", "message"],
    },
  },
  {
    name: "messages_read",
    description: "Read recent messages from a contact",
    inputSchema: {
      type: "object",
      properties: {
        contact: { type: "string", description: "Phone number or name" },
        limit: { type: "number", description: "Max messages", default: 10 },
      },
      required: ["contact"],
    },
  },
  {
    name: "calendar_list",
    description: "List upcoming calendar events",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Days ahead to look", default: 7 },
      },
    },
  },
  {
    name: "notes_list",
    description: "List recent notes",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max notes", default: 10 },
      },
    },
  },
  {
    name: "reminders_list",
    description: "List reminders",
    inputSchema: {
      type: "object",
      properties: {
        includeCompleted: {
          type: "boolean",
          description: "Include completed",
          default: false,
        },
      },
    },
  },
];

// Tool handlers
async function handleTool(
  name: string,
  args: Record<string, any>,
): Promise<string> {
  switch (name) {
    case "contacts_search": {
      const script = `tell application "Contacts"
        set matchingPeople to (every person whose name contains "${args.name}")
        set results to {}
        repeat with p in matchingPeople
          set pName to name of p
          set pPhones to {}
          repeat with ph in phones of p
            set end of pPhones to value of ph
          end repeat
          set end of results to pName & ": " & (pPhones as text)
        end repeat
        return results as text
      end tell`;
      return await runAppleScript(script);
    }

    case "messages_unread": {
      const limit = args.limit || 10;
      // Use sqlite to read messages directly - more reliable than AppleScript
      const { stdout } = await execAsync(
        `sqlite3 ~/Library/Messages/chat.db "SELECT datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') as date, h.id as sender, m.text FROM message m LEFT JOIN handle h ON m.handle_id = h.ROWID WHERE m.text IS NOT NULL ORDER BY m.date DESC LIMIT ${limit}"`,
      );
      return stdout.trim() || "No recent messages found";
    }

    case "messages_send": {
      const script = `tell application "Messages"
        set targetService to 1st account whose service type = iMessage
        set targetBuddy to participant "${args.to}" of targetService
        send "${args.message.replace(/"/g, '\\"')}" to targetBuddy
        return "Message sent to ${args.to}"
      end tell`;
      return await runAppleScript(script);
    }

    case "messages_read": {
      const limit = args.limit || 10;
      // Use sqlite to read messages from specific contact
      const { stdout } = await execAsync(
        `sqlite3 ~/Library/Messages/chat.db "SELECT datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') as date, CASE WHEN m.is_from_me THEN 'Me' ELSE h.id END as sender, m.text FROM message m LEFT JOIN handle h ON m.handle_id = h.ROWID WHERE h.id LIKE '%${args.contact}%' AND m.text IS NOT NULL ORDER BY m.date DESC LIMIT ${limit}"`,
      );
      return stdout.trim() || `No messages found for ${args.contact}`;
    }

    case "calendar_list": {
      const days = args.days || 7;
      const script = `tell application "Calendar"
        set startDate to current date
        set endDate to startDate + (${days} * days)
        set eventList to {}
        repeat with cal in calendars
          set events to (every event of cal whose start date >= startDate and start date <= endDate)
          repeat with e in events
            set evtTitle to summary of e
            set evtStart to start date of e
            set end of eventList to evtTitle & " - " & evtStart
          end repeat
        end repeat
        return eventList as text
      end tell`;
      return await runAppleScript(script);
    }

    case "notes_list": {
      const limit = args.limit || 10;
      const script = `tell application "Notes"
        set noteList to {}
        set allNotes to notes
        set noteCount to count of allNotes
        if noteCount > ${limit} then set noteCount to ${limit}
        repeat with i from 1 to noteCount
          set n to item i of allNotes
          set noteTitle to name of n
          set end of noteList to noteTitle
        end repeat
        return noteList as text
      end tell`;
      return await runAppleScript(script);
    }

    case "reminders_list": {
      const script = `tell application "Reminders"
        set reminderList to {}
        repeat with l in lists
          set rems to reminders of l whose completed is ${args.includeCompleted ? "true" : "false"}
          repeat with r in rems
            set remName to name of r
            set remList to name of l
            set end of reminderList to remList & ": " & remName
          end repeat
        end repeat
        return reminderList as text
      end tell`;
      return await runAppleScript(script);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
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
  { transport: StreamableHTTPServerTransport; server: Server }
> = {};

// Create MCP server
function createServer(): Server {
  const server = new Server(
    { name: "machina", version: "1.0.0" },
    { capabilities: { tools: { listChanged: false } } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.log("Listing tools");
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    console.log(`Calling tool ${name} with args:`, JSON.stringify(args));

    try {
      const result = await handleTool(name, args || {});
      console.log(`Tool ${name} result:`, result.slice(0, 200));
      return {
        content: [{ type: "text", text: result }],
      };
    } catch (error: any) {
      console.error(`Tool ${name} error:`, error.message);
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

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
      const { transport } = sessions[sessionId];
      await transport.handleRequest(req, res, req.body);
    } else if (!sessionId && isInitializeRequest(req.body)) {
      const server = createServer();

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions[id] = { transport, server };
          console.log(`Session initialized: ${id}`);
        },
        onsessionclosed: (id) => {
          delete sessions[id];
          console.log(`Session closed: ${id}`);
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          delete sessions[transport.sessionId];
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
  console.log(`\nAvailable tools: ${tools.map((t) => t.name).join(", ")}`);
});
