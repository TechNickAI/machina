#!/usr/bin/env tsx
/**
 * Triggers all macOS permission prompts for Machina capabilities
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import Database from "better-sqlite3";

const execAsync = promisify(exec);

console.log("Testing all macOS permissions for Machina...\n");

// Test 1: Messages database access (requires Full Disk Access)
console.log("1. Testing Messages database access (requires Full Disk Access)...");
try {
  const messagesDb = Database(`${process.env.HOME}/Library/Messages/chat.db`, { readonly: true });
  const result = messagesDb.prepare("SELECT COUNT(*) as count FROM message").get() as {
    count: number;
  };
  console.log(`✓ Messages DB accessible: ${result.count} messages\n`);
  messagesDb.close();
} catch (error: any) {
  console.error(`✗ Messages DB error: ${error.message}`);
  console.error("   → Grant Full Disk Access to Node.js binary\n");
}

// Test 2: Messages AppleScript (requires Automation)
console.log("2. Testing Messages automation...");
try {
  const script = `tell application "Messages" to return (count of accounts)`;
  const { stdout } = await execAsync(`osascript -e '${script}'`);
  console.log(`✓ Messages automation works: ${stdout.trim()} accounts\n`);
} catch (error: any) {
  console.error(`✗ Messages automation error: ${error.message}`);
  console.error("   → Grant Terminal/Node automation access to Messages\n");
}

// Test 3: Notes AppleScript
console.log("3. Testing Notes automation...");
try {
  const script = `tell application "Notes" to return (count of notes)`;
  const { stdout } = await execAsync(`osascript -e '${script}'`);
  console.log(`✓ Notes automation works: ${stdout.trim()} notes\n`);
} catch (error: any) {
  console.error(`✗ Notes automation error: ${error.message}`);
  console.error("   → Grant Terminal/Node automation access to Notes\n");
}

// Test 4: Reminders AppleScript
console.log("4. Testing Reminders automation...");
try {
  const script = `tell application "Reminders" to return (count of reminders)`;
  const { stdout } = await execAsync(`osascript -e '${script}'`);
  console.log(`✓ Reminders automation works: ${stdout.trim()} reminders\n`);
} catch (error: any) {
  console.error(`✗ Reminders automation error: ${error.message}`);
  console.error("   → Grant Terminal/Node automation access to Reminders\n");
}

// Test 5: Contacts AppleScript
console.log("5. Testing Contacts automation...");
try {
  const script = `tell application "Contacts" to return (count of people)`;
  const { stdout } = await execAsync(`osascript -e '${script}'`);
  console.log(`✓ Contacts automation works: ${stdout.trim()} contacts\n`);
} catch (error: any) {
  console.error(`✗ Contacts automation error: ${error.message}`);
  console.error("   → Grant Terminal/Node automation access to Contacts\n");
}

// Test 6: WhatsApp database (should not need FDA)
console.log("6. Testing WhatsApp database access...");
try {
  const whatsappDbPath = `${process.env.HOME}/machina/components/whatsapp-mcp-ts/data/whatsapp.db`;
  const whatsappDb = Database(whatsappDbPath, { readonly: true });
  const result = whatsappDb.prepare("SELECT COUNT(*) as count FROM messages").get() as {
    count: number;
  };
  console.log(`✓ WhatsApp DB accessible: ${result.count} messages\n`);
  whatsappDb.close();
} catch (error: any) {
  console.error(`✗ WhatsApp DB error: ${error.message}`);
  console.error("   → Check WhatsApp MCP service is running\n");
}

console.log("\n=== Permission Test Complete ===");
console.log("\nIf you saw errors above, you need to grant permissions in:");
console.log("System Settings → Privacy & Security → Full Disk Access");
console.log("System Settings → Privacy & Security → Automation");
