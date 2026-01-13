import { describe, it, expect, beforeEach } from "vitest";
import {
  escapeAppleScript,
  runAppleScript,
  addMockResponse,
  clearPermissionCache,
  isLiveMode,
} from "../../lib/applescript.js";

describe("AppleScript Module", () => {
  beforeEach(() => {
    clearPermissionCache();
  });

  describe("escapeAppleScript", () => {
    it("should escape backslashes", () => {
      expect(escapeAppleScript("path\\to\\file")).toBe("path\\\\to\\\\file");
    });

    it("should escape double quotes", () => {
      expect(escapeAppleScript('say "hello"')).toBe('say \\"hello\\"');
    });

    it("should escape both in combination", () => {
      expect(escapeAppleScript('path\\to\\"file"')).toBe('path\\\\to\\\\\\"file\\"');
    });

    it("should handle empty string", () => {
      expect(escapeAppleScript("")).toBe("");
    });

    it("should handle string with no special characters", () => {
      expect(escapeAppleScript("hello world")).toBe("hello world");
    });
  });

  describe("runAppleScript (mock mode)", () => {
    it("should return mock response for Reminders", async () => {
      // In CI/test mode, this should return a mock response
      if (!isLiveMode) {
        const result = await runAppleScript('tell application "Reminders" to return name of lists');
        expect(result).toContain("Reminders");
      }
    });

    it("should return mock response for Notes count", async () => {
      if (!isLiveMode) {
        const result = await runAppleScript('tell application "Notes" to return (count of notes)');
        expect(result).toBe("42");
      }
    });

    it("should return empty string for unknown scripts", async () => {
      if (!isLiveMode) {
        const result = await runAppleScript("some random script that has no mock");
        expect(result).toBe("");
      }
    });

    it("should use custom mock responses", async () => {
      if (!isLiveMode) {
        addMockResponse("tell app Custom", "custom response");
        const result = await runAppleScript("tell app Custom to do something");
        expect(result).toBe("custom response");
      }
    });
  });

  describe("test mode detection", () => {
    it("should detect test mode correctly", () => {
      // In CI, isLiveMode should be false
      // This test documents the expected behavior
      expect(typeof isLiveMode).toBe("boolean");
    });
  });
});
