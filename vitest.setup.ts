import { vi, beforeAll, afterAll } from "vitest";

/**
 * Machina Test Setup
 *
 * Dual-mode testing:
 * - MACHINA_LIVE_TESTS=true  → Real AppleScript calls (Mac integration)
 * - MACHINA_LIVE_TESTS unset → Mocked responses (CI-safe)
 */

export const isLiveTest = process.env.MACHINA_LIVE_TESTS === "true";

// Log test mode on startup
beforeAll(() => {
  if (isLiveTest) {
    console.log("\x1b[33m⚡ LIVE TEST MODE - Real Apple API calls enabled\x1b[0m");
  } else {
    console.log("\x1b[36m🔒 MOCK TEST MODE - AppleScript calls mocked\x1b[0m");
  }
});

/**
 * Mock AppleScript responses for CI testing
 */
export const mockAppleScriptResponses: Record<string, string> = {
  // Reminders
  'tell application "Reminders" to return name of lists': JSON.stringify([
    "Reminders",
    "Work",
    "Shopping",
  ]),

  // Notes
  'tell application "Notes" to return (count of notes)': "42",

  // Contacts
  'tell application "Contacts" to return (count of people)': "150",

  // Messages - permission check
  'tell application "Messages" to return (count of accounts)': "2",
};

// Silence console in tests unless DEBUG_TESTS is set
if (!process.env.DEBUG_TESTS) {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
}

afterAll(() => {
  vi.restoreAllMocks();
});
