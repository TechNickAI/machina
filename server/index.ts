#!/usr/bin/env bun
/**
 * Machina MCP Gateway
 *
 * Exposes Mac capabilities via stateless MCP over HTTP.
 * Uses progressive disclosure pattern - one gateway tool with action/params.
 *
 * Stateless mode: No sessions required. Each request is independent.
 * Simple curl testing: POST /mcp with JSON-RPC body, get JSON response.
 *
 * Environment:
 *   MACHINA_TOKEN - Required bearer token for auth
 *   MACHINA_PORT  - Port to listen on (default: 8080)
 */

import express, { Request, Response, NextFunction } from "express";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");
const VERSION = pkg.version;
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const execAsync = promisify(exec);

const PORT = parseInt(process.env.MACHINA_PORT || "9900", 10);

// AppleScript timeout configuration (ms)
const APPLESCRIPT_TIMEOUT = 10_000; // 10s for normal operations
const REMINDERS_TIMEOUT = 45_000; // 45s for Reminders (iCloud sync is slow)
const PERMISSION_CHECK_TIMEOUT = 3_000; // 3s for permission checks

// Permission cache: tracks which apps have been verified this session
const permissionCache = new Map<string, boolean>();
const TOKEN = process.env.MACHINA_TOKEN;

if (!TOKEN) {
  console.error("MACHINA_TOKEN environment variable is required");
  process.exit(1);
}

// Concurrency guard for system_update
let updateInProgress = false;

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
  // ============== MESSAGES ==============
  {
    name: "messages_send",
    description:
      "Send an iMessage to a contact. Accepts contact name, phone number, or email. " +
      "Returns disambiguation options if multiple contacts match.",
    parameters: [
      {
        name: "to",
        type: "string",
        required: true,
        description:
          "Recipient: name ('John'), phone number ('+15551234567'), or email. " +
          "If multiple contacts match a name, returns options to choose from.",
      },
      {
        name: "message",
        type: "string",
        required: true,
        description: "Message text to send",
      },
    ],
    returns: "Structured response: success confirmation or disambiguation options",
    example: "machina(action='messages_send', params={to: 'Mom', message: 'Hello!'})",
  },
  {
    name: "messages_read",
    description: "Read recent messages from a specific contact or conversation",
    parameters: [
      {
        name: "contact",
        type: "string",
        required: true,
        description: "Phone number, email, or partial name to filter by",
      },
      {
        name: "limit",
        type: "number",
        required: false,
        description: "Maximum number of messages to return",
        default: 20,
      },
    ],
    returns: "Messages with timestamp, sender (Me or contact), and text",
    example: "machina(action='messages_read', params={contact: '+15551234567', limit: 50})",
  },
  {
    name: "messages_recent",
    description: "Get most recent messages across all conversations",
    parameters: [
      {
        name: "limit",
        type: "number",
        required: false,
        description: "Maximum number of messages to return",
        default: 20,
      },
    ],
    returns: "Recent messages with timestamp, sender, and text",
    example: "machina(action='messages_recent', params={limit: 10})",
  },
  {
    name: "messages_search",
    description: "Search messages by text content",
    parameters: [
      {
        name: "query",
        type: "string",
        required: true,
        description: "Text to search for in message content",
      },
      {
        name: "limit",
        type: "number",
        required: false,
        description: "Maximum number of results",
        default: 20,
      },
    ],
    returns: "Matching messages with timestamp, sender, and text",
    example: "machina(action='messages_search', params={query: 'meeting tomorrow', limit: 10})",
  },
  {
    name: "messages_conversations",
    description: "List all conversations/chats with recent activity",
    parameters: [
      {
        name: "limit",
        type: "number",
        required: false,
        description: "Maximum number of conversations to return",
        default: 20,
      },
    ],
    returns: "List of conversations with participant info and last message preview",
    example: "machina(action='messages_conversations', params={limit: 10})",
  },
  {
    name: "messages_conversation_context",
    description:
      "Get a conversation formatted for LLM analysis. Returns messages in a structured format " +
      "with clear identification of who sent each message (you vs others), conversation metadata, " +
      "and attachment references. Ideal for AI assistants analyzing message history.",
    parameters: [
      {
        name: "contact",
        type: "string",
        required: true,
        description: "Phone number, email, or contact name to get conversation for",
      },
      {
        name: "days",
        type: "number",
        required: false,
        description: "Number of days of history to include",
        default: 7,
      },
      {
        name: "limit",
        type: "number",
        required: false,
        description: "Maximum number of messages to return",
        default: 100,
      },
    ],
    returns: "JSON object with conversation metadata and messages array in LLM-friendly format",
    example: "machina(action='conversation_context', params={contact: '+15551234567', days: 7})",
  },
  {
    name: "messages_get_attachment",
    description: "Get details about a message attachment by ID",
    parameters: [
      {
        name: "id",
        type: "string",
        required: true,
        description: "Attachment ID (from conversation_context results)",
      },
    ],
    returns: "Attachment details including file path and MIME type",
    example: "machina(action='get_attachment', params={id: 'att_12345'})",
  },

  // ============== NOTES ==============
  {
    name: "notes_list",
    description: "List notes from Apple Notes",
    parameters: [
      {
        name: "folder",
        type: "string",
        required: false,
        description: "Folder name to list from (default: all folders)",
      },
      {
        name: "limit",
        type: "number",
        required: false,
        description: "Maximum number of notes to return",
        default: 20,
      },
    ],
    returns: "List of notes with title and folder",
    example: "machina(action='notes_list', params={limit: 10})",
  },
  {
    name: "notes_read",
    description: "Read the content of a specific note",
    parameters: [
      {
        name: "title",
        type: "string",
        required: true,
        description: "Title of the note to read (exact or partial match)",
      },
    ],
    returns: "Note content as plain text",
    example: "machina(action='notes_read', params={title: 'Meeting Notes'})",
  },
  {
    name: "notes_create",
    description: "Create a new note in Apple Notes",
    parameters: [
      {
        name: "title",
        type: "string",
        required: true,
        description: "Title for the new note",
      },
      {
        name: "body",
        type: "string",
        required: true,
        description: "Content of the note",
      },
      {
        name: "folder",
        type: "string",
        required: false,
        description: "Folder to create note in (default: Notes)",
        default: "Notes",
      },
    ],
    returns: "Confirmation with note title",
    example: "machina(action='notes_create', params={title: 'New Note', body: 'Content here'})",
  },
  {
    name: "notes_search",
    description: "Search notes by content or title",
    parameters: [
      {
        name: "query",
        type: "string",
        required: true,
        description: "Text to search for",
      },
      {
        name: "limit",
        type: "number",
        required: false,
        description: "Maximum number of results",
        default: 10,
      },
    ],
    returns: "Matching notes with title and preview",
    example: "machina(action='notes_search', params={query: 'project'})",
  },

  // ============== REMINDERS ==============
  {
    name: "reminders_list",
    description: "List reminders from Apple Reminders",
    parameters: [
      {
        name: "list",
        type: "string",
        required: false,
        description: "Specific list to show (default: all lists)",
      },
      {
        name: "includeCompleted",
        type: "boolean",
        required: false,
        description: "Include completed reminders",
        default: false,
      },
    ],
    returns: "Reminders grouped by list with due dates",
    example: "machina(action='reminders_list', params={includeCompleted: false})",
  },
  {
    name: "reminders_create",
    description: "Create a new reminder",
    parameters: [
      {
        name: "title",
        type: "string",
        required: true,
        description: "Reminder title/text",
      },
      {
        name: "list",
        type: "string",
        required: false,
        description: "List to add reminder to (default: Reminders)",
        default: "Reminders",
      },
      {
        name: "dueDate",
        type: "string",
        required: false,
        description: "Due date in ISO format (e.g., 2024-12-25T10:00:00)",
      },
      {
        name: "notes",
        type: "string",
        required: false,
        description: "Additional notes for the reminder",
      },
    ],
    returns: "Confirmation with reminder title",
    example: "machina(action='reminders_create', params={title: 'Call mom', list: 'Personal'})",
  },
  {
    name: "reminders_complete",
    description: "Mark a reminder as completed",
    parameters: [
      {
        name: "title",
        type: "string",
        required: true,
        description: "Title of the reminder to complete (exact or partial match)",
      },
      {
        name: "list",
        type: "string",
        required: false,
        description: "List the reminder is in (helps find exact match)",
      },
    ],
    returns: "Confirmation message",
    example: "machina(action='reminders_complete', params={title: 'Call mom'})",
  },

  // ============== CONTACTS ==============
  {
    name: "contacts_search",
    description: "Search for contacts by name",
    parameters: [
      {
        name: "name",
        type: "string",
        required: true,
        description: "Name to search for (partial match)",
      },
    ],
    returns: "List of matching contacts with phone numbers and emails",
    example: "machina(action='contacts_search', params={name: 'John'})",
  },
  {
    name: "contacts_get",
    description: "Get full details of a contact",
    parameters: [
      {
        name: "name",
        type: "string",
        required: true,
        description: "Exact or partial name of the contact",
      },
    ],
    returns: "Full contact details including phones, emails, addresses",
    example: "machina(action='contacts_get', params={name: 'John Smith'})",
  },

  // ============== RAW APPLESCRIPT ==============
  {
    name: "system_raw_applescript",
    description:
      "Execute arbitrary AppleScript. Use this escape hatch for operations not covered by standard actions. " +
      "Be careful - this runs code directly on the Mac.",
    parameters: [
      {
        name: "script",
        type: "string",
        required: true,
        description: "AppleScript code to execute",
      },
    ],
    returns: "AppleScript execution result",
    example:
      "machina(action='system_raw_applescript', params={script: 'tell application \"Finder\" to get name of startup disk'})",
  },

  // ============== SYSTEM ==============
  {
    name: "system_update",
    description:
      "Update Machina to latest version. Pulls latest code, updates dependencies, and reports changes. " +
      "Note: Requires server restart to apply changes.",
    parameters: [],
    returns: "Update status with list of changes",
    example: "machina(action='system_update')",
  },
  {
    name: "system_status",
    description: "Get current Machina version and system status",
    parameters: [],
    returns: "Version info, uptime, and health status",
    example: "machina(action='system_status')",
  },
  // ============== WHATSAPP ==============
  // WhatsApp uses JIDs (Jabber IDs) to identify users and groups:
  // - Individual: 15551234567@s.whatsapp.net (country code + number)
  // - Group: 120363023456789@g.us
  // Accepts names, phone numbers, or JIDs - automatic resolution with disambiguation
  {
    name: "whatsapp_send",
    description:
      "Send a WhatsApp message to a contact or group. Accepts contact name, phone number, or JID. " +
      "Returns disambiguation options if multiple contacts match.",
    parameters: [
      {
        name: "to",
        type: "string",
        required: true,
        description:
          "Recipient: name ('John'), phone number ('+15551234567'), or JID. " +
          "If multiple contacts match a name, returns options to choose from.",
      },
      {
        name: "message",
        type: "string",
        required: true,
        description: "Message text to send",
      },
    ],
    returns: "Structured response: success confirmation or disambiguation options",
    example: "machina(action='whatsapp_send', params={to: 'John', message: 'Hello!'})",
  },
  {
    name: "whatsapp_chats",
    description:
      "List WhatsApp conversations sorted by recent activity. Essential for discovering group JIDs " +
      "and seeing who you've been chatting with. Returns both individual and group chats.",
    parameters: [
      {
        name: "limit",
        type: "number",
        required: false,
        description: "Maximum number of chats to return",
        default: 20,
      },
      {
        name: "query",
        type: "string",
        required: false,
        description: "Filter by chat name or JID",
      },
    ],
    returns: "List of chats with name, JID, and last message time",
    example: "machina(action='whatsapp_chats', params={limit: 10})",
  },
  {
    name: "whatsapp_messages",
    description:
      "Read messages from a specific WhatsApp chat. Accepts contact name, phone number, or JID. " +
      "Returns messages in chronological order with sender identification.",
    parameters: [
      {
        name: "contact",
        type: "string",
        required: true,
        description:
          "Contact name, phone number, or JID (e.g., 'John', '(831) 334-6265', '15551234567@s.whatsapp.net')",
      },
      {
        name: "limit",
        type: "number",
        required: false,
        description: "Maximum number of messages to return",
        default: 20,
      },
    ],
    returns: "Messages with timestamp, sender (Me or contact name), and content",
    example: "machina(action='whatsapp_messages', params={contact: 'John', limit: 50})",
  },
  {
    name: "whatsapp_search",
    description:
      "Search across all WhatsApp messages by text content. Returns matching messages with " +
      "conversation context (chat name, sender). Useful for finding specific discussions or topics.",
    parameters: [
      {
        name: "query",
        type: "string",
        required: true,
        description: "Text to search for in message content",
      },
      {
        name: "limit",
        type: "number",
        required: false,
        description: "Maximum number of results",
        default: 20,
      },
    ],
    returns: "Matching messages with timestamp, sender, chat name, and content",
    example: "machina(action='whatsapp_search', params={query: 'meeting tomorrow', limit: 10})",
  },
  {
    name: "whatsapp_contacts",
    description:
      "Search WhatsApp contacts to find someone's JID. This is how you discover who you can message. " +
      "Search by name or phone number. Returns JIDs that can be used with whatsapp_send and whatsapp_messages.",
    parameters: [
      {
        name: "query",
        type: "string",
        required: true,
        description: "Name or phone number to search for",
      },
      {
        name: "limit",
        type: "number",
        required: false,
        description: "Maximum number of results",
        default: 20,
      },
    ],
    returns: "List of contacts with name and JID (use JID for messaging)",
    example: "machina(action='whatsapp_contacts', params={query: 'John Smith', limit: 10})",
  },
  {
    name: "whatsapp_chat_context",
    description:
      "Get a WhatsApp conversation formatted for LLM analysis. Accepts contact name, phone, or JID. " +
      "Returns messages with clear identification of who sent each message (you vs others), " +
      "conversation metadata, and message counts. Ideal for AI assistants analyzing message history.",
    parameters: [
      {
        name: "contact",
        type: "string",
        required: true,
        description:
          "Contact name, phone number, or JID (e.g., 'John', '(831) 334-6265', '15551234567@s.whatsapp.net')",
      },
      {
        name: "days",
        type: "number",
        required: false,
        description: "Number of days of history to include",
        default: 7,
      },
      {
        name: "limit",
        type: "number",
        required: false,
        description: "Maximum number of messages to return",
        default: 100,
      },
    ],
    returns: "JSON object with conversation metadata and messages array in LLM-friendly format",
    example: "machina(action='whatsapp_chat_context', params={contact: 'John', days: 7})",
  },
  {
    name: "whatsapp_status",
    description:
      "Check WhatsApp connection status. Use before sending messages to verify the service is connected, " +
      "or to diagnose issues when sends fail. Shows connected user info.",
    parameters: [],
    returns: "Connection status (connected/disconnected) and logged-in user info",
    example: "machina(action='whatsapp_status')",
  },
  {
    name: "whatsapp_raw_sql",
    description:
      "Execute a raw SQL query against the WhatsApp database (READ-ONLY). " +
      "For advanced queries not covered by standard operations. " +
      "Tables: chats, messages, contacts. See knowledge/reference/whatsapp-mcp-ts.md for schema.",
    parameters: [
      {
        name: "sql",
        type: "string",
        required: true,
        description: "SELECT query to execute (INSERT/UPDATE/DELETE not allowed)",
      },
    ],
    returns: "Query results as JSON array",
    example:
      "machina(action='whatsapp_raw_sql', params={sql: 'SELECT COUNT(*) as total FROM messages'})",
  },
];

