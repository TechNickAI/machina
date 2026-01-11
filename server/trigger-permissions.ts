#!/usr/bin/env bun
/**
 * Trigger all macOS permission prompts at once
 *
 * Run this before installation to frontload permission requests.
 * This prevents piecemeal permission dialogs during operation.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

console.log("🔐 Triggering macOS permission prompts...\n");
console.log("You'll see multiple permission dialogs. Grant them all.\n");

const checks = [
  {
    name: "Contacts",
    script: 'tell application "Contacts" to count every person',
  },
  {
    name: "Messages (read)",
    command:
      "sqlite3 ~/Library/Messages/chat.db 'SELECT COUNT(*) FROM message LIMIT 1'",
  },
  {
    name: "Calendar",
    script: 'tell application "Calendar" to count every calendar',
  },
  {
    name: "Notes",
    script: 'tell application "Notes" to count every note',
  },
  {
    name: "Reminders",
    script: 'tell application "Reminders" to count every list',
  },
];

async function triggerPermission(check: {
  name: string;
  script?: string;
  command?: string;
}) {
  try {
    if (check.script) {
      await execAsync(
        `osascript -e '${check.script.replace(/'/g, "'\"'\"'")}'`,
      );
    } else if (check.command) {
      await execAsync(check.command);
    }
    console.log(`✅ ${check.name}`);
  } catch (error: any) {
    console.log(`⚠️  ${check.name} - ${error.message.split("\n")[0]}`);
  }
}

// Run all checks
for (const check of checks) {
  await triggerPermission(check);
}

console.log("\n🎉 Permission prompts triggered!");
console.log("\nIf you missed any prompts, go to:");
console.log("System Preferences → Privacy & Security → Automation");
console.log("System Preferences → Privacy & Security → Full Disk Access");
