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
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const execAsync = promisify(exec);

const PORT = parseInt(process.env.MACHINA_PORT || "9900", 10);
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
    description: "Send an iMessage to a contact",
    parameters: [
      {
        name: "to",
        type: "string",
        required: true,
        description: "Phone number (e.g., +15551234567) or email address",
      },
      {
        name: "message",
        type: "string",
        required: true,
        description: "Message text to send",
      },
    ],
    returns: "Confirmation message",
    example:
      "machina(action='messages_send', params={to: '+15551234567', message: 'Hello!'})",
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
    example:
      "machina(action='messages_read', params={contact: '+15551234567', limit: 50})",
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
    example:
      "machina(action='messages_search', params={query: 'meeting tomorrow', limit: 10})",
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
    returns:
      "List of conversations with participant info and last message preview",
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
        description:
          "Phone number, email, or contact name to get conversation for",
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
    returns:
      "JSON object with conversation metadata and messages array in LLM-friendly format",
    example:
      "machina(action='conversation_context', params={contact: '+15551234567', days: 7})",
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
    example:
      "machina(action='notes_create', params={title: 'New Note', body: 'Content here'})",
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
    example:
      "machina(action='reminders_list', params={includeCompleted: false})",
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
    example:
      "machina(action='reminders_create', params={title: 'Call mom', list: 'Personal'})",
  },
  {
    name: "reminders_complete",
    description: "Mark a reminder as completed",
    parameters: [
      {
        name: "title",
        type: "string",
        required: true,
        description:
          "Title of the reminder to complete (exact or partial match)",
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
  // Phone numbers alone don't work - use contacts/chats to discover JIDs first.
  {
    name: "whatsapp_send",
    description:
      "Send a WhatsApp message to a contact or group. Requires a JID (not a phone number). " +
      "To find someone's JID: use whatsapp_contacts(query='name') first. " +
      "To find a group JID: use whatsapp_chats() first.",
    parameters: [
      {
        name: "to",
        type: "string",
        required: true,
        description:
          "Recipient JID. Individual: '15551234567@s.whatsapp.net', Group: '120363...@g.us'. " +
          "Use whatsapp_contacts or whatsapp_chats to discover JIDs.",
      },
      {
        name: "message",
        type: "string",
        required: true,
        description: "Message text to send",
      },
    ],
    returns: "Confirmation with message ID",
    example:
      "machina(action='whatsapp_send', params={to: '15551234567@s.whatsapp.net', message: 'Hello!'})",
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
      "Read messages from a specific WhatsApp chat. Get the JID from whatsapp_chats or " +
      "whatsapp_contacts first. Returns messages in chronological order with sender identification.",
    parameters: [
      {
        name: "chatJid",
        type: "string",
        required: true,
        description:
          "Chat JID from whatsapp_chats or whatsapp_contacts (e.g., '15551234567@s.whatsapp.net')",
      },
      {
        name: "limit",
        type: "number",
        required: false,
        description: "Maximum number of messages to return",
        default: 20,
      },
    ],
    returns:
      "Messages with timestamp, sender (Me or contact name), and content",
    example:
      "machina(action='whatsapp_messages', params={chatJid: '15551234567@s.whatsapp.net', limit: 50})",
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
    example:
      "machina(action='whatsapp_search', params={query: 'meeting tomorrow', limit: 10})",
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
    example:
      "machina(action='whatsapp_contacts', params={query: 'John Smith', limit: 10})",
  },
  {
    name: "whatsapp_chat_context",
    description:
      "Get a WhatsApp conversation formatted for LLM analysis. Returns messages in a structured format " +
      "with clear identification of who sent each message (you vs others), conversation metadata, " +
      "and message counts. Ideal for AI assistants analyzing message history.",
    parameters: [
      {
        name: "chatJid",
        type: "string",
        required: true,
        description:
          "Chat JID from whatsapp_chats or whatsapp_contacts (e.g., '15551234567@s.whatsapp.net')",
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
    returns:
      "JSON object with conversation metadata and messages array in LLM-friendly format",
    example:
      "machina(action='whatsapp_chat_context', params={chatJid: '15551234567@s.whatsapp.net', days: 7})",
  },
  {
    name: "whatsapp_status",
    description:
      "Check WhatsApp connection status. Use before sending messages to verify the service is connected, " +
      "or to diagnose issues when sends fail. Shows connected user info.",
    parameters: [],
    returns:
      "Connection status (connected/disconnected) and logged-in user info",
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
        description:
          "SELECT query to execute (INSERT/UPDATE/DELETE not allowed)",
      },
    ],
    returns: "Query results as JSON array",
    example:
      "machina(action='whatsapp_raw_sql', params={sql: 'SELECT COUNT(*) as total FROM messages'})",
  },
];

// ============================================================================
// SERVICE DEFINITIONS (mcp-hubby pattern: one tool per service)
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
    description:
      "Send and read WhatsApp messages. Use contacts/chats to discover JIDs first.",
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
    name: "machina",
    displayName: "Machina",
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

// Service-specific workflow hints
const serviceWorkflows: Record<string, string[]> = {
  whatsapp: [
    "\nCommon workflows:",
    "  • Message someone: contacts(query='name') → send(to='<jid>', message='...')",
    "  • Read a chat: chats() → messages(chatJid='<jid>')",
    "  • AI analysis: chats() → chat_context(chatJid='<jid>', days=7)",
    "\nNote: WhatsApp uses JIDs (e.g., '15551234567@s.whatsapp.net'), not phone numbers.",
  ],
};

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
      `  ${shortName}${requiredParams ? `(${requiredParams})` : ""} - ${op.description.split(".")[0]}`,
    );
  }

  // Add service-specific workflow hints
  const workflows = serviceWorkflows[service.name];
  if (workflows) {
    lines.push(...workflows);
  }

  lines.push("\n---");
  lines.push(`Usage: ${service.name}(action='operation', params={...})`);
  lines.push(
    "Tip: action='describe', params={operation: 'name'} for detailed docs",
  );
  return lines.join("\n");
}