// ============================================================================
// SERVICE DEFINITIONS (single gateway tool pattern like MCP Hubby)
// ============================================================================

interface ServiceDef {
  name: string;
  displayName: string;
  description: string;
  prefix: string;
}

const services: ServiceDef[] = [
  {
    name: "messages",
    displayName: "Apple Messages",
    description: "Read and send iMessages via Apple Messages app",
    prefix: "messages_",
  },
  {
    name: "whatsapp",
    displayName: "WhatsApp",
    description: "Send and read WhatsApp messages. Use contacts/chats to discover JIDs first.",
    prefix: "whatsapp_",
  },
  {
    name: "notes",
    displayName: "Apple Notes",
    description: "Read and create notes in Apple Notes app",
    prefix: "notes_",
  },
  {
    name: "reminders",
    displayName: "Apple Reminders",
    description: "Create and manage Apple Reminders",
    prefix: "reminders_",
  },
  {
    name: "contacts",
    displayName: "Apple Contacts",
    description: "Search and view Apple Contacts",
    prefix: "contacts_",
  },
  {
    name: "system",
    displayName: "System",
    description: "Update Machina server and check status",
    prefix: "system_",
  },
];

function getServiceOperations(service: ServiceDef): Operation[] {
  return operations.filter((o) => o.name.startsWith(service.prefix));
}

function stripPrefix(opName: string, prefix: string): string {
  return opName.startsWith(prefix) ? opName.slice(prefix.length) : opName;
}

// Convert dot-notation ("whatsapp.chats") to internal operation name ("whatsapp_chats")
function fromDotNotation(dotAction: string): string | null {
  const dotIndex = dotAction.indexOf(".");
  if (dotIndex === -1) return null;

  const serviceName = dotAction.slice(0, dotIndex);
  const opName = dotAction.slice(dotIndex + 1);

  const service = services.find((s) => s.name === serviceName);
  if (!service) return null;

  return service.prefix + opName;
}

// Service-specific workflow hints
const serviceWorkflows: Record<string, string[]> = {
  whatsapp: [
    "\nCommon workflows:",
    "  • Message someone by name: whatsapp.messages(contact='John')",
    "  • Message by phone: whatsapp.messages(contact='(831) 334-6265')",
    "  • Find contacts: whatsapp.contacts(query='name') → shows JIDs for messaging",
    "  • AI analysis: whatsapp.chat_context(contact='John', days=7) → rich conversation context",
    "\nFlexible input: Use contact names, phone numbers, or JIDs - all work.",
  ],
};

// Generate describe output for all services (full gateway describe)
function describeAllServices(): string {
  const lines = ["Available operations for Machina:\n"];

  for (const service of services) {
    const ops = getServiceOperations(service);
    lines.push(`**${service.displayName}** (${service.name}.*):`);

    for (const op of ops) {
      const shortName = stripPrefix(op.name, service.prefix);
      const requiredParams = op.parameters
        .filter((p) => p.required)
        .map((p) => p.name)
        .join(", ");
      lines.push(
        `  ${service.name}.${shortName}${requiredParams ? `(${requiredParams})` : ""} - ${op.description.split(".")[0]}`
      );
    }

    // Add service-specific workflow hints
    const workflows = serviceWorkflows[service.name];
    if (workflows) {
      lines.push(...workflows);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("Usage: machina(action='service.operation', params={...})");
  lines.push("Example: machina(action='whatsapp.chats', params={limit: 5})");
  lines.push("Tip: action='describe', params={operation: 'service.operation'} for detailed docs");
  return lines.join("\n");
}

// Generate describe output for a specific service
function describeService(service: ServiceDef): string {
  const ops = getServiceOperations(service);
  const lines = [`Available operations for ${service.displayName}:\n`];

  for (const op of ops) {
    const shortName = stripPrefix(op.name, service.prefix);
    const requiredParams = op.parameters
      .filter((p) => p.required)
      .map((p) => p.name)
      .join(", ");
    lines.push(
      `  ${service.name}.${shortName}${requiredParams ? `(${requiredParams})` : ""} - ${op.description.split(".")[0]}`
    );
  }

  // Add service-specific workflow hints
  const workflows = serviceWorkflows[service.name];
  if (workflows) {
    lines.push(...workflows);
  }

  lines.push("\n---");
  lines.push(`Usage: machina(action='${service.name}.operation', params={...})`);
  lines.push("Tip: action='describe', params={operation: 'name'} for detailed docs");
  return lines.join("\n");
}

function describeOperation(dotAction: string): string {
  // Check if it's a service name (e.g., "whatsapp" → describe whatsapp service)
  const service = services.find((s) => s.name === dotAction);
  if (service) {
    return describeService(service);
  }

  // Convert dot notation to internal name
  const internalName = fromDotNotation(dotAction);
  if (!internalName) {
    const available = services.map((s) => s.name).join(", ");
    return `Unknown operation: ${dotAction}\n\nExpected format: service.operation (e.g., whatsapp.chats)\nAvailable services: ${available}\nUse action='describe' to see all operations.`;
  }

  // Find the operation
  const op = operations.find((o) => o.name === internalName);
  if (!op) {
    const svc = services.find((s) => internalName.startsWith(s.prefix));
    if (svc) {
      const available = getServiceOperations(svc)
        .map((o) => `${svc.name}.${stripPrefix(o.name, svc.prefix)}`)
        .join(", ");
      return `Unknown operation: ${dotAction}\n\nAvailable for ${svc.displayName}: ${available}`;
    }
    return `Unknown operation: ${dotAction}`;
  }

  const lines = [`**${dotAction}**\n${op.description}\n`];

  if (op.parameters.length > 0) {
    lines.push("Parameters:");
    for (const p of op.parameters) {
      const req = p.required ? "required" : `optional, default: ${p.default}`;
      lines.push(`  - ${p.name} (${p.type}, ${req}): ${p.description}`);
    }
  }

  lines.push(`\nReturns: ${op.returns}`);
  lines.push(`\nUsage: machina(action='${dotAction}', params={...})`);

  return lines.join("\n");
}

// Generate MCP tools array (single gateway tool)
function generateTools() {
  // Count all operations
  let totalOps = 0;
  for (const service of services) {
    totalOps += getServiceOperations(service).length;
  }

  // Pick top operations for the description (most commonly used)
  const topOps = [
    "whatsapp.chats",
    "whatsapp.send(to, message)",
    "messages.recent",
    "messages.send(to, message)",
    "notes.list",
    "reminders.list",
  ];
  const remaining = totalOps - topOps.length;

  return [
    {
      name: "machina",
      description: `Access Mac apps (Messages, WhatsApp, Notes, Reminders, Contacts). Top operations: ${topOps.join(", ")} +${remaining} more. action='describe' for full list`,
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string" },
          params: { type: "object" },
        },
        required: ["action"],
      },
    },
  ];
}

