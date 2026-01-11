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
    name: "raw_applescript",
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
      "machina(action='raw_applescript', params={script: 'tell application \"Finder\" to get name of startup disk'})",
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
];

// Generate describe output
function describeAll(): string {
  const lines = ["Available operations for Machina:\n"];

  // Group by category
  const categories = {
    Messages: operations.filter((o) => o.name.startsWith("messages_")),
    Notes: operations.filter((o) => o.name.startsWith("notes_")),
    Reminders: operations.filter((o) => o.name.startsWith("reminders_")),
    Contacts: operations.filter((o) => o.name.startsWith("contacts_")),
    System: operations.filter((o) => o.name.startsWith("system_")),
    Advanced: operations.filter((o) => o.name.startsWith("raw_")),
  };

  for (const [category, ops] of Object.entries(categories)) {
    if (ops.length === 0) continue;
    lines.push(`\n**${category}:**`);
    for (const op of ops) {
      const requiredParams = op.parameters
        .filter((p) => p.required)
        .map((p) => p.name)
        .join(", ");
      lines.push(
        `  ${op.name}${requiredParams ? `(${requiredParams})` : ""} - ${op.description.split(".")[0]}`,
      );
    }
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

// Escape string for AppleScript double-quoted strings
function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Escape string for SQL LIKE patterns (prevents SQL injection)
function escapeSQL(str: string): string {
  return str.replace(/'/g, "''").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// Escape string for shell to prevent command injection
function escapeShell(str: string): string {
  return str.replace(/\$/g, "\\$").replace(/`/g, "\\`").replace(/"/g, '\\"');
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

// SQLite query helper for Messages - escapes shell metacharacters
async function queryMessagesDB(sql: string): Promise<string> {
  try {
    const escapedSQL = escapeShell(sql);
    const { stdout } = await execAsync(
      `sqlite3 ~/Library/Messages/chat.db "${escapedSQL}"`,
    );
    return stdout.trim();
  } catch (error: any) {
    throw new Error(`Messages database error: ${error.message}`);
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
      const escapedTo = escapeAppleScript(params.to);
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

    // ============== NOTES ==============
    case "notes_list": {
      const limit = Math.min(Math.max(1, params.limit || 20), 100);
      const folderFilter = params.folder
        ? `of folder "${escapeAppleScript(params.folder)}"`
        : "";
      const script = `tell application "Notes"
        set noteList to {}
        set allNotes to notes ${folderFilter}
        set noteCount to count of allNotes
        if noteCount > ${limit} then set noteCount to ${limit}
        repeat with i from 1 to noteCount
          set n to item i of allNotes
          set noteTitle to name of n
          set noteFolder to name of container of n
          set end of noteList to noteFolder & ": " & noteTitle
        end repeat
        return noteList as text
      end tell`;
      return await runAppleScript(script);
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
      return await runAppleScript(script);
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
      return await runAppleScript(script);
    }

    case "notes_search": {
      if (!params.query) throw new Error("Missing required parameter: query");
      const limit = Math.min(Math.max(1, params.limit || 10), 100);
      const escapedQuery = escapeAppleScript(params.query);
      const script = `tell application "Notes"
        set matchingNotes to (notes whose name contains "${escapedQuery}" or plaintext contains "${escapedQuery}")
        set noteList to {}
        set noteCount to count of matchingNotes
        if noteCount > ${limit} then set noteCount to ${limit}
        repeat with i from 1 to noteCount
          set n to item i of matchingNotes
          set noteTitle to name of n
          set noteFolder to name of container of n
          set end of noteList to noteFolder & ": " & noteTitle
        end repeat
        return noteList as text
      end tell`;
      return await runAppleScript(script);
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
      return await runAppleScript(script);
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
      return await runAppleScript(script);
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
      return await runAppleScript(script);
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
      return await runAppleScript(script);
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
      return await runAppleScript(script);
    }

    // ============== RAW APPLESCRIPT ==============
    case "raw_applescript": {
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

    default:
      throw new Error(
        `Unknown operation: ${action}\n\nUse action='describe' to see available operations.`,
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
      "Access Mac capabilities: Messages (send, read, search), Notes (list, read, create), " +
      "Reminders (list, create, complete), Contacts (search, get). " +
      "Use action='describe' to see all operations.",
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
    { name: "machina", version: "1.4.1" },
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
  res.json({ status: "ok", version: "1.4.1" });
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
const httpServer = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Machina MCP gateway running on http://0.0.0.0:${PORT}`);
  console.log(`MCP endpoint: POST /mcp`);
  console.log(`Health check: GET /health`);
  console.log(
    `\nProgressive disclosure: 1 gateway tool with ${operations.length} operations`,
  );
  console.log(`Operations: ${operations.map((o) => o.name).join(", ")}`);
});
