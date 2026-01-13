/**
 * AppleScript execution adapter with mock support for testing
 *
 * Dual-mode operation:
 * - MACHINA_LIVE_TESTS=true  → Real AppleScript calls
 * - MACHINA_LIVE_TESTS unset → Mock responses (CI-safe)
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { PermissionError, TimeoutError } from "./errors.js";

const execAsync = promisify(exec);

// Timeout configuration (ms)
export const APPLESCRIPT_TIMEOUT = 10_000; // 10s for normal operations
export const REMINDERS_TIMEOUT = 45_000; // 45s for Reminders (iCloud sync is slow)
export const PERMISSION_CHECK_TIMEOUT = 3_000; // 3s for permission checks

// Permission cache: tracks which apps have been verified this session
const permissionCache = new Map<string, boolean>();

// Test mode detection
export const isLiveMode = process.env.MACHINA_LIVE_TESTS === "true";

/**
 * Mock responses for testing (keyed by script substring)
 */
const mockResponses: Record<string, string> = {
  // Reminders
  'tell application "Reminders" to return name of lists': "Reminders\nWork\nShopping",
  'tell application "Reminders"': JSON.stringify({ created: true }),

  // Notes
  'tell application "Notes" to return (count of notes)': "42",
  'tell application "Notes"': "OK",

  // Contacts
  'tell application "Contacts" to return (count of people)': "150",
  'tell application "Contacts"': "",

  // Messages
  'tell application "Messages" to return (count of accounts)': "2",
  'tell application "Messages"': "sent",
};

/**
 * Get mock response for an AppleScript command
 */
function getMockResponse(script: string): string {
  for (const [pattern, response] of Object.entries(mockResponses)) {
    if (script.includes(pattern)) {
      return response;
    }
  }
  return "";
}

/**
 * Escape string for AppleScript double-quoted strings
 */
export function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Ensure an app is running before AppleScript can talk to it
 */
async function ensureAppRunning(appName: string): Promise<void> {
  if (!isLiveMode) return; // Skip in test mode

  try {
    await execAsync(`open -a "${appName}" --background`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  } catch {
    // App might already be running or doesn't exist - continue anyway
  }
}

/**
 * Check if an app has automation permission (cached per session)
 */
async function checkPermission(appName: string): Promise<void> {
  if (!isLiveMode) return; // Skip in test mode
  if (permissionCache.get(appName)) return; // Already verified

  const script = `tell application "${appName}" to return 1`;
  try {
    await execAsync(`osascript -e '${script}'`, {
      timeout: PERMISSION_CHECK_TIMEOUT,
    });
    permissionCache.set(appName, true);
  } catch (error: unknown) {
    const err = error as Error & { killed?: boolean; signal?: string };
    if (err.message?.includes("Not authorized")) {
      throw new PermissionError(appName);
    }
    if (err.killed || err.signal === "SIGTERM") {
      throw new TimeoutError(`Permission check for ${appName}`, PERMISSION_CHECK_TIMEOUT / 1000);
    }
    throw new Error(`Permission check failed for ${appName}: ${err.message}`);
  }
}

/**
 * Run AppleScript and return result
 *
 * In test mode (MACHINA_LIVE_TESTS not set), returns mock responses.
 * In live mode, executes real AppleScript.
 *
 * @param script - AppleScript code to execute
 * @param appName - Optional app name for permission checking
 * @param timeoutMs - Timeout in milliseconds
 */
export async function runAppleScript(
  script: string,
  appName?: string,
  timeoutMs: number = APPLESCRIPT_TIMEOUT
): Promise<string> {
  // Return mock response in test mode
  if (!isLiveMode) {
    return getMockResponse(script);
  }

  // Live mode: check permissions and run real AppleScript
  if (appName) {
    await checkPermission(appName);
    await ensureAppRunning(appName);
  }

  try {
    const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
      timeout: timeoutMs,
    });
    return stdout.trim();
  } catch (error: unknown) {
    const err = error as Error & { killed?: boolean; signal?: string };

    if (err.killed || err.signal === "SIGTERM") {
      throw new TimeoutError("AppleScript execution", timeoutMs / 1000);
    }
    if (err.message?.includes("Not authorized")) {
      throw new PermissionError(appName || "the target app");
    }
    throw new Error(`AppleScript error: ${err.message}`);
  }
}

/**
 * Clear the permission cache (useful for testing)
 */
export function clearPermissionCache(): void {
  permissionCache.clear();
}

/**
 * Add a mock response for testing
 */
export function addMockResponse(pattern: string, response: string): void {
  mockResponses[pattern] = response;
}