function describeOperationForService(
  service: ServiceDef,
  shortName: string,
): string {
  const fullName = service.prefix + shortName;
  const op = operations.find((o) => o.name === fullName);
  if (!op) {
    const available = getServiceOperations(service)
      .map((o) => stripPrefix(o.name, service.prefix))
      .join(", ");
    return `Unknown operation: ${shortName}\n\nAvailable for ${service.displayName}: ${available}`;
  }

  const lines = [
    `**${stripPrefix(op.name, service.prefix)}**\n${op.description}\n`,
  ];

  if (op.parameters.length > 0) {
    lines.push("Parameters:");
    for (const p of op.parameters) {
      const req = p.required ? "required" : `optional, default: ${p.default}`;
      lines.push(`  - ${p.name} (${p.type}, ${req}): ${p.description}`);
    }
  }

  lines.push(`\nReturns: ${op.returns}`);
  lines.push(
    `\nUsage: ${service.name}(action='${stripPrefix(op.name, service.prefix)}', params={...})`,
  );

  return lines.join("\n");
}

// Generate MCP tools array (one tool per service)
function generateTools() {
  return services.map((service) => {
    const ops = getServiceOperations(service);
    const opList = ops
      .map((op) => {
        const shortName = stripPrefix(op.name, service.prefix);
        const requiredParams = op.parameters
          .filter((p) => p.required)
          .map((p) => p.name)
          .join(", ");
        return requiredParams ? `${shortName}(${requiredParams})` : shortName;
      })
      .join(", ");

    return {
      name: service.name,
      description: `${service.description}. Operations: ${opList}. action='describe' for docs`,
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string" },
          params: { type: "object" },
        },
        required: ["action"],
      },
    };
  });
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
async function lookupContact(identifier: string): Promise<string | null> {
  // Detect if this is an email or phone
  const isEmail = identifier.includes("@");

  if (isEmail) {
    // Look up by email
    const escapedEmail = escapeAppleScript(identifier);
    const script = `tell application "Contacts"
      set matchingPeople to (every person whose emails contains "${escapedEmail}")
      if (count of matchingPeople) > 0 then
        return name of item 1 of matchingPeople
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
function getAttachmentType(
  mimeType: string | null,
  filename: string | null,
): string {
  if (mimeType) {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType === "application/pdf") return "pdf";
  }
  if (filename) {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "heic", "webp"].includes(ext || ""))
      return "image";
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
  } catch (error) {
    // App might already be running or doesn't exist - continue anyway
  }
}

// Run AppleScript and return result
async function runAppleScript(
  script: string,
  appName?: string,
): Promise<string> {
  // If an app is specified, ensure it's running first
  if (appName) {
    await ensureAppRunning(appName);
  }
  try {
    const { stdout } = await execAsync(
      `osascript -e '${script.replace(/'/g, "'\"'\"'")}'`,
    );
    return stdout.trim();
  } catch (error: any) {
    throw new Error(`AppleScript error: ${error.message}`);
  }
}

