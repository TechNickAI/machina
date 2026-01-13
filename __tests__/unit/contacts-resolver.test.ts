import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Create mock database instance
const mockStatement = {
  all: vi.fn((sql?: string) => {
    // Return different data based on SQL
    const query = mockStatement.all.mock.calls[mockStatement.all.mock.calls.length - 1]?.[0] || "";
    if (query.includes && query.includes("ZABCDPHONENUMBER")) {
      return [
        { phone: "+1 555 123 4567", name: "John Doe" },
        { phone: "555-987-6543", name: "Jane Smith" },
      ];
    }
    if (query.includes && query.includes("ZABCDEMAILADDRESS")) {
      return [
        { email: "john@example.com", name: "John Doe" },
        { email: "jane@example.com", name: "Jane Smith" },
      ];
    }
    return [];
  }),
};

const mockDbInstance = {
  prepare: vi.fn().mockImplementation((sql: string) => ({
    all: vi.fn(() => {
      if (sql.includes("ZABCDPHONENUMBER")) {
        return [
          { phone: "+1 555 123 4567", name: "John Doe" },
          { phone: "555-987-6543", name: "Jane Smith" },
        ];
      }
      if (sql.includes("ZABCDEMAILADDRESS")) {
        return [
          { email: "john@example.com", name: "John Doe" },
          { email: "jane@example.com", name: "Jane Smith" },
        ];
      }
      return [];
    }),
  })),
  close: vi.fn(),
};

// Mock better-sqlite3
vi.mock("better-sqlite3", () => {
  function MockDatabase() {
    return mockDbInstance;
  }
  return { default: MockDatabase };
});

// Mock child_process exec via promisify
vi.mock("node:util", async () => {
  const actual = await vi.importActual("node:util");
  return {
    ...actual,
    promisify: () => async (cmd: string) => {
      if (cmd.includes("ls -d")) {
        return {
          stdout: "/Users/test/Library/Application Support/AddressBook/Sources/123/\n",
        };
      }
      return { stdout: "" };
    },
  };
});

import {
  resolveHandleToName,
  resolveHandlesToNames,
  searchContactsByName,
  clearContactCache,
} from "../../lib/contacts-resolver.js";

describe("Contacts Resolver Module", () => {
  beforeEach(() => {
    clearContactCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearContactCache();
  });

  describe("resolveHandleToName", () => {
    it("should resolve phone number to contact name", async () => {
      const result = await resolveHandleToName("+1 555 123 4567");
      expect(result).toBe("John Doe");
    });

    it("should resolve email to contact name", async () => {
      const result = await resolveHandleToName("john@example.com");
      expect(result).toBe("John Doe");
    });

    it("should return original handle when no match found", async () => {
      const result = await resolveHandleToName("unknown@test.com");
      expect(result).toBe("unknown@test.com");
    });

    it("should be case-insensitive for emails", async () => {
      const result = await resolveHandleToName("JOHN@EXAMPLE.COM");
      expect(result).toBe("John Doe");
    });
  });

  describe("resolveHandlesToNames", () => {
    it("should resolve multiple handles at once", async () => {
      const handles = ["john@example.com", "unknown@test.com"];
      const result = await resolveHandlesToNames(handles);

      expect(result.get("john@example.com")).toBe("John Doe");
      expect(result.get("unknown@test.com")).toBe("unknown@test.com");
    });

    it("should return a Map", async () => {
      const result = await resolveHandlesToNames(["test"]);
      expect(result).toBeInstanceOf(Map);
    });
  });

  describe("searchContactsByName", () => {
    it("should find contacts by partial name match", async () => {
      const results = await searchContactsByName("John");
      expect(results.some((r) => r.name === "John Doe")).toBe(true);
    });

    it("should be case-insensitive", async () => {
      const results = await searchContactsByName("JANE");
      expect(results.some((r) => r.name === "Jane Smith")).toBe(true);
    });

    it("should return empty array when no matches", async () => {
      const results = await searchContactsByName("NonexistentPerson123");
      expect(results).toEqual([]);
    });
  });

  describe("cache behavior", () => {
    it("should clear cache with clearContactCache", async () => {
      // Build cache
      await resolveHandleToName("john@example.com");

      // Clear it
      clearContactCache();

      // Cache should rebuild on next call
      const result = await resolveHandleToName("john@example.com");
      expect(result).toBe("John Doe");
    });
  });
});