// Escape string for AppleScript double-quoted strings
function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Escape string for SQL LIKE patterns (prevents SQL injection)
// Escapes: ' (quotes), % and _ (LIKE wildcards), \ (escape character)
function escapeSQL(str: string): string {
  return str
    .replace(/\\/g, "\\\\") // Backslash first to avoid double-escaping
    .replace(/'/g, "''")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

// Normalize phone number for matching (strips formatting)
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Handle US numbers with or without country code
  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  return digits;
}

// Format relative time ("5 minutes ago", "2 days ago")
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin === 1) return "1 minute ago";
  if (diffMin < 60) return `${diffMin} minutes ago`;
  if (diffHour === 1) return "1 hour ago";
  if (diffHour < 24) return `${diffHour} hours ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  if (diffDay < 30) {
    const weeks = Math.floor(diffDay / 7);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }
  if (diffDay < 365) {
    const months = Math.floor(diffDay / 30);
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }
  const years = Math.floor(diffDay / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

// Format chat age ("5 years, 3 months")
function formatChatAge(startDate: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - startDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 1) return "1 day";
  if (diffDays < 7) return `${diffDays} days`;

  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? "1 week" : `${weeks} weeks`;
  }

  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months !== 1 ? "s" : ""}`;
  }

  const years = Math.floor(diffDays / 365);
  const remainingDays = diffDays % 365;
  const months = Math.floor(remainingDays / 30);

  if (months === 0) return `${years} year${years !== 1 ? "s" : ""}`;
  return `${years} year${years !== 1 ? "s" : ""}, ${months} month${months !== 1 ? "s" : ""}`;
}

// Look up contact name from phone number or email via AppleScript
async function _lookupContact(identifier: string): Promise<string | null> {
  // Detect if this is an email or phone
  const isEmail = identifier.includes("@");

  if (isEmail) {
    // Look up by email
    const escapedEmail = escapeAppleScript(identifier);
    const script = `tell application "Contacts"
      set matchingPeople to {}
      repeat with p in people
        repeat with em in emails of p
          if value of em is "${escapedEmail}" then
            set end of matchingPeople to name of p
            exit repeat
          end if
        end repeat
        if (count of matchingPeople) > 0 then exit repeat
      end repeat
      if (count of matchingPeople) > 0 then
        return item 1 of matchingPeople
      else
        return ""
      end if
    end tell`;

    try {
      const result = await runAppleScript(script, "Contacts");
      return result.trim() || null;
    } catch {
      return null;
    }
  } else {
    // Look up by phone
    const normalized = normalizePhone(identifier);
    // Search by last 10 digits to handle country code variations
    const searchDigits = normalized.slice(-10);

    // Skip if no digits (e.g., identifier was already an email that got normalized to empty)
    if (!searchDigits) return null;

    const script = `tell application "Contacts"
      set matchingPeople to {}
      repeat with p in people
        repeat with ph in phones of p
          set phoneDigits to do shell script "echo " & quoted form of (value of ph) & " | tr -cd '0-9'"
          if phoneDigits ends with "${searchDigits}" then
            set end of matchingPeople to name of p
            exit repeat
          end if
        end repeat
        if (count of matchingPeople) > 0 then exit repeat
      end repeat
      if (count of matchingPeople) > 0 then
        return item 1 of matchingPeople
      else
        return ""
      end if
    end tell`;

    try {
      const result = await runAppleScript(script, "Contacts");
      return result.trim() || null;
    } catch {
      return null;
    }
  }
}

// Get attachment type from MIME type or filename
function getAttachmentType(mimeType: string | null, filename: string | null): string {
  if (mimeType) {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType === "application/pdf") return "pdf";
  }
  if (filename) {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "heic", "webp"].includes(ext || "")) return "image";
    if (["mp4", "mov", "m4v", "avi"].includes(ext || "")) return "video";
    if (["mp3", "m4a", "wav", "caf", "aac"].includes(ext || "")) return "audio";
    if (ext === "pdf") return "pdf";
  }
  return "file";
}

// Ensure an app is running before AppleScript can talk to it
async function ensureAppRunning(appName: string): Promise<void> {
  try {
    // Use 'open -a' which works even from background processes
    await execAsync(`open -a "${appName}" --background`);
    // Give the app a moment to start
    await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (_error) {
    // App might already be running or doesn't exist - continue anyway
  }
}

// Check if an app has automation permission (cached per session)
async function checkPermission(appName: string): Promise<void> {
  // Return immediately if already verified
  if (permissionCache.get(appName)) return;

  const script = `tell application "${appName}" to return 1`;
  try {
    await execAsync(`osascript -e '${script}'`, {
      timeout: PERMISSION_CHECK_TIMEOUT,
    });
    permissionCache.set(appName, true);
  } catch (error: any) {
    // Detect specific permission errors
    if (error.message?.includes("Not authorized")) {
      throw new Error(
        `Permission denied for ${appName}. Grant automation access:\n` +
          `System Settings → Privacy & Security → Automation → Enable ${appName}`
      );
    }
    if (error.killed || error.signal === "SIGTERM") {
      throw new Error(
        `Permission check timed out for ${appName} (${PERMISSION_CHECK_TIMEOUT / 1000}s).\n` +
          `This usually means a permission dialog is waiting for your response.\n` +
          `Check for a dialog on your Mac, or grant access in:\n` +
          `System Settings → Privacy & Security → Automation`
      );
    }
    throw new Error(`Permission check failed for ${appName}: ${error.message}`);
  }
}

// Run AppleScript and return result (with timeout)
async function runAppleScript(
  script: string,
  appName?: string,
  timeoutMs: number = APPLESCRIPT_TIMEOUT
): Promise<string> {
  // If an app is specified, check permission first (fast, cached)
  if (appName) {
    await checkPermission(appName);
    await ensureAppRunning(appName);
  }

  try {
    const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
      timeout: timeoutMs,
    });
    return stdout.trim();
  } catch (error: any) {
    // Handle timeout
    if (error.killed || error.signal === "SIGTERM") {
      throw new Error(
        `AppleScript timed out after ${timeoutMs / 1000}s.\n` +
          `This may indicate:\n` +
          `  • A permission dialog is waiting for your response\n` +
          `  • The operation is taking too long (try with fewer items)\n` +
          `  • The app is unresponsive`
      );
    }
    // Handle permission errors
    if (error.message?.includes("Not authorized")) {
      const app = appName || "the target app";
      throw new Error(
        `Permission denied for ${app}. Grant automation access:\n` +
          `System Settings → Privacy & Security → Automation`
      );
    }
    throw new Error(`AppleScript error: ${error.message}`);
  }
}

// SQLite query helper for Messages (returns pipe-delimited string)
async function _queryMessagesDB(sql: string): Promise<string> {
  const dbPath = `${process.env.HOME}/Library/Messages/chat.db`;
  let db;
  try {
    db = new Database(dbPath, { readonly: true });
    const rows = db.prepare(sql).all() as Record<string, unknown>[];
    // Return formatted output similar to sqlite3 CLI
    return rows.map((row) => Object.values(row).join("|")).join("\n");
  } catch (error: any) {
    throw new Error(`Messages database error: ${error.message}`);
  } finally {
    if (db) db.close();
  }
}

// SQLite query helper for Messages (returns objects)
function queryMessagesDBRows(sql: string): any[] {
  const dbPath = `${process.env.HOME}/Library/Messages/chat.db`;
  let db;
  try {
    db = new Database(dbPath, { readonly: true });
    return db.prepare(sql).all();
  } catch (error: any) {
    throw new Error(`Messages database error: ${error.message}`);
  } finally {
    if (db) db.close();
  }
}

// Contact resolution cache (phone/email → name)
// Builds a mapping of all contact phones/emails to names
let contactCache: Map<string, string> | null = null;
let contactCacheTime = 0;
const CONTACT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Build contact cache from Contacts SQLite database (much faster than AppleScript)
async function buildContactCache(): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  const addressBookDir = `${process.env.HOME}/Library/Application Support/AddressBook/Sources`;

  try {
    // Find all source databases with timeout to prevent blocking
    const { stdout: sources } = await Promise.race([
      execAsync(`ls -d "${addressBookDir}"/*/ 2>/dev/null || true`),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AddressBook access timeout")), 5000)
      ),
    ]);

    for (const sourceDir of sources.trim().split("\n").filter(Boolean)) {
      const dbPath = `${sourceDir}AddressBook-v22.abcddb`;
      let db;

      try {
        db = new Database(dbPath, { readonly: true });

        // Query phones with owner names
        const phoneRows = db
          .prepare(
            `SELECT p.ZFULLNUMBER as phone,
                    COALESCE(r.ZFIRSTNAME, '') || ' ' || COALESCE(r.ZLASTNAME, '') as name
             FROM ZABCDPHONENUMBER p
             JOIN ZABCDRECORD r ON p.ZOWNER = r.Z_PK
             WHERE p.ZFULLNUMBER IS NOT NULL`
          )
          .all() as { phone: string; name: string }[];

        for (const row of phoneRows) {
          const name = row.name.trim();
          if (name) {
            // Store both original and normalized
            cache.set(row.phone.toLowerCase().trim(), name);
            cache.set(normalizePhone(row.phone), name);
          }
        }

        // Query emails with owner names
        const emailRows = db
          .prepare(
            `SELECT e.ZADDRESSNORMALIZED as email,
                    COALESCE(r.ZFIRSTNAME, '') || ' ' || COALESCE(r.ZLASTNAME, '') as name
             FROM ZABCDEMAILADDRESS e
             JOIN ZABCDRECORD r ON e.ZOWNER = r.Z_PK
             WHERE e.ZADDRESSNORMALIZED IS NOT NULL`
          )
          .all() as { email: string; name: string }[];

        for (const row of emailRows) {
          const name = row.name.trim();
          if (name) {
            cache.set(row.email.toLowerCase().trim(), name);
          }
        }
      } catch {
        // Skip databases that can't be opened
      } finally {
        if (db) db.close();
      }
    }

    console.log(`Contact cache built: ${cache.size} entries`);
    return cache;
  } catch (error: any) {
    console.error("Failed to build contact cache:", error.message);
    return new Map();
  }
}

// Resolve a phone/email handle to a contact name
async function resolveHandleToName(handle: string): Promise<string> {
  // Refresh cache if expired
  if (!contactCache || Date.now() - contactCacheTime > CONTACT_CACHE_TTL) {
    contactCache = await buildContactCache();
    contactCacheTime = Date.now();
  }

  // Try exact match first
  const lowerHandle = handle.toLowerCase().trim();
  if (contactCache.has(lowerHandle)) {
    return contactCache.get(lowerHandle)!;
  }

  // Try normalized phone number match
  if (/^[\d\s\-()+ ]+$/.test(handle)) {
    const normalized = normalizePhone(handle);
    if (contactCache.has(normalized)) {
      return contactCache.get(normalized)!;
    }
  }

  // Return original handle if no match found
  return handle;
}

// Resolve multiple handles at once (more efficient)
async function resolveHandlesToNames(handles: string[]): Promise<Map<string, string>> {
  // Refresh cache if expired
  if (!contactCache || Date.now() - contactCacheTime > CONTACT_CACHE_TTL) {
    contactCache = await buildContactCache();
    contactCacheTime = Date.now();
  }

  const result = new Map<string, string>();
  for (const handle of handles) {
    result.set(handle, await resolveHandleToName(handle));
  }
  return result;
}

// Extract phone number from WhatsApp JID (e.g., "15551234567@s.whatsapp.net" → "+15551234567")
function phoneFromJid(jid: string): string | null {
  const match = jid.match(/^(\d+)@/);
  if (match) {
    return "+" + match[1];
  }
  return null;
}

// Result types for contact resolution
type ResolveResult =
  | { type: "found"; jid: string; name: string | null }
  | { type: "ambiguous"; matches: Array<{ jid: string; name: string | null }> }
  | { type: "not_found" };