// SQLite query helper for Messages (returns pipe-delimited string)
async function queryMessagesDB(sql: string): Promise<string> {
  const dbPath = `${process.env.HOME}/Library/Messages/chat.db`;
  let db;
  try {
    db = new Database(dbPath, { readonly: true });
    const rows = db.prepare(sql).all();
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
  body?: Record<string, any>,
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
async function executeOperation(
  action: string,
  params: Record<string, any>,
): Promise<string> {
  switch (action) {
    // ============== MESSAGES ==============
    case "messages_send": {
      if (!params.to) throw new Error("Missing required parameter: to");
      if (!params.message)
        throw new Error("Missing required parameter: message");

      const to = params.to.trim();

      // Validate: must be phone number or email, not a name
      const isPhone =
        /^[\d\s\-\(\)\+]+$/.test(to) && to.replace(/\D/g, "").length >= 10;
      const isEmail = to.includes("@") && to.includes(".");

      if (!isPhone && !isEmail) {
        throw new Error(
          `Invalid 'to' format: "${to}" looks like a name, not a phone number or email. ` +
            `Use contacts_search to look up the contact first, then use their phone number ` +
            `(e.g., +15551234567) or email address.`,
        );
      }

      const escapedTo = escapeAppleScript(to);
      const escapedMessage = escapeAppleScript(params.message);
      const script = `tell application "Messages"
        set targetService to 1st account whose service type = iMessage
        set targetBuddy to participant "${escapedTo}" of targetService
        send "${escapedMessage}" to targetBuddy
        return "Message sent to ${escapedTo}"
      end tell`;
      return await runAppleScript(script);
    }

    case "messages_read": {
      if (!params.contact)
        throw new Error("Missing required parameter: contact");
      const limit = Math.min(Math.max(1, params.limit || 20), 100);
      const escapedContact = escapeSQL(params.contact);
      const sql = `SELECT datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') as date,
        CASE WHEN m.is_from_me THEN 'Me' ELSE h.id END as sender,
        m.text
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE h.id LIKE '%${escapedContact}%' ESCAPE '\\' AND m.text IS NOT NULL
        ORDER BY m.date DESC LIMIT ${limit}`;
      const result = await queryMessagesDB(sql);
      return result || `No messages found for ${params.contact}`;
    }

    case "messages_recent": {
      const limit = Math.min(Math.max(1, params.limit || 20), 100);
      const sql = `SELECT datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') as date,
        CASE WHEN m.is_from_me THEN 'Me' ELSE h.id END as sender,
        m.text
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE m.text IS NOT NULL
        ORDER BY m.date DESC LIMIT ${limit}`;
      const result = await queryMessagesDB(sql);
      return result || "No recent messages found";
    }

    case "messages_search": {
      if (!params.query) throw new Error("Missing required parameter: query");
      const limit = Math.min(Math.max(1, params.limit || 20), 100);
      const escapedQuery = escapeSQL(params.query);
      const sql = `SELECT datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') as date,
        CASE WHEN m.is_from_me THEN 'Me' ELSE h.id END as sender,
        m.text
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE m.text LIKE '%${escapedQuery}%' ESCAPE '\\'
        ORDER BY m.date DESC LIMIT ${limit}`;
      const result = await queryMessagesDB(sql);
      return result || `No messages found matching "${params.query}"`;
    }

    case "messages_conversations": {
      const limit = Math.min(Math.max(1, params.limit || 20), 100);
      const sql = `SELECT
        c.display_name as name,
        h.id as participant,
        (SELECT text FROM message WHERE cache_roomnames = c.room_name OR handle_id = h.ROWID ORDER BY date DESC LIMIT 1) as last_message,
        datetime((SELECT date/1000000000 + 978307200 FROM message WHERE cache_roomnames = c.room_name OR handle_id = h.ROWID ORDER BY date DESC LIMIT 1), 'unixepoch', 'localtime') as last_date
        FROM chat c
        LEFT JOIN chat_handle_join chj ON c.ROWID = chj.chat_id
        LEFT JOIN handle h ON chj.handle_id = h.ROWID
        GROUP BY c.ROWID
        ORDER BY last_date DESC
        LIMIT ${limit}`;
      const result = await queryMessagesDB(sql);
      return result || "No conversations found";
    }

    case "messages_conversation_context": {
      if (!params.contact)
        throw new Error("Missing required parameter: contact");

      const days = Math.min(Math.max(1, params.days || 7), 365);
      const limit = Math.min(Math.max(1, params.limit || 100), 500);

      // If contact looks like a name (not phone/email), resolve it first
      let contactHandle = params.contact.trim();
      const isPhone = /^[\d\s\-\(\)\+]+$/.test(contactHandle);
      const isEmail = contactHandle.includes("@");

      if (!isPhone && !isEmail) {
        // Assume it's a name - look up phone/email from contacts
        const escapedName = escapeAppleScript(contactHandle);
        const script = `tell application "Contacts"
          set matchingPeople to (every person whose name contains "${escapedName}")
          if (count of matchingPeople) > 0 then
            set p to item 1 of matchingPeople
            set pPhones to phones of p
            if (count of pPhones) > 0 then
              return value of item 1 of pPhones
            else
              set pEmails to emails of p
              if (count of pEmails) > 0 then
                return value of item 1 of pEmails
              else
                return ""
              end if
            end if
          else
            return ""
          end if
        end tell`;

        try {
          const resolved = await runAppleScript(script, "Contacts");
          if (!resolved.trim()) {
            return JSON.stringify(
              {
                error: `No contact found with name "${params.contact}"`,
              },
              null,
              2,
            );
          }
          contactHandle = resolved.trim();
        } catch (error: any) {
          throw new Error(`Failed to resolve contact name: ${error.message}`);
        }
      }

      const escapedContact = escapeSQL(contactHandle);

      // Apple epoch: seconds since 2001-01-01, stored as nanoseconds
      const appleEpochOffset = 978307200;
      const daysAgoTimestamp =
        (Date.now() / 1000 - days * 24 * 60 * 60 - appleEpochOffset) *
        1000000000;

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
          2,
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
      const sevenDaysAgo =
        (Date.now() / 1000 - 7 * 24 * 60 * 60 - appleEpochOffset) * 1000000000;
      const thirtyDaysAgo =
        (Date.now() / 1000 - 30 * 24 * 60 * 60 - appleEpochOffset) * 1000000000;

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

      // Look up contact name
      const contactName = await lookupContact(handleId);

      // Get attachment details for messages that have them
      const attachmentIds = messages
        .filter((m) => m.attachment_id)
        .map((m) => m.attachment_id);

      let attachments: Record<string, any> = {};
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
              last_message_from: meta.last_is_from_me
                ? "you"
                : contactName || handleId,
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
              messageMap
                .get(m.message_id)!
                .attachments.push(attachments[m.attachment_id]);
            }
          }

          // Convert map to array and clean up empty attachments
          return Array.from(messageMap.values()).map((msg) => {
            if (msg.attachments.length === 0) {
              delete msg.attachments;
            } else if (!msg.content) {
              // If no text but has attachments, show attachment types
              msg.content = msg.attachments
                .map((a: any) => `[${a.type}]`)
                .join(" ");
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
        throw new Error(
          `Invalid attachment ID format: ${params.id}. Expected format: att_12345`,
        );
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
        2,
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
      const completedFilter = params.includeCompleted
        ? ""
        : "whose completed is false";

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
      return await runAppleScript(script, "Reminders");
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
      return await runAppleScript(script, "Reminders");
    }

    case "reminders_complete": {
      if (!params.title) throw new Error("Missing required parameter: title");
      const escapedTitle = escapeAppleScript(params.title);
      const listFilter = params.list
        ? `of list "${escapeAppleScript(params.list)}"`
        : "";
      const script = `tell application "Reminders"
        set matchingReminders to (reminders ${listFilter} whose name contains "${escapedTitle}" and completed is false)
        if (count of matchingReminders) = 0 then
          return "No incomplete reminder found matching: ${escapedTitle}"
        end if
        set targetReminder to item 1 of matchingReminders
        set completed of targetReminder to true
        return "Completed: " & name of targetReminder
      end tell`;
      return await runAppleScript(script, "Reminders");
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
        const { stdout: dirtyCheck } = await execAsync(
          "git status --porcelain",
          {
            cwd: process.cwd(),
          },
        );
        if (dirtyCheck.trim()) {
          updateInProgress = false;
          return "Cannot update: uncommitted local changes detected. Commit or stash changes first.";
        }

        // Get current commit
        const { stdout: beforeCommit } = await execAsync(
          "git rev-parse --short HEAD",
          { cwd: process.cwd() },
        );
        results.push(`Before: ${beforeCommit.trim()}`);

        // Fetch and check for updates
        await execAsync("git fetch", { cwd: process.cwd() });
        const { stdout: behind } = await execAsync(
          "git rev-list HEAD..origin/main --count",
          { cwd: process.cwd() },
        );

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
        const { stdout: afterCommit } = await execAsync(
          "git rev-parse --short HEAD",
          { cwd: process.cwd() },
        );
        results.push(`After: ${afterCommit.trim()}`);

        // Validate commit hashes (prevent shell injection)
        const commitRegex = /^[a-f0-9]+$/i;
        if (
          !commitRegex.test(beforeCommit.trim()) ||
          !commitRegex.test(afterCommit.trim())
        ) {
          throw new Error("Invalid commit hash format");
        }

        // Get changelog using validated commits
        const { stdout: changelog } = await execAsync(
          `git log ${beforeCommit.trim()}..${afterCommit.trim()} --oneline`,
          { cwd: process.cwd() },
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
        const { stdout: commit } = await execAsync(
          "git rev-parse --short HEAD",
          {
            cwd: process.cwd(),
          },
        );
        const { stdout: branch } = await execAsync(
          "git rev-parse --abbrev-ref HEAD",
          { cwd: process.cwd() },
        );

        status.push(`Version: 1.1.0`);
        status.push(`Commit: ${commit.trim()}`);
        status.push(`Branch: ${branch.trim()}`);

        // Check if behind remote (optional - don't fail if network unavailable)
        try {
          await execAsync("git fetch", { cwd: process.cwd() });
          const { stdout: behind } = await execAsync(
            "git rev-list HEAD..origin/main --count",
            { cwd: process.cwd() },
          );
          status.push(
            `Updates available: ${behind.trim() === "0" ? "No" : `Yes (${behind.trim()} commits behind)`}`,
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
      if (!params.message)
        throw new Error("Missing required parameter: message");

      // Validate JID format - help users who try to use phone numbers directly
      const to = params.to.trim();
      if (!to.includes("@")) {
        throw new Error(
          `Invalid recipient format: "${to}". WhatsApp requires a JID, not a phone number.\n\n` +
            `To find someone's JID:\n` +
            `  1. whatsapp(action='contacts', params={query: 'name or number'})\n` +
            `  2. Use the JID from the result (e.g., '15551234567@s.whatsapp.net')\n\n` +
            `For groups, use whatsapp(action='chats') to find group JIDs.`,
        );
      }

      const result = await callWhatsAppAPI("/api/send", "POST", {
        recipient: to,
        message: params.message,
      });

      if (result.success) {
        return `Message sent to ${result.recipient}\nMessage ID: ${result.message_id}`;
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

      return rows
        .map(
          (r) =>
            `${r.name || r.jid} (${r.jid})\n  Last: ${r.last_message_time || "unknown"}`,
        )
        .join("\n\n");
    }

    case "whatsapp_messages": {
      if (!params.chatJid)
        throw new Error("Missing required parameter: chatJid");
      const limit = Math.min(Math.max(1, params.limit || 20), 100);
      const escaped = escapeSQL(params.chatJid);

      const sql = `SELECT timestamp,
        CASE WHEN is_from_me THEN 'Me' ELSE sender END as sender,
        content
        FROM messages
        WHERE chat_jid = '${escaped}'
        ORDER BY timestamp DESC LIMIT ${limit}`;

      const rows = await queryWhatsAppDB(sql);
      if (rows.length === 0)
        return `No messages found for chat: ${params.chatJid}`;

      return rows
        .map((r) => `[${r.timestamp}] ${r.sender}: ${r.content}`)
        .join("\n");
    }

    case "whatsapp_search": {
      if (!params.query) throw new Error("Missing required parameter: query");
      const limit = Math.min(Math.max(1, params.limit || 20), 100);
      const escaped = escapeSQL(params.query);

      const sql = `SELECT m.timestamp,
        CASE WHEN m.is_from_me THEN 'Me' ELSE m.sender END as sender,
        c.name as chat_name,
        m.content
        FROM messages m
        LEFT JOIN chats c ON m.chat_jid = c.jid
        WHERE m.content LIKE '%${escaped}%' ESCAPE '\\'
        ORDER BY m.timestamp DESC LIMIT ${limit}`;

      const rows = await queryWhatsAppDB(sql);
      if (rows.length === 0)
        return `No messages found matching: ${params.query}`;

      return rows
        .map(
          (r) =>
            `[${r.timestamp}] ${r.chat_name || "Unknown"} - ${r.sender}: ${r.content}`,
        )
        .join("\n");
    }

    case "whatsapp_contacts": {
      if (!params.query) throw new Error("Missing required parameter: query");
      const limit = Math.min(Math.max(1, params.limit || 20), 100);
      const escaped = escapeSQL(params.query);

      const sql = `SELECT jid, name FROM contacts
        WHERE name LIKE '%${escaped}%' ESCAPE '\\' OR jid LIKE '%${escaped}%' ESCAPE '\\'
        LIMIT ${limit}`;

      const rows = await queryWhatsAppDB(sql);
      if (rows.length === 0)
        return `No contacts found matching: ${params.query}`;

      return rows.map((r) => `${r.name || "Unknown"} (${r.jid})`).join("\n");
    }

    case "whatsapp_chat_context": {
      if (!params.chatJid)
        throw new Error("Missing required parameter: chatJid");

      const days = Math.min(Math.max(1, params.days || 7), 365);
      const limit = Math.min(Math.max(1, params.limit || 100), 500);
      const escaped = escapeSQL(params.chatJid);

      // Calculate timestamp for N days ago (WhatsApp uses Unix seconds)
      const daysAgoTimestamp =
        Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;

      // Get messages
      const messagesSql = `
        SELECT
          timestamp,
          is_from_me,
          sender,
          content
        FROM messages
        WHERE chat_jid = '${escaped}'
          AND timestamp > ${daysAgoTimestamp}
        ORDER BY timestamp ASC
        LIMIT ${limit}`;

      const messages = await queryWhatsAppDB(messagesSql);

      if (messages.length === 0) {
        return JSON.stringify(
          {
            error: `No messages found for "${params.chatJid}" in the last ${days} days`,
          },
          null,
          2,
        );
      }

      // Get chat metadata
      const metaSql = `
        SELECT name FROM chats WHERE jid = '${escaped}'`;
      const chatMeta = await queryWhatsAppDB(metaSql);
      const chatName = chatMeta[0]?.name || params.chatJid;

      // Get conversation stats
      const statsSql = `
        SELECT
          MIN(timestamp) as first_message,
          MAX(timestamp) as last_message,
          COUNT(*) as total_messages,
          SUM(CASE WHEN is_from_me = 1 THEN 1 ELSE 0 END) as from_you,
          SUM(CASE WHEN is_from_me = 0 THEN 1 ELSE 0 END) as from_them
        FROM messages
        WHERE chat_jid = '${escaped}'
          AND timestamp > ${daysAgoTimestamp}`;
      const stats = (await queryWhatsAppDB(statsSql))[0];

      // Format messages for LLM analysis
      const formattedMessages = messages.map((m: any) => ({
        timestamp: new Date(m.timestamp * 1000).toISOString(),
        sender: m.is_from_me ? "You" : m.sender || "Them",
        content: m.content,
      }));

      // Build LLM-friendly response
      const context = {
        conversation: {
          name: chatName,
          jid: params.chatJid,
          type: params.chatJid.includes("@g.us") ? "group" : "individual",
        },
        metadata: {
          days_included: days,
          first_message: stats.first_message
            ? new Date(stats.first_message * 1000).toISOString()
            : null,
          last_message: stats.last_message
            ? new Date(stats.last_message * 1000).toISOString()
            : null,
          total_messages: stats.total_messages,
          from_you: stats.from_you,
          from_them: stats.from_them,
        },
        messages: formattedMessages,
      };

      return JSON.stringify(context, null, 2);
    }

    case "whatsapp_raw_sql": {
      if (!params.sql) throw new Error("Missing required parameter: sql");

      // Only allow SELECT queries (read-only)
      const normalizedSql = params.sql.trim().toLowerCase();
      if (!normalizedSql.startsWith("select")) {
        throw new Error(
          "Only SELECT queries are allowed. WhatsApp raw_sql is read-only.",
        );
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
            `Query contains forbidden keyword: ${keyword}. WhatsApp raw_sql is read-only.`,
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
        `Unknown operation: ${action}\n\nUse action='describe' to see available operations.`,
      );
  }
}

// Handle a service tool call (mcp-hubby pattern: one tool per service)
async function handleServiceTool(
  serviceName: string,
  args: Record<string, any>,
): Promise<string> {
  const service = services.find((s) => s.name === serviceName);
  if (!service) {
    return `Unknown service: ${serviceName}`;
  }

  const action = args.action as string;
  const params = (args.params || {}) as Record<string, any>;

  // No action = describe
  if (!action) {
    return describeService(service);
  }

  // describe action
  if (action === "describe") {
    if (params.operation) {
      return describeOperationForService(service, params.operation);
    }
    return describeService(service);
  }

  // Execute the operation (add prefix back)
  const fullAction = service.prefix + action;
  return await executeOperation(fullAction, params);
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
    { capabilities: { tools: { listChanged: false } } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.log(`Listing ${tools.length} service tools (mcp-hubby pattern)`);
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    console.log(`Tool call: ${name}, action: ${args?.action || "none"}`);

    // Check if this is a valid service
    const service = services.find((s) => s.name === name);
    if (!service) {
      const available = services.map((s) => s.name).join(", ");
      return {
        content: [
          {
            type: "text",
            text: `Unknown service: ${name}. Available: ${available}`,
          },
        ],
        isError: true,
      };
    }

    try {
      const result = await handleServiceTool(name, args || {});
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
  res.json({ status: "ok", version: VERSION });
});

// MCP endpoint - stateless mode (no sessions, JSON responses)
app.post("/mcp", authenticate, async (req: Request, res: Response) => {
  try {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless - no session management
      enableJsonResponse: true, // Return JSON instead of SSE
    });

    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP error:", error);
    res.status(500).json({
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal error" },
      id: null,
    });
  }
});

// Start server
const httpServer = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Machina MCP gateway running on http://0.0.0.0:${PORT}`);
  console.log(`MCP endpoint: POST /mcp`);
  console.log(`Health check: GET /health`);
  console.log(`\n${tools.length} service tools (mcp-hubby pattern):`);
  for (const service of services) {
    const ops = getServiceOperations(service);
    console.log(`  ${service.name}: ${ops.length} operations`);
  }
});
