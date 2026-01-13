import { describe, it, expect } from "vitest";
import {
  escapeSQL,
  normalizePhone,
  formatRelativeTime,
  formatChatAge,
  isPhoneNumber,
} from "../../lib/utils.js";

describe("Utils Module", () => {
  describe("escapeSQL", () => {
    it("should escape single quotes", () => {
      expect(escapeSQL("O'Brien")).toBe("O''Brien");
    });

    it("should escape backslashes", () => {
      expect(escapeSQL("path\\to\\file")).toBe("path\\\\to\\\\file");
    });

    it("should escape LIKE wildcards", () => {
      expect(escapeSQL("100%")).toBe("100\\%");
      expect(escapeSQL("user_name")).toBe("user\\_name");
    });

    it("should escape all special characters together", () => {
      expect(escapeSQL("100% of O'Brien's files_*")).toBe("100\\% of O''Brien''s files\\_*");
    });

    it("should handle empty string", () => {
      expect(escapeSQL("")).toBe("");
    });
  });

  describe("normalizePhone", () => {
    it("should add country code to 10-digit numbers", () => {
      expect(normalizePhone("5551234567")).toBe("15551234567");
    });

    it("should keep 11-digit US numbers as-is", () => {
      expect(normalizePhone("15551234567")).toBe("15551234567");
    });

    it("should strip formatting characters", () => {
      expect(normalizePhone("(555) 123-4567")).toBe("15551234567");
      expect(normalizePhone("+1 555 123 4567")).toBe("15551234567");
    });

    it("should handle international numbers", () => {
      expect(normalizePhone("+44 20 7123 4567")).toBe("442071234567");
    });
  });

  describe("formatRelativeTime", () => {
    it("should format recent times as 'just now'", () => {
      const now = new Date();
      expect(formatRelativeTime(now)).toBe("just now");
    });

    it("should format minutes ago", () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatRelativeTime(fiveMinAgo)).toBe("5 minutes ago");
    });

    it("should format hours ago", () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoHoursAgo)).toBe("2 hours ago");
    });

    it("should format yesterday", () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(yesterday)).toBe("yesterday");
    });

    it("should format days ago", () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(threeDaysAgo)).toBe("3 days ago");
    });
  });

  describe("formatChatAge", () => {
    it("should format today", () => {
      const today = new Date();
      expect(formatChatAge(today)).toBe("today");
    });

    it("should format days", () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      expect(formatChatAge(fiveDaysAgo)).toBe("5 days");
    });

    it("should format months", () => {
      const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      expect(formatChatAge(twoMonthsAgo)).toBe("2 months");
    });

    it("should format years and months", () => {
      const oneYearThreeMonthsAgo = new Date(Date.now() - (365 + 90) * 24 * 60 * 60 * 1000);
      expect(formatChatAge(oneYearThreeMonthsAgo)).toBe("1 year, 3 months");
    });
  });

  describe("isPhoneNumber", () => {
    it("should return true for valid phone formats", () => {
      expect(isPhoneNumber("5551234567")).toBe(true);
      expect(isPhoneNumber("(555) 123-4567")).toBe(true);
      expect(isPhoneNumber("+1 555 123 4567")).toBe(true);
      expect(isPhoneNumber("555-123-4567")).toBe(true);
    });

    it("should return false for non-phone strings", () => {
      expect(isPhoneNumber("hello")).toBe(false);
      expect(isPhoneNumber("user@email.com")).toBe(false);
      expect(isPhoneNumber("123abc")).toBe(false);
    });
  });
});