// Resolve a contact identifier (name, phone, or JID) to a WhatsApp JID
// Returns ambiguous result if multiple matches found for name searches
async function resolveToWhatsAppJid(identifier: string): Promise<ResolveResult> {
  const trimmed = identifier.trim();

  // Already a JID? Return as-is (unambiguous)
  if (trimmed.includes("@s.whatsapp.net") || trimmed.includes("@g.us")) {
    const chatMeta = await queryWhatsAppDB(
      `SELECT name FROM chats WHERE jid = '${escapeSQL(trimmed)}'`
    );
    return { type: "found", jid: trimmed, name: chatMeta[0]?.name || null };
  }

  // Phone number? Convert to JID format (unambiguous)
  const isPhone = /^[\d\s\-()+ ]+$/.test(trimmed);
  if (isPhone) {
    const normalized = normalizePhone(trimmed);
    const jid = `${normalized}@s.whatsapp.net`;

    // Try exact match first
    let existing = await queryWhatsAppDB(`SELECT jid, name FROM chats WHERE jid = '${jid}'`);

    // If no exact match and input looks like it lacks country code (10 digits or less),
    // try last-10-digit fallback
    if (existing.length === 0 && normalized.length <= 10) {
      existing = await queryWhatsAppDB(
        `SELECT jid, name FROM chats WHERE jid LIKE '%${normalized.slice(-10)}@s.whatsapp.net'`
      );

      // If multiple matches, this is ambiguous
      if (existing.length > 1) {
        return {
          type: "ambiguous",
          matches: existing.map((row: any) => ({
            jid: row.jid,
            name: row.name,
          })),
        };
      }
    }

    if (existing.length > 0) {
      return { type: "found", jid: existing[0].jid, name: existing[0].name };
    }
    // No existing chat, but return the constructed JID anyway (for sending)
    return { type: "found", jid, name: null };
  }

  // Name search - check for multiple matches (potential ambiguity)
  const escaped = escapeSQL(trimmed);

  // Search WhatsApp contacts by name or notify field
  const contacts = await queryWhatsAppDB(
    `SELECT jid, name, notify FROM contacts
     WHERE name LIKE '%${escaped}%' ESCAPE '\\'
        OR notify LIKE '%${escaped}%' ESCAPE '\\'
     LIMIT 10`
  );

  // Search chats (includes groups)
  const chats = await queryWhatsAppDB(
    `SELECT jid, name FROM chats WHERE name LIKE '%${escaped}%' ESCAPE '\\' LIMIT 10`
  );

  // Combine and dedupe matches
  const matchMap = new Map<string, { jid: string; name: string | null }>();
  for (const c of contacts) {
    matchMap.set(c.jid, { jid: c.jid, name: c.name || c.notify });
  }
  for (const c of chats) {
    if (!matchMap.has(c.jid)) {
      matchMap.set(c.jid, { jid: c.jid, name: c.name });
    }
  }

  // Also search Mac Contacts and map to WhatsApp JIDs
  // This finds contacts by name from Mac Contacts that have WhatsApp conversations
  if (!contactCache || Date.now() - contactCacheTime > CONTACT_CACHE_TTL) {
    contactCache = await buildContactCache();
    contactCacheTime = Date.now();
  }

  const searchLower = trimmed.toLowerCase();
  for (const [handle, name] of contactCache.entries()) {
    if (name.toLowerCase().includes(searchLower)) {
      // Check if this is a phone number we can convert to WhatsApp JID
      const isPhone = /^[\d\s\-()+ ]+$/.test(handle);
      if (isPhone) {
        const normalized = normalizePhone(handle);
        const jid = `${normalized}@s.whatsapp.net`;
        // Only add if we have a WhatsApp chat with this JID
        const existing = await queryWhatsAppDB(
          `SELECT jid FROM chats WHERE jid = '${jid}' OR jid LIKE '%${normalized.slice(-10)}@s.whatsapp.net' LIMIT 1`
        );
        if (existing.length > 0 && !matchMap.has(existing[0].jid)) {
          matchMap.set(existing[0].jid, { jid: existing[0].jid, name });
        }
      }
    }
  }

  const matches = Array.from(matchMap.values());

  if (matches.length === 0) {
    return { type: "not_found" };
  }

  if (matches.length === 1) {
    return { type: "found", jid: matches[0].jid, name: matches[0].name };
  }

  // Multiple matches - return ambiguous result
  return { type: "ambiguous", matches };
}

// Result type for iMessage contact resolution
type IMessageResolveResult =
  | { type: "found"; handle: string; name: string | null }
  | {
      type: "ambiguous";
      matches: Array<{ handle: string; name: string | null }>;
    }
  | { type: "not_found" };

// Resolve a contact identifier (name, phone, or email) to an iMessage handle
// Returns ambiguous result if multiple matches found for name searches
async function resolveToIMessageHandle(identifier: string): Promise<IMessageResolveResult> {
  const trimmed = identifier.trim();

  // Phone number or email? Return as-is (unambiguous)
  const isPhone = /^[\d\s\-()+ ]+$/.test(trimmed);
  const isEmail = trimmed.includes("@") && !trimmed.includes("@s.whatsapp");
  if (isPhone || isEmail) {
    // Verify handle exists in Messages DB
    const normalized = isPhone ? normalizePhone(trimmed) : trimmed.toLowerCase();
    const handles = queryMessagesDBRows(
      `SELECT DISTINCT h.id FROM handle h WHERE h.id LIKE '%${escapeSQL(normalized)}%' ESCAPE '\\' LIMIT 1`
    );
    if (handles.length > 0) {
      const name = await resolveHandleToName(handles[0].id);
      return {
        type: "found",
        handle: handles[0].id,
        name: name !== handles[0].id ? name : null,
      };
    }
    // No existing handle, but return the input anyway (might still work)
    return { type: "found", handle: trimmed, name: null };
  }

  // Name search - look up in Mac Contacts and check for multiple matches
  // First, try to find matching contacts via contact cache
  if (!contactCache || Date.now() - contactCacheTime > CONTACT_CACHE_TTL) {
    contactCache = await buildContactCache();
    contactCacheTime = Date.now();
  }

  // Search for names matching the identifier
  const searchLower = trimmed.toLowerCase();
  const matches: Array<{ handle: string; name: string | null }> = [];

  for (const [handle, name] of contactCache.entries()) {
    if (name.toLowerCase().includes(searchLower)) {
      matches.push({ handle, name });
    }
  }

  if (matches.length === 0) {
    return { type: "not_found" };
  }

  if (matches.length === 1) {
    return { type: "found", handle: matches[0].handle, name: matches[0].name };
  }

  // Multiple matches - return ambiguous result
  return { type: "ambiguous", matches };
}

// Format message rows with resolved contact names
// Works for both iMessage and WhatsApp - DRY helper
interface MessageRowInput {
  date?: string;
  timestamp?: string;
  handle?: string;
  sender?: string;
  jid?: string;
  text?: string;
  content?: string;
  is_from_me?: boolean | number;
  chat_name?: string;
}

async function formatMessagesWithNames(
  rows: MessageRowInput[],
  options: {
    includeChat?: boolean;
    handleField?: "handle" | "sender" | "jid";
    dateField?: "date" | "timestamp";
    textField?: "text" | "content";
  } = {}
): Promise<string> {
  const {
    includeChat = false,
    handleField = "handle",
    dateField = "date",
    textField = "text",
  } = options;

  // Collect unique handles and convert WhatsApp JIDs to phone numbers if needed
  const handleToPhone = new Map<string, string>();
  for (const r of rows) {
    const rawHandle = (r as any)[handleField] as string | undefined;
    if (rawHandle && !r.is_from_me) {
      // WhatsApp JIDs are digits@domain (e.g., 15551234567@s.whatsapp.net)
      // iMessage emails are regular emails (e.g., user@example.com)
      // Extract phone from WhatsApp JID, otherwise use handle as-is (including emails)
      const phone = rawHandle.match(/^\d+@/) ? phoneFromJid(rawHandle) : rawHandle;
      if (phone) {
        handleToPhone.set(rawHandle, phone);
      }
    }
  }

  // Resolve phone numbers to names
  const phones = [...new Set([...handleToPhone.values()])];
  const nameMap = await resolveHandlesToNames(phones);

  return rows
    .map((r) => {
      const dateVal = (r as any)[dateField] || "";
      const textVal = (r as any)[textField] || "";
      const rawHandle = (r as any)[handleField] as string | undefined;

      let sender: string;
      if (r.is_from_me) {
        sender = "Me";
      } else if (rawHandle) {
        const phone = handleToPhone.get(rawHandle) || rawHandle;
        sender = nameMap.get(phone) || phone;
      } else {
        sender = "Unknown";
      }

      if (includeChat && r.chat_name) {
        return `${dateVal}|${r.chat_name}|${sender}|${textVal}`;
      }
      return `${dateVal}|${sender}|${textVal}`;
    })
    .join("\n");
}

// WhatsApp configuration
const WHATSAPP_DB_PATH = `${process.env.HOME}/machina/components/whatsapp-mcp-ts/data/whatsapp.db`;
const WHATSAPP_API_URL = "http://localhost:9901";

// SQLite query helper for WhatsApp
async function queryWhatsAppDB(sql: string): Promise<any[]> {
  let db;
  try {
    // Open database in read-only mode for security
    db = new Database(WHATSAPP_DB_PATH, { readonly: true });
    const rows = db.prepare(sql).all();
    return rows;
  } catch (error: any) {
    throw new Error(`WhatsApp database error: ${error.message}`);
  } finally {
    if (db) db.close();
  }
}

// HTTP helper for WhatsApp daemon API
async function callWhatsAppAPI(
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, any>
): Promise<any> {
  try {
    const options: RequestInit = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (body) {
      options.body = JSON.stringify(body);
    }
    const response = await fetch(`${WHATSAPP_API_URL}${endpoint}`, options);
    return await response.json();
  } catch (error: any) {
    throw new Error(`WhatsApp API error: ${error.message}`);
  }
}

