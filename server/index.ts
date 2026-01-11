#!/usr/bin/env bun
/**
 * Machina MCP Gateway
 *
 * Exposes Mac capabilities via Streamable HTTP MCP transport.
 * Uses progressive disclosure pattern - one gateway tool with action/params.
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

// Operation definitions with full help metadata
interface OperationParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: any;
}

interface Operation {
  name: string;
  description: string;
  parameters: OperationParam[];
  returns: string;
  example?: string;
}

const operations: Operation[] = [
  {
    name: "contacts_search",
    description: "Search for contacts by name",
    parameters: [
      {
        name: "name",
        type: "string",
        required: true,
        description: "Name to search for",
      },
    ],
    returns: "List of matching contacts with phone numbers",
    example: "contacts_search({name: 'John'})",
  },
  {
    name: "messages_unread",
    description: "Get recent iMessages",
    parameters: [
      {
        name: "limit",
        type: "number",
        required: false,
        description: "Max messages to return",
        default: 10,
      },
    ],
    returns: "Recent messages with date, sender, and text",
    example: "messages_unread({limit: 5})",
  },
  {
    name: "messages_send",
    description: "Send an iMessage",
    parameters: [
      {
        name: "to",
        type: "string",
        required: true,
        description: "Phone number or email to send to",
      },
      {
        name: "message",
        type: "string",
        required: true,
        description: "Message text",
      },
    ],
    returns: "Confirmation message",
    example: "messages_send({to: '+15551234567', message: 'Hello!'})",
  },
  {
    name: "messages_read",
    description: "Read recent messages from a specific contact",
    parameters: [
      {
        name: "contact",
        type: "string",
        required: true,
        description: "Phone number or name",
      },
      {
        name: "limit",
        type: "number",
        required: false,
        description: "Max messages",
        default: 10,
      },
    ],
    returns: "Messages with date, sender (Me or contact), and text",
    example: "messages_read({contact: '+15551234567', limit: 20})",
  },
  {
    name: "calendar_list",
    description: "List upcoming calendar events",
    parameters: [
      {
        name: "days",
        type: "number",
        required: false,
        description: "Days ahead to look",
        default: 7,
      },
    ],
    returns: "List of events with title and start time",
    example: "calendar_list({days: 14})",
  },
  {
    name: "notes_list",
    description: "List recent notes",
    parameters: [
      {
        name: "limit",
        type: "number",
        required: false,
        description: "Max notes to return",
        default: 10,
      },
    ],
    returns: "List of note titles",
    example: "notes_list({limit: 5})",
  },
  {
    name: "reminders_list",
    description: "List reminders",
    parameters: [
      {
        name: "includeCompleted",
        type: "boolean",
        required: false,
        description: "Include completed reminders",
        default: false,
      },
    ],
    returns: "Reminders grouped by list",
    example: "reminders_list({includeCompleted: true})",
  },
];

// Generate describe output
function describeAll(): string {
  const lines = ["Available operations for Machina:\n"];
  for (const op of operations) {
    const requiredParams = op.parameters
      .filter((p) => p.required)
      .map((p) => p.name)
      .join(", ");
    lines.push(
      `**${op.name}**${requiredParams ? `(${requiredParams})` : ""} - ${op.description}`,
    );
  }
  lines.push(
    "\nCall with action='describe', params={operation: 'name'} for detailed docs.",
  );
  return lines.join("\n");
}

function describeOperation(opName: string): string {
  const op = operations.find((o) => o.name === opName);
  if (!op) {
    return `Unknown operation: ${opName}\n\nAvailable: ${operations.map((o) => o.name).join(", ")}`;
  }

  const lines = [`**${op.name}**\n${op.description}\n`];

  if (op.parameters.length > 0) {
    lines.push("Parameters:");
    for (const p of op.parameters) {
      const req = p.required ? "required" : `optional, default: ${p.default}`;
      lines.push(`  - ${p.name} (${p.type}, ${req}): ${p.description}`);
    }
  }

  lines.push(`\nReturns: ${op.returns}`);
  if (op.example) {
    lines.push(`\nExample: ${op.example}`);
  }

  return lines.join("\n");
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

// Operation handlers
async function executeOperation(
  action: string,
  params: Record<string, any>,
): Promise<string> {
  switch (action) {
    case "contacts_search": {
      if (!params.name) throw new Error("Missing required parameter: name");
      const script = `tell application "Contacts"
        set matchingPeople to (every person whose name contains "${params.name}")
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
      const limit = params.limit || 10;
      const { stdout } = await execAsync(
        `sqlite3 ~/Library/Messages/chat.db "SELECT datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') as date, h.id as sender, m.text FROM message m LEFT JOIN handle h ON m.handle_id = h.ROWID WHERE m.text IS NOT NULL ORDER BY m.date DESC LIMIT ${limit}"`,
      );
      return stdout.trim() || "No recent messages found";
    }

    case "messages_send": {
      if (!params.to) throw new Error("Missing required parameter: to");
      if (!params.message)
        throw new Error("Missing required parameter: message");
      const script = `tell application "Messages"
        set targetService to 1st account whose service type = iMessage
        set targetBuddy to participant "${params.to}" of targetService
        send "${params.message.replace(/"/g, '\\"')}" to targetBuddy
        return "Message sent to ${params.to}"
      end tell`;
      return await runAppleScript(script);
    }

    case "messages_read": {
      if (!params.contact)
        throw new Error("Missing required parameter: contact");
      const limit = params.limit || 10;
      const { stdout } = await execAsync(
        `sqlite3 ~/Library/Messages/chat.db "SELECT datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') as date, CASE WHEN m.is_from_me THEN 'Me' ELSE h.id END as sender, m.text FROM message m LEFT JOIN handle h ON m.handle_id = h.ROWID WHERE h.id LIKE '%${params.contact}%' AND m.text IS NOT NULL ORDER BY m.date DESC LIMIT ${limit}"`,
      );
      return stdout.trim() || `No messages found for ${params.contact}`;
    }

    case "calendar_list": {
      const days = params.days || 7;
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
      const limit = params.limit || 10;
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
          set rems to reminders of l whose completed is ${params.includeCompleted ? "true" : "false"}
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
      throw new Error(
        `Unknown operation: ${action}\n\nAvailable: ${operations.map((o) => o.name).join(", ")}`,
      );
  }
}

// Handle the machina gateway tool
async function handleMachinaTool(args: Record<string, any>): Promise<string> {
  const action = args.action as string;
  const params = (args.params || {}) as Record<string, any>;

  if (!action) {
    return describeAll();
  }

  if (action === "describe") {
    if (params.operation) {
      return describeOperation(params.operation);
    }
    return describeAll();
  }

  return await executeOperation(action, params);
}

// Single gateway tool with progressive disclosure
const tools = [
  {
    name: "machina",
    description:
      "Access Mac capabilities (Messages, Contacts, Calendar, Notes, Reminders). " +
      "Top operations: messages_unread, messages_send(to, message), contacts_search(name) +4 more",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Operation to execute, or 'describe' for help",
        },
        params: {
          type: "object",
          description: "Parameters for the operation",
        },
      },
      required: ["action"],
    },
  },
];

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
    console.log("Listing tools (progressive disclosure: 1 gateway tool)");
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    console.log(`Tool call: ${name}, action: ${args?.action || "none"}`);

    if (name !== "machina") {
      return {
        content: [
          { type: "text", text: `Unknown tool: ${name}. Use 'machina' tool.` },
        ],
        isError: true,
      };
    }

    try {
      const result = await handleMachinaTool(args || {});
      console.log(`Result preview: ${result.slice(0, 100)}...`);
      return {
        content: [{ type: "text", text: result }],
      };
    } catch (error: any) {
      console.error(`Error:`, error.message);
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
  console.log(
    `\nProgressive disclosure: 1 gateway tool with ${operations.length} operations`,
  );
  console.log(`Operations: ${operations.map((o) => o.name).join(", ")}`);
});