// Convert ISO date to AppleScript-compatible format
function isoToAppleScriptDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${isoDate}`);
  }
  // AppleScript expects: "month day, year hour:minute:second AM/PM"
  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

// Operation handlers
async function executeOperation(action: string, params: Record<string, any>): Promise<string> {
  switch (action) {
    // ============== MESSAGES ==============
    case "messages_send": {
      if (!params.to) throw new Error("Missing required parameter: to");
      if (!params.message) throw new Error("Missing required parameter: message");

      // Resolve recipient with disambiguation support
      const resolved = await resolveToIMessageHandle(params.to);

      if (resolved.type === "not_found") {
        return JSON.stringify(
          {
            not_found: true,
            query: params.to,
            message: `No contact found for "${params.to}".`,
            suggestions: [
              "Check the spelling of the contact name",
              "Use contacts_search to find the contact",
              "Try the phone number or email directly",
            ],
          },
          null,
          2
        );
      }

      if (resolved.type === "ambiguous") {
        return JSON.stringify(
          {
            disambiguation_needed: true,
            query: params.to,
            message: `Found ${resolved.matches.length} contacts matching "${params.to}". Which one should I send to?`,
            options: resolved.matches.map((m, i) => ({
              choice: i + 1,
              name: m.name || "Unknown",
              identifier: m.handle,
            })),
            action: "send_message",
            pending_message: params.message,
          },
          null,
          2
        );
      }

      const escapedTo = escapeAppleScript(resolved.handle);
      const escapedMessage = escapeAppleScript(params.message);
      const script = `tell application "Messages"
        set targetService to 1st account whose service type = iMessage
        set targetBuddy to participant "${escapedTo}" of targetService
        send "${escapedMessage}" to targetBuddy
        return "Message sent to ${escapedTo}"
      end tell`;

      await runAppleScript(script);

      // Return structured success response
      return JSON.stringify(
        {
          success: true,
          sent_to: {
            name: resolved.name || resolved.handle,
            identifier: resolved.handle,
          },
          message_preview:
            params.message.length > 50 ? params.message.substring(0, 50) + "..." : params.message,
        },
        null,
        2
      );
    }

    case "messages_read": {
      if (!params.contact) throw new Error("Missing required parameter: contact");

      // Resolve contact to handle with disambiguation
      const resolved = await resolveToIMessageHandle(params.contact);

      if (resolved.type === "not_found") {
        return JSON.stringify(
          {
            not_found: true,
            query: params.contact,
            message: `No iMessage conversation found for "${params.contact}".`,
            suggestions: [
              "Check the spelling of the contact name",
              "Use messages_conversations to see active chats",
              "Try the phone number or email directly",
            ],
          },
          null,
          2
        );
      }

      if (resolved.type === "ambiguous") {
        return JSON.stringify(
          {
            disambiguation_needed: true,
            query: params.contact,
            message: `Found ${resolved.matches.length} contacts matching "${params.contact}". Which one?`,
            options: resolved.matches.map((m, i) => ({
              choice: i + 1,
              name: m.name || "Unknown",
              identifier: m.handle,
            })),
          },
          null,
          2
        );
      }

      const limit = Math.min(Math.max(1, params.limit || 20), 100);
      const escapedContact = escapeSQL(resolved.handle);
      const sql = `SELECT datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') as date,
        m.is_from_me,
        h.id as handle,
        m.text
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE h.id LIKE '%${escapedContact}%' ESCAPE '\\' AND m.text IS NOT NULL
        ORDER BY m.date DESC LIMIT ${limit}`;
      const rows = queryMessagesDBRows(sql);
      if (rows.length === 0) {
        return JSON.stringify(
          {
            not_found: true,
            contact: resolved.name || resolved.handle,
            message: `No messages found with ${resolved.name || resolved.handle}.`,
          },
          null,
          2
        );
      }
      return await formatMessagesWithNames(rows);
    }

    case "messages_recent": {
      const limit = Math.min(Math.max(1, params.limit || 20), 100);
      const sql = `SELECT datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') as date,
        m.is_from_me,
        h.id as handle,
        m.text
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE m.text IS NOT NULL
        ORDER BY m.date DESC LIMIT ${limit}`;
      const rows = queryMessagesDBRows(sql);
      if (rows.length === 0) return "No recent messages found";
      return await formatMessagesWithNames(rows);
    }

    case "messages_search": {
      if (!params.query) throw new Error("Missing required parameter: query");
      const limit = Math.min(Math.max(1, params.limit || 20), 100);
      const escapedQuery = escapeSQL(params.query);
      const sql = `SELECT datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') as date,
        m.is_from_me,
        h.id as handle,
        m.text
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE m.text LIKE '%${escapedQuery}%' ESCAPE '\\'
        ORDER BY m.date DESC LIMIT ${limit}`;
      const rows = queryMessagesDBRows(sql);
      if (rows.length === 0) return `No messages found matching "${params.query}"`;
      return await formatMessagesWithNames(rows);
    }

    case "messages_conversations": {
      const limit = Math.min(Math.max(1, params.limit || 20), 100);
      // Get most recent message per handle using subquery for correct last_message
      const sql = `SELECT
        h.id as participant,
        m.text as last_message,
        datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') as last_date
      FROM message m
      JOIN handle h ON m.handle_id = h.ROWID
      WHERE m.text IS NOT NULL AND m.text <> ''
        AND m.date = (
          SELECT MAX(m2.date) FROM message m2
          WHERE m2.handle_id = m.handle_id AND m2.text IS NOT NULL AND m2.text <> ''
        )
      ORDER BY m.date DESC
      LIMIT ${limit}`;
      const rows = queryMessagesDBRows(sql);
      if (rows.length === 0) return "No conversations found";

      // Skip contact resolution for now (requires Full Disk Access for AddressBook)
      // Just return raw phone numbers
      return rows
        .map((r: any) => {
          return `${r.participant || "Unknown"}|${r.last_date || ""}|${r.last_message || ""}`;
        })
        .join("\n");
    }

    case "messages_conversation_context": {
      if (!params.contact) throw new Error("Missing required parameter: contact");

      const days = Math.min(Math.max(1, params.days || 7), 365);
      const limit = Math.min(Math.max(1, params.limit || 100), 500);

      // Resolve contact with disambiguation support
      const resolved = await resolveToIMessageHandle(params.contact);

      if (resolved.type === "not_found") {
        return JSON.stringify(
          {
            not_found: true,
            query: params.contact,
            message: `No iMessage conversation found for "${params.contact}".`,
            suggestions: [
              "Check the spelling of the contact name",
              "Use messages_conversations to see active chats",
              "Try the phone number or email directly",
            ],
          },
          null,
          2
        );
      }

      if (resolved.type === "ambiguous") {
        return JSON.stringify(
          {
            disambiguation_needed: true,
            query: params.contact,
            message: `Found ${resolved.matches.length} contacts matching "${params.contact}". Which one?`,
            options: resolved.matches.map((m, i) => ({
              choice: i + 1,
              name: m.name || "Unknown",
              identifier: m.handle,
            })),
          },
          null,
          2
        );
      }

      const contactHandle = resolved.handle;
      const escapedContact = escapeSQL(contactHandle);

      // Apple epoch: seconds since 2001-01-01, stored as nanoseconds
      const appleEpochOffset = 978307200;
      const daysAgoTimestamp =
        (Date.now() / 1000 - days * 24 * 60 * 60 - appleEpochOffset) * 1000000000;

      // Get messages with attachments
      const messagesSql = `
        SELECT
          m.ROWID as message_id,
          m.date as raw_date,
          m.date/1000000000 + ${appleEpochOffset} as unix_timestamp,
          m.is_from_me,
          h.id as sender_id,
          m.text,
          ma.attachment_id
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        LEFT JOIN message_attachment_join ma ON m.ROWID = ma.message_id
        WHERE h.id LIKE '%${escapedContact}%' ESCAPE '\\'
          AND m.date > ${daysAgoTimestamp}
        ORDER BY m.date ASC
        LIMIT ${limit}`;

      const messages = queryMessagesDBRows(messagesSql);

      if (messages.length === 0) {
        return JSON.stringify(
          {
            error: `No messages found for "${params.contact}" in the last ${days} days`,
          },
          null,
          2
        );
      }

      // Get the handle ID for metadata queries
      const handleId = messages[0]?.sender_id;

      // Get conversation metadata
      const metaSql = `
        SELECT
          MIN(m.date/1000000000 + ${appleEpochOffset}) as first_message_unix,
          COUNT(*) as total_messages,
          SUM(CASE WHEN m.is_from_me = 1 THEN 1 ELSE 0 END) as from_you,
          SUM(CASE WHEN m.is_from_me = 0 THEN 1 ELSE 0 END) as from_them,
          MAX(m.date/1000000000 + ${appleEpochOffset}) as last_message_unix,
          (SELECT is_from_me FROM message m2
           LEFT JOIN handle h2 ON m2.handle_id = h2.ROWID
           WHERE h2.id LIKE '%${escapedContact}%' ESCAPE '\\'
           ORDER BY m2.date DESC LIMIT 1) as last_is_from_me
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE h.id LIKE '%${escapedContact}%' ESCAPE '\\'`;

      const meta = queryMessagesDBRows(metaSql)[0];

      // Get recent activity counts
      const sevenDaysAgo = (Date.now() / 1000 - 7 * 24 * 60 * 60 - appleEpochOffset) * 1000000000;
      const thirtyDaysAgo = (Date.now() / 1000 - 30 * 24 * 60 * 60 - appleEpochOffset) * 1000000000;

      const recentSql = `
        SELECT
          SUM(CASE WHEN m.date > ${sevenDaysAgo} THEN 1 ELSE 0 END) as last_7_days,
          SUM(CASE WHEN m.date > ${thirtyDaysAgo} THEN 1 ELSE 0 END) as last_30_days,
          SUM(CASE WHEN m.date > ${sevenDaysAgo} AND m.is_from_me = 1 THEN 1 ELSE 0 END) as from_you_7d,
          SUM(CASE WHEN m.date > ${sevenDaysAgo} AND m.is_from_me = 0 THEN 1 ELSE 0 END) as from_them_7d
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE h.id LIKE '%${escapedContact}%' ESCAPE '\\'`;

      const recent = queryMessagesDBRows(recentSql)[0];

      // Look up contact name using cached SQLite data (fast)
      const contactName = await resolveHandleToName(handleId);

      // Get attachment details for messages that have them
      const attachmentIds = messages.filter((m) => m.attachment_id).map((m) => m.attachment_id);

      const attachments: Record<string, any> = {};
      if (attachmentIds.length > 0) {
        const attSql = `
          SELECT ROWID, filename, mime_type, transfer_name
          FROM attachment
          WHERE ROWID IN (${attachmentIds.join(",")})`;
        const attRows = queryMessagesDBRows(attSql);
        for (const att of attRows) {
          attachments[att.ROWID] = {
            id: `att_${att.ROWID}`,
            type: getAttachmentType(att.mime_type, att.filename),
            filename: att.transfer_name || att.filename,
          };
        }
      }

      // Build the response
      const firstMessageDate = new Date(meta.first_message_unix * 1000);
      const lastMessageDate = new Date(meta.last_message_unix * 1000);

      const response = {
        conversation: {
          type: "1:1",
          with: {
            name: contactName || handleId,
            phone: handleId,
          },
          context: {
            started: firstMessageDate.toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            }),
            age: formatChatAge(firstMessageDate),
            total_messages: meta.total_messages,
            recent_activity: {
              last_7_days: recent.last_7_days || 0,
              last_30_days: recent.last_30_days || 0,
              from_you: recent.from_you_7d || 0,
              from_them: recent.from_them_7d || 0,
            },
            status: {
              last_message_from: meta.last_is_from_me ? "you" : contactName || handleId,
              last_message_time: formatRelativeTime(lastMessageDate),
              awaiting_your_response: !meta.last_is_from_me,
            },
          },
        },
        messages: (() => {
          // Group messages by message_id to handle multiple attachments
          const messageMap = new Map<number, any>();

          for (const m of messages) {
            if (!messageMap.has(m.message_id)) {
              const msgDate = new Date(m.unix_timestamp * 1000);
              messageMap.set(m.message_id, {
                role: "user",
                from: m.is_from_me ? "you" : contactName || handleId,
                time: formatRelativeTime(msgDate),
                timestamp: msgDate.toISOString(),
                content: m.text || "",
                attachments: [],
              });
            }

            // Add attachment if present
            if (m.attachment_id && attachments[m.attachment_id]) {
              messageMap.get(m.message_id)!.attachments.push(attachments[m.attachment_id]);
            }
          }

          // Convert map to array and clean up empty attachments
          return Array.from(messageMap.values()).map((msg) => {
            if (msg.attachments.length === 0) {
              delete msg.attachments;
            } else if (!msg.content) {
              // If no text but has attachments, show attachment types
              msg.content = msg.attachments.map((a: any) => `[${a.type}]`).join(" ");
            }
            return msg;
          });
        })(),
      };

      return JSON.stringify(response, null, 2);
    }

    case "messages_get_attachment": {
      if (!params.id) throw new Error("Missing required parameter: id");

      // Parse attachment ID (format: att_12345)
      const match = params.id.match(/^att_(\d+)$/);
      if (!match) {
        throw new Error(`Invalid attachment ID format: ${params.id}. Expected format: att_12345`);
      }
      const rowId = match[1];

      const sql = `
        SELECT ROWID, filename, mime_type, transfer_name, total_bytes
        FROM attachment
        WHERE ROWID = ${rowId}`;

      const rows = queryMessagesDBRows(sql);
      if (rows.length === 0) {
        throw new Error(`Attachment not found: ${params.id}`);
      }

      const att = rows[0];
      // Attachment filenames start with ~/ which needs expansion
      const filePath = att.filename?.startsWith("~/")
        ? att.filename.replace("~", process.env.HOME || "")
        : att.filename;

      return JSON.stringify(
        {
          id: params.id,
          type: getAttachmentType(att.mime_type, att.filename),
          filename: att.transfer_name || att.filename?.split("/").pop(),
          mime_type: att.mime_type,
          size_bytes: att.total_bytes,
          path: filePath,
        },
        null,
        2
      );
    }

    // ============== NOTES ==============
    case "notes_list": {
      const limit = Math.min(Math.max(1, params.limit || 20), 100);
      let script: string;
      if (params.folder) {
        const escapedFolder = escapeAppleScript(params.folder);
        script = `tell application "Notes"
          set noteList to {}
          set targetFolder to folder "${escapedFolder}"
          set folderName to name of targetFolder
          set allNotes to notes of targetFolder
          set noteCount to count of allNotes
          if noteCount > ${limit} then set noteCount to ${limit}
          repeat with i from 1 to noteCount
            set n to item i of allNotes
            set end of noteList to folderName & ": " & name of n
          end repeat
          return noteList as text
        end tell`;
      } else {
        script = `tell application "Notes"
          set noteList to {}
          set noteCount to 0
          repeat with f in folders
            if noteCount >= ${limit} then exit repeat
            set folderName to name of f
            repeat with n in notes of f
              if noteCount >= ${limit} then exit repeat
              set end of noteList to folderName & ": " & name of n
              set noteCount to noteCount + 1
            end repeat
          end repeat
          return noteList as text
        end tell`;
      }
      return await runAppleScript(script, "Notes");
    }

    case "notes_read": {
      if (!params.title) throw new Error("Missing required parameter: title");
      const escapedTitle = escapeAppleScript(params.title);
      const script = `tell application "Notes"
        set matchingNotes to (notes whose name contains "${escapedTitle}")
        if (count of matchingNotes) = 0 then
          return "Note not found: ${escapedTitle}"
        end if
        set theNote to item 1 of matchingNotes
        return plaintext of theNote
      end tell`;
      return await runAppleScript(script, "Notes");
    }

    case "notes_create": {
      if (!params.title) throw new Error("Missing required parameter: title");
      if (!params.body) throw new Error("Missing required parameter: body");
      const escapedFolder = escapeAppleScript(params.folder || "Notes");
      const escapedTitle = escapeAppleScript(params.title);
      const escapedBody = escapeAppleScript(params.body);
      const script = `tell application "Notes"
        tell folder "${escapedFolder}"
          make new note with properties {name:"${escapedTitle}", body:"${escapedBody}"}
        end tell
        return "Created note: ${escapedTitle}"
      end tell`;
      return await runAppleScript(script, "Notes");
    }

    case "notes_search": {
      if (!params.query) throw new Error("Missing required parameter: query");
      const limit = Math.min(Math.max(1, params.limit || 10), 100);
      const escapedQuery = escapeAppleScript(params.query);
      const script = `tell application "Notes"
        set noteList to {}
        set noteCount to 0
        repeat with f in folders
          if noteCount >= ${limit} then exit repeat
          set folderName to name of f
          set matchingNotes to (notes of f whose name contains "${escapedQuery}" or plaintext contains "${escapedQuery}")
          repeat with n in matchingNotes
            if noteCount >= ${limit} then exit repeat
            set end of noteList to folderName & ": " & name of n
            set noteCount to noteCount + 1
          end repeat
        end repeat
        return noteList as text
      end tell`;
      return await runAppleScript(script, "Notes");
    }

    // ============== REMINDERS ==============
    case "reminders_list": {
      const completedFilter = params.includeCompleted ? "" : "whose completed is false";

      let script: string;
      if (params.list) {
        // Filter to specific list
        const escapedList = escapeAppleScript(params.list);
        script = `tell application "Reminders"
          set reminderList to {}
          set targetList to list "${escapedList}"
          set rems to (reminders of targetList ${completedFilter})
          repeat with r in rems
            set remName to name of r
            set remDue to ""
            try
              set remDue to " (due: " & (due date of r as string) & ")"
            end try
            set end of reminderList to "${escapedList}: " & remName & remDue
          end repeat
          return reminderList as text
        end tell`;
      } else {
        // All lists
        script = `tell application "Reminders"
          set reminderList to {}
          repeat with l in lists
            set rems to (reminders of l ${completedFilter})
            repeat with r in rems
              set remName to name of r
              set remList to name of l
              set remDue to ""
              try
                set remDue to " (due: " & (due date of r as string) & ")"
              end try
              set end of reminderList to remList & ": " & remName & remDue
            end repeat
          end repeat
          return reminderList as text
        end tell`;
      }
      return await runAppleScript(script, "Reminders", REMINDERS_TIMEOUT);
    }

    case "reminders_create": {
      if (!params.title) throw new Error("Missing required parameter: title");
      const escapedList = escapeAppleScript(params.list || "Reminders");
      const escapedTitle = escapeAppleScript(params.title);
      let props = `{name:"${escapedTitle}"`;
      if (params.notes) {
        props += `, body:"${escapeAppleScript(params.notes)}"`;
      }
      props += "}";

      let script = `tell application "Reminders"
        tell list "${escapedList}"
          set newReminder to make new reminder with properties ${props}`;

      if (params.dueDate) {
        // Convert ISO date to AppleScript format
        const asDate = isoToAppleScriptDate(params.dueDate);
        script += `
          set due date of newReminder to date "${asDate}"`;
      }

      script += `
        end tell
        return "Created reminder: ${escapedTitle}"
      end tell`;
      return await runAppleScript(script, "Reminders", REMINDERS_TIMEOUT);
    }

    case "reminders_complete": {
      if (!params.title) throw new Error("Missing required parameter: title");
      const escapedTitle = escapeAppleScript(params.title);
      const listFilter = params.list ? `of list "${escapeAppleScript(params.list)}"` : "";
      const script = `tell application "Reminders"
        set matchingReminders to (reminders ${listFilter} whose name contains "${escapedTitle}" and completed is false)
        if (count of matchingReminders) = 0 then
          return "No incomplete reminder found matching: ${escapedTitle}"
        end if
        set targetReminder to item 1 of matchingReminders
        set completed of targetReminder to true
        return "Completed: " & name of targetReminder
      end tell`;
      return await runAppleScript(script, "Reminders", REMINDERS_TIMEOUT);
    }

    // ============== CONTACTS ==============
    case "contacts_search": {
      if (!params.name) throw new Error("Missing required parameter: name");
      const escapedName = escapeAppleScript(params.name);
      const script = `tell application "Contacts"
        set matchingPeople to (every person whose name contains "${escapedName}")
        set results to {}
        repeat with p in matchingPeople
          set pName to name of p
          set pPhones to {}
          set pEmails to {}
          repeat with ph in phones of p
            set end of pPhones to value of ph
          end repeat
          repeat with em in emails of p
            set end of pEmails to value of em
          end repeat
          set contactInfo to pName
          if (count of pPhones) > 0 then set contactInfo to contactInfo & " | Phones: " & (pPhones as text)
          if (count of pEmails) > 0 then set contactInfo to contactInfo & " | Emails: " & (pEmails as text)
          set end of results to contactInfo
        end repeat
        return results as text
      end tell`;
      return await runAppleScript(script, "Contacts");
    }

    case "contacts_get": {
      if (!params.name) throw new Error("Missing required parameter: name");
      const escapedName = escapeAppleScript(params.name);
      const script = `tell application "Contacts"
        set matchingPeople to (every person whose name contains "${escapedName}")
        if (count of matchingPeople) = 0 then
          return "Contact not found: ${escapedName}"
        end if
        set p to item 1 of matchingPeople
        set contactInfo to "Name: " & (name of p)

        set pPhones to {}
        repeat with ph in phones of p
          set end of pPhones to (label of ph) & ": " & (value of ph)
        end repeat
        if (count of pPhones) > 0 then set contactInfo to contactInfo & "\\nPhones: " & (pPhones as text)

        set pEmails to {}
        repeat with em in emails of p
          set end of pEmails to (label of em) & ": " & (value of em)
        end repeat
        if (count of pEmails) > 0 then set contactInfo to contactInfo & "\\nEmails: " & (pEmails as text)

        set pAddresses to {}
        repeat with addr in addresses of p
          set end of pAddresses to (label of addr) & ": " & (formatted address of addr)
        end repeat
        if (count of pAddresses) > 0 then set contactInfo to contactInfo & "\\nAddresses: " & (pAddresses as text)

        try
          set contactInfo to contactInfo & "\\nBirthday: " & (birth date of p as string)
        end try

        try
          set contactInfo to contactInfo & "\\nCompany: " & (organization of p)
        end try

        return contactInfo
      end tell`;
      return await runAppleScript(script, "Contacts");
    }

    // ============== RAW APPLESCRIPT ==============
    case "system_raw_applescript": {
      if (!params.script) throw new Error("Missing required parameter: script");
      return await runAppleScript(params.script);
    }

    // ============== SYSTEM ==============
    case "system_update": {
      // Concurrency guard - prevent simultaneous updates
      if (updateInProgress) {
        return "Update already in progress. Please wait for it to complete.";
      }
      updateInProgress = true;

      const results: string[] = [];

      try {
        // Check for uncommitted changes before pulling
        const { stdout: dirtyCheck } = await execAsync("git status --porcelain", {
          cwd: process.cwd(),
        });
        if (dirtyCheck.trim()) {
          updateInProgress = false;
          return "Cannot update: uncommitted local changes detected. Commit or stash changes first.";
        }

        // Get current commit
        const { stdout: beforeCommit } = await execAsync("git rev-parse --short HEAD", {
          cwd: process.cwd(),
        });
        results.push(`Before: ${beforeCommit.trim()}`);

        // Fetch and check for updates
        await execAsync("git fetch", { cwd: process.cwd() });
        const { stdout: behind } = await execAsync("git rev-list HEAD..origin/main --count", {
          cwd: process.cwd(),
        });

        if (behind.trim() === "0") {
          updateInProgress = false;
          return "Already up to date. No changes available.";
        }

        // Pull latest
        const { stdout: pullResult } = await execAsync("git pull", {
          cwd: process.cwd(),
        });
        results.push(`Pull: ${pullResult.trim()}`);

        // Update dependencies
        try {
          const { stdout: installResult } = await execAsync("bun install", {
            cwd: process.cwd(),
          });
          if (installResult.trim()) {
            results.push(`Dependencies: ${installResult.trim()}`);
          }
        } catch (installErr: any) {
          results.push(`Dependencies: WARNING - ${installErr.message}`);
        }

        // Get new commit
        const { stdout: afterCommit } = await execAsync("git rev-parse --short HEAD", {
          cwd: process.cwd(),
        });
        results.push(`After: ${afterCommit.trim()}`);

        // Validate commit hashes (prevent shell injection)
        const commitRegex = /^[a-f0-9]+$/i;
        if (!commitRegex.test(beforeCommit.trim()) || !commitRegex.test(afterCommit.trim())) {
          throw new Error("Invalid commit hash format");
        }

        // Get changelog using validated commits
        const { stdout: changelog } = await execAsync(
          `git log ${beforeCommit.trim()}..${afterCommit.trim()} --oneline`,
          { cwd: process.cwd() }
        );
        if (changelog.trim()) {
          results.push(`\nChanges:\n${changelog.trim()}`);
        }

        // Auto-restart: close server, spawn new, exit
        results.push("\nRestarting server...");
        results.push("✅ Update complete. New server starting.");

        // Close server after response is sent to avoid port conflict
        setImmediate(() => {
          // Timeout to prevent hanging on close
          const closeTimeout = setTimeout(() => {
            console.error("Server close timed out, forcing exit");
            process.exit(1);
          }, 10000);

          // Force close all connections (SSE, long-polling, etc)
          if (httpServer.closeAllConnections) {
            httpServer.closeAllConnections();
          }

          httpServer.close(() => {
            clearTimeout(closeTimeout);

            // Port is now released, spawn new server
            const { spawn } = require("node:child_process");
            const newServer = spawn("bun", ["run", "server/index.ts"], {
              cwd: process.cwd(),
              detached: true,
              stdio: "inherit",
              env: { ...process.env },
            });

            // Spawn timeout - if no response in 5s, exit anyway
            const spawnTimeout = setTimeout(() => {
              console.error("Spawn timeout - exiting to let LaunchD restart");
              process.exit(1);
            }, 5000);

            newServer.on("error", (err: Error) => {
              clearTimeout(spawnTimeout);
              console.error("Failed to spawn new server:", err);
              // Exit to let LaunchD restart - server is already closed
              process.exit(1);
            });

            newServer.on("spawn", () => {
              clearTimeout(spawnTimeout);
              newServer.unref();
              process.exit(0);
            });
          });
        });

        return results.join("\n");
      } catch (err: any) {
        updateInProgress = false;
        throw new Error(`Update failed: ${err.message}`);
      }
    }

    case "system_status": {
      const status: string[] = [];

      try {
        const { stdout: commit } = await execAsync("git rev-parse --short HEAD", {
          cwd: process.cwd(),
        });
        const { stdout: branch } = await execAsync("git rev-parse --abbrev-ref HEAD", {
          cwd: process.cwd(),
        });

        status.push(`Version: 1.1.0`);
        status.push(`Commit: ${commit.trim()}`);
        status.push(`Branch: ${branch.trim()}`);

        // Check if behind remote (optional - don't fail if network unavailable)
        try {
          await execAsync("git fetch", { cwd: process.cwd() });
          const { stdout: behind } = await execAsync("git rev-list HEAD..origin/main --count", {
            cwd: process.cwd(),
          });
          status.push(
            `Updates available: ${behind.trim() === "0" ? "No" : `Yes (${behind.trim()} commits behind)`}`
          );
        } catch {
          status.push("Updates available: Unknown (network unavailable)");
        }

        status.push(`Operations: ${operations.length}`);
        status.push(`Update in progress: ${updateInProgress ? "Yes" : "No"}`);

        return status.join("\n");
      } catch (err: any) {
        return `Status check failed: ${err.message}`;
      }
    }

    // ============== WHATSAPP ==============
    case "whatsapp_status": {
      const result = await callWhatsAppAPI("/health");
      return `WhatsApp status: ${result.status}\nUser: ${result.user || "Not connected"}`;
    }

    case "whatsapp_send": {
      if (!params.to) throw new Error("Missing required parameter: to");
      if (!params.message) throw new Error("Missing required parameter: message");

      // Resolve recipient with disambiguation support
      const resolved = await resolveToWhatsAppJid(params.to);

      if (resolved.type === "not_found") {
        return JSON.stringify(
          {
            not_found: true,
            query: params.to,
            message: `No WhatsApp contact found for "${params.to}".`,
            suggestions: [
              "Check the spelling of the contact name",
              "Use whatsapp(action='chats') to see active conversations",
              "Try the phone number with country code (e.g., +15551234567)",
            ],
          },
          null,
          2
        );
      }

      if (resolved.type === "ambiguous") {
        return JSON.stringify(
          {
            disambiguation_needed: true,
            query: params.to,
            message: `Found ${resolved.matches.length} contacts matching "${params.to}". Which one should I send to?`,
            options: resolved.matches.map((m, i) => ({
              choice: i + 1,
              name: m.name || "Unknown",
              identifier: m.jid,
            })),
            action: "send_message",
            pending_message: params.message,
          },
          null,
          2
        );
      }

      const result = await callWhatsAppAPI("/api/send", "POST", {
        recipient: resolved.jid,
        message: params.message,
      });

      if (result.success) {
        // Return structured success response
        return JSON.stringify(
          {
            success: true,
            sent_to: {
              name: resolved.name || resolved.jid,
              identifier: resolved.jid,
            },
            message_id: result.message_id,
            message_preview:
              params.message.length > 50 ? params.message.substring(0, 50) + "..." : params.message,
          },
          null,
          2
        );
      } else {
        throw new Error(result.error || "Failed to send message");
      }
    }

    case "whatsapp_chats": {
      const limit = Math.min(Math.max(1, params.limit || 20), 100);
      let sql = `SELECT jid, name, last_message_time
        FROM chats ORDER BY last_message_time DESC LIMIT ${limit}`;

      if (params.query) {
        const escaped = escapeSQL(params.query);
        sql = `SELECT jid, name, last_message_time
          FROM chats WHERE name LIKE '%${escaped}%' ESCAPE '\\' OR jid LIKE '%${escaped}%' ESCAPE '\\'
          ORDER BY last_message_time DESC LIMIT ${limit}`;
      }

      const rows = await queryWhatsAppDB(sql);
      if (rows.length === 0) return "No chats found";

      // Resolve contact names for individual chats
      const formattedChats = await Promise.all(
        rows.map(async (r: any) => {
          const isGroup = r.jid.includes("@g.us");
          let displayName = r.name;

          // For individual chats without a name, look up contact
          if (!isGroup && !displayName) {
            const phone = phoneFromJid(r.jid);
            if (phone) {
              const resolved = await resolveHandleToName(phone);
              displayName = resolved !== phone ? resolved : null;
            }
          }

          // Format relative time
          let lastActivity = "unknown";
          if (r.last_message_time && r.last_message_time !== "undefined") {
            const lastDate = new Date(r.last_message_time);
            if (!isNaN(lastDate.getTime())) {
              lastActivity = formatRelativeTime(lastDate);
            }
          }

          // Use display name, or phone for individuals, or JID for groups
          const name = displayName || phoneFromJid(r.jid) || r.jid;
          const typeIndicator = isGroup ? "📱 Group" : "👤";

          return `${typeIndicator} ${name}\n  JID: ${r.jid}\n  Last: ${lastActivity}`;
        })
      );

      return formattedChats.join("\n\n");
    }

    case "whatsapp_messages": {
      if (!params.contact) {
        throw new Error("Missing required parameter: contact (name/phone/JID)");
      }
      const identifier = params.contact;

      // Resolve to JID - handle ambiguous matches
      const resolved = await resolveToWhatsAppJid(identifier);
      if (resolved.type === "not_found") {
        return JSON.stringify(
          {
            not_found: true,
            query: identifier,
            message: `No WhatsApp chat found for "${identifier}".`,
            suggestions: [
              "Try a different spelling or part of the name",
              "Use a phone number instead",
              "Search contacts: whatsapp(action='contacts', params={query: '...'})",
            ],
          },
          null,
          2
        );
      }
      if (resolved.type === "ambiguous") {
        // Return structured disambiguation for the AI to present as choices
        return JSON.stringify(
          {
            disambiguation_needed: true,
            query: identifier,
            message: `I found ${resolved.matches.length} contacts matching "${identifier}". Which one?`,
            options: resolved.matches.map((m, i) => ({
              choice: i + 1,
              name: m.name || "Unknown",
              identifier: m.jid,
            })),
          },
          null,
          2
        );
      }

      const limit = Math.min(Math.max(1, params.limit || 20), 100);
      const escaped = escapeSQL(resolved.jid);

      const sql = `SELECT timestamp,
        is_from_me,
        sender,
        content
        FROM messages
        WHERE chat_jid = '${escaped}'
        ORDER BY timestamp DESC LIMIT ${limit}`;

      const rows = await queryWhatsAppDB(sql);
      if (rows.length === 0) return `No messages found for: ${identifier}`;

      return await formatMessagesWithNames(rows, {
        handleField: "sender",
        dateField: "timestamp",
        textField: "content",
      });
    }

    case "whatsapp_search": {
      if (!params.query) throw new Error("Missing required parameter: query");
      const limit = Math.min(Math.max(1, params.limit || 20), 100);
      const escaped = escapeSQL(params.query);

      const sql = `SELECT m.timestamp,
        m.is_from_me,
        m.sender,
        c.name as chat_name,
        m.content
        FROM messages m
        LEFT JOIN chats c ON m.chat_jid = c.jid
        WHERE m.content LIKE '%${escaped}%' ESCAPE '\\'
        ORDER BY m.timestamp DESC LIMIT ${limit}`;

      const rows = await queryWhatsAppDB(sql);
      if (rows.length === 0) return `No messages found matching: ${params.query}`;

      return await formatMessagesWithNames(rows, {
        handleField: "sender",
        dateField: "timestamp",
        textField: "content",
        includeChat: true,
      });
    }

    case "whatsapp_contacts": {
      if (!params.query) throw new Error("Missing required parameter: query");
      const limit = Math.min(Math.max(1, params.limit || 20), 100);
      const escaped = escapeSQL(params.query);

      // Check if query looks like a phone number
      const isPhoneQuery = /^[\d\s\-()+ ]+$/.test(params.query.trim());

      let sql: string;
      if (isPhoneQuery) {
        // Normalize phone for better matching
        const normalized = normalizePhone(params.query);
        // Try matching with different phone formats
        sql = `SELECT jid, name FROM contacts
          WHERE jid LIKE '%${normalized}%' ESCAPE '\\'
             OR jid LIKE '%${normalized.slice(-10)}%' ESCAPE '\\'
          LIMIT ${limit}`;
      } else {
        // Name search - search both contacts and chats (groups have names)
        sql = `SELECT jid, name FROM contacts
          WHERE name LIKE '%${escaped}%' ESCAPE '\\' OR jid LIKE '%${escaped}%' ESCAPE '\\'
          UNION
          SELECT jid, name FROM chats
          WHERE name LIKE '%${escaped}%' ESCAPE '\\'
          LIMIT ${limit}`;
      }

      const rows = await queryWhatsAppDB(sql);

      if (rows.length === 0) {
        // If no results and it was a phone query, suggest JID format
        if (isPhoneQuery) {
          const normalized = normalizePhone(params.query);
          return `No contacts found for phone: ${params.query}\n\nTip: You can try messaging directly using JID format: ${normalized}@s.whatsapp.net`;
        }
        return `No contacts found matching: ${params.query}`;
      }

      // Enhance with contact names from Mac Contacts
      const enhanced = await Promise.all(
        rows.map(async (r: any) => {
          const isGroup = r.jid.includes("@g.us");
          let displayName = r.name;

          // For individual contacts without a name, try Mac Contacts
          if (!isGroup && !displayName) {
            const phone = phoneFromJid(r.jid);
            if (phone) {
              const resolved = await resolveHandleToName(phone);
              if (resolved !== phone) displayName = resolved;
            }
          }

          const typeIndicator = isGroup ? "📱" : "👤";
          const name = displayName || phoneFromJid(r.jid) || "Unknown";
          return `${typeIndicator} ${name} (${r.jid})`;
        })
      );

      return enhanced.join("\n");
    }

    case "whatsapp_chat_context": {
      if (!params.contact) {
        throw new Error("Missing required parameter: contact (name/phone/JID)");
      }
      const identifier = params.contact;

      // Resolve to JID - handle ambiguous matches
      const resolved = await resolveToWhatsAppJid(identifier);
      if (resolved.type === "not_found") {
        return JSON.stringify(
          {
            not_found: true,
            query: identifier,
            message: `No WhatsApp chat found for "${identifier}".`,
            suggestions: [
              "Try a different spelling or part of the name",
              "Use a phone number instead",
              "Search contacts: whatsapp(action='contacts', params={query: '...'})",
            ],
          },
          null,
          2
        );
      }
      if (resolved.type === "ambiguous") {
        return JSON.stringify(
          {
            disambiguation_needed: true,
            query: identifier,
            message: `I found ${resolved.matches.length} contacts matching "${identifier}". Which one?`,
            options: resolved.matches.map((m, i) => ({
              choice: i + 1,
              name: m.name || "Unknown",
              identifier: m.jid,
            })),
          },
          null,
          2
        );
      }

      const chatJid = resolved.jid;
      const days = Math.min(Math.max(1, params.days || 7), 365);
      const limit = Math.min(Math.max(1, params.limit || 100), 500);
      const escaped = escapeSQL(chatJid);
      const isGroup = chatJid.includes("@g.us");

      // Calculate ISO timestamp for time windows
      const daysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const daysAgoISO = daysAgo.toISOString();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Get messages for the requested window
      const messagesSql = `
        SELECT timestamp, is_from_me, sender, content
        FROM messages
        WHERE chat_jid = '${escaped}'
          AND timestamp > '${daysAgoISO}'
        ORDER BY timestamp ASC
        LIMIT ${limit}`;

      const messages = await queryWhatsAppDB(messagesSql);

      if (messages.length === 0) {
        return JSON.stringify(
          {
            error: `No messages found for "${identifier}" in the last ${days} days`,
          },
          null,
          2
        );
      }

      // Get chat metadata (name for groups)
      const metaSql = `SELECT name FROM chats WHERE jid = '${escaped}'`;
      const chatMeta = await queryWhatsAppDB(metaSql);
      let chatName = chatMeta[0]?.name || null;

      // For individual chats, resolve phone to contact name
      let contactPhone: string | null = null;
      if (!isGroup) {
        contactPhone = phoneFromJid(chatJid);
        if (contactPhone && !chatName) {
          chatName = await resolveHandleToName(contactPhone);
          // If still just a phone number, keep it as-is
          if (chatName === contactPhone) chatName = null;
        }
      }

      // Get ALL-TIME conversation stats (not just requested window)
      const allTimeStatsSql = `
        SELECT
          MIN(timestamp) as first_message,
          MAX(timestamp) as last_message,
          COUNT(*) as total_messages,
          SUM(CASE WHEN is_from_me = 1 THEN 1 ELSE 0 END) as from_you,
          SUM(CASE WHEN is_from_me = 0 THEN 1 ELSE 0 END) as from_them
        FROM messages
        WHERE chat_jid = '${escaped}'`;
      const allTimeStats = (await queryWhatsAppDB(allTimeStatsSql))[0];

      // Get recent activity (7 and 30 days)
      const recentStatsSql = `
        SELECT
          SUM(CASE WHEN timestamp > '${sevenDaysAgo}' THEN 1 ELSE 0 END) as last_7_days,
          SUM(CASE WHEN timestamp > '${thirtyDaysAgo}' THEN 1 ELSE 0 END) as last_30_days,
          SUM(CASE WHEN timestamp > '${sevenDaysAgo}' AND is_from_me = 1 THEN 1 ELSE 0 END) as from_you_7d,
          SUM(CASE WHEN timestamp > '${sevenDaysAgo}' AND is_from_me = 0 THEN 1 ELSE 0 END) as from_them_7d
        FROM messages
        WHERE chat_jid = '${escaped}'`;
      const recentStats = (await queryWhatsAppDB(recentStatsSql))[0];

      // Get last message info for status
      const lastMsgSql = `
        SELECT is_from_me, sender FROM messages
        WHERE chat_jid = '${escaped}'
        ORDER BY timestamp DESC LIMIT 1`;
      const lastMsg = (await queryWhatsAppDB(lastMsgSql))[0];

      // Resolve sender names for group messages
      const senderJids = [
        ...new Set(messages.filter((m: any) => !m.is_from_me).map((m: any) => m.sender)),
      ];
      const senderNames = new Map<string, string>();
      for (const jid of senderJids) {
        if (jid) {
          const phone = phoneFromJid(jid);
          if (phone) {
            const name = await resolveHandleToName(phone);
            senderNames.set(jid, name !== phone ? name : phone);
          } else {
            senderNames.set(jid, jid);
          }
        }
      }

      // Format dates
      const firstMsgDate = allTimeStats.first_message ? new Date(allTimeStats.first_message) : null;
      const lastMsgDate = allTimeStats.last_message ? new Date(allTimeStats.last_message) : null;

      // Determine who sent the last message
      let lastMessageFrom = "unknown";
      if (lastMsg) {
        if (lastMsg.is_from_me) {
          lastMessageFrom = "you";
        } else if (isGroup && lastMsg.sender) {
          lastMessageFrom = senderNames.get(lastMsg.sender) || lastMsg.sender;
        } else {
          lastMessageFrom = chatName || contactPhone || chatJid;
        }
      }

      // Build the response matching iMessage format
      const response = {
        conversation: {
          type: isGroup ? "group" : "1:1",
          ...(isGroup
            ? { name: chatName || chatJid }
            : {
                with: {
                  name: chatName || contactPhone || chatJid,
                  phone: contactPhone,
                },
              }),
          jid: chatJid,
          context: {
            started: firstMsgDate
              ? firstMsgDate.toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })
              : "unknown",
            age: firstMsgDate ? formatChatAge(firstMsgDate) : "unknown",
            total_messages: allTimeStats.total_messages || 0,
            recent_activity: {
              last_7_days: recentStats.last_7_days || 0,
              last_30_days: recentStats.last_30_days || 0,
              from_you: recentStats.from_you_7d || 0,
              from_them: recentStats.from_them_7d || 0,
            },
            status: {
              last_message_from: lastMessageFrom,
              last_message_time: lastMsgDate ? formatRelativeTime(lastMsgDate) : "unknown",
              awaiting_your_response: lastMsg ? !lastMsg.is_from_me : false,
            },
          },
        },
        messages: messages.map((m: any) => {
          const msgDate = new Date(m.timestamp);
          let senderName: string;
          if (m.is_from_me) {
            senderName = "you";
          } else if (isGroup && m.sender) {
            senderName = senderNames.get(m.sender) || m.sender;
          } else {
            senderName = chatName || contactPhone || "them";
          }

          return {
            role: "user",
            from: senderName,
            time: formatRelativeTime(msgDate),
            timestamp: m.timestamp,
            content: m.content || "",
          };
        }),
      };

      return JSON.stringify(response, null, 2);
    }

    case "whatsapp_raw_sql": {
      if (!params.sql) throw new Error("Missing required parameter: sql");

      // Only allow SELECT queries (read-only)
      const normalizedSql = params.sql.trim().toLowerCase();
      if (!normalizedSql.startsWith("select")) {
        throw new Error("Only SELECT queries are allowed. WhatsApp raw_sql is read-only.");
      }

      // Block dangerous keywords using word boundaries to avoid false positives
      const dangerous = [
        "insert",
        "update",
        "delete",
        "drop",
        "alter",
        "create",
        "attach",
        "detach",
        "pragma",
        "load_extension",
        "replace", // SQLite REPLACE is INSERT OR REPLACE (can modify data)
      ];
      for (const keyword of dangerous) {
        const regex = new RegExp(`\\b${keyword}\\b`, "i");
        if (regex.test(normalizedSql)) {
          throw new Error(
            `Query contains forbidden keyword: ${keyword}. WhatsApp raw_sql is read-only.`
          );
        }
      }

      // Block SQL comments which could hide malicious code
      if (normalizedSql.includes("--") || normalizedSql.includes("/*")) {
        throw new Error("SQL comments are not allowed in raw queries.");
      }

      // Block semicolons to prevent statement chaining
      if (params.sql.includes(";")) {
        throw new Error("Semicolons are not allowed (no statement chaining).");
      }

      const rows = await queryWhatsAppDB(params.sql);
      return JSON.stringify(rows, null, 2);
    }

    default:
      throw new Error(
        `Unknown operation: ${action}\n\nUse action='describe' to see available operations.`
      );
  }
}

// Handle the single gateway tool call (MCP Hubby pattern)
async function handleGatewayTool(args: Record<string, any>): Promise<string> {
  const action = args.action as string;
  const params = (args.params || {}) as Record<string, any>;

  // No action = describe all
  if (!action) {
    return describeAllServices();
  }

  // describe action
  if (action === "describe") {
    if (params.operation) {
      return describeOperation(params.operation);
    }
    return describeAllServices();
  }

  // Convert dot notation to internal name (e.g., "whatsapp.chats" → "whatsapp_chats")
  const internalName = fromDotNotation(action);
  if (!internalName) {
    // Maybe just a service name? Show helpful error
    const service = services.find((s) => s.name === action);
    if (service) {
      return `To use ${service.displayName}, specify an operation:\n\n${describeService(service)}`;
    }
    const available = services.map((s) => s.name).join(", ");
    return `Unknown action: ${action}\n\nExpected format: service.operation (e.g., whatsapp.chats)\nAvailable services: ${available}\nUse action='describe' to see all operations.`;
  }

  // Execute the operation
  return await executeOperation(internalName, params);
}

// Generate tools dynamically (one per service)
const tools = generateTools();

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

// Create MCP server
function createServer(): Server {
  const server = new Server(
    { name: "machina", version: VERSION },
    { capabilities: { tools: { listChanged: false } } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.log(`Listing ${tools.length} gateway tool (single tool pattern)`);
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    console.log(`Tool call: ${name}, action: ${args?.action || "none"}`);

    // Single gateway tool pattern - only "machina" tool exists
    if (name !== "machina") {
      return {
        content: [
          {
            type: "text",
            text: `Unknown tool: ${name}. Use 'machina' with action='service.operation' pattern.`,
          },
        ],
        isError: true,
      };
    }

    try {
      const result = await handleGatewayTool(args || {});
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

// Request logging middleware
app.use((req, _res, next) => {
  console.log(
    `${new Date().toISOString()} ${req.method} ${req.path} - Headers: ${JSON.stringify(req.headers)}`
  );
  next();
});

// Health check (no auth required)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", version: VERSION });
});

// MCP handler - stateless, creates new server per request
const mcpHandler = async (req: Request, res: Response) => {
  try {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless - no sessions
      enableJsonResponse: true, // Return JSON instead of SSE
    });

    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
        id: null,
      });
    }
  }
};

// MCP endpoint - handle both GET and POST
app.get("/mcp", authenticate, mcpHandler);
app.post("/mcp", authenticate, mcpHandler);

// Start server
const httpServer = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Machina MCP gateway running on http://0.0.0.0:${PORT}`);
  console.log(`MCP endpoint: POST /mcp`);
  console.log(`Health check: GET /health`);
  console.log(`\nSingle gateway tool pattern (like MCP Hubby):`);
  console.log(`  Tool: machina`);
  console.log(`  Usage: machina(action='service.operation', params={...})`);
  console.log(`\nAvailable services:`);
  for (const service of services) {
    const ops = getServiceOperations(service);
    console.log(`  ${service.name}.* (${ops.length} operations)`);
  }
});
