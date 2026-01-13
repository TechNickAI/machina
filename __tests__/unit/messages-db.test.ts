import { describe, it, expect, vi, beforeEach } from "vitest";

// Create mock instances that will be returned by constructor
const mockStatement = {
  all: vi.fn().mockReturnValue([
    { id: 1, text: "Hello" },
    { id: 2, text: "World" },
  ]),
  get: vi.fn().mockReturnValue({ count: 1 }),
};

const mockDbInstance = {
  prepare: vi.fn().mockReturnValue(mockStatement),
  close: vi.fn(),
};

// Mock better-sqlite3 with a constructor function
vi.mock("better-sqlite3", () => {
  // Use a function that can be called with 'new'
  function MockDatabase() {
    return mockDbInstance;
  }
  return { default: MockDatabase };
});

import {
  queryMessagesDB,
  queryMessagesDBRows,
  testMessagesDBAccess,
} from "../../lib/messages-db.js";

describe("Messages Database Module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock return values
    mockStatement.all.mockReturnValue([
      { id: 1, text: "Hello" },
      { id: 2, text: "World" },
    ]);
    mockStatement.get.mockReturnValue({ count: 1 });
  });

  describe("queryMessagesDB", () => {
    it("should return pipe-delimited rows", async () => {
      const result = await queryMessagesDB("SELECT * FROM messages");
      expect(result).toBe("1|Hello\n2|World");
    });

    it("should call prepare with the SQL query", async () => {
      await queryMessagesDB("SELECT * FROM messages");
      expect(mockDbInstance.prepare).toHaveBeenCalledWith("SELECT * FROM messages");
    });

    it("should close database after query", async () => {
      await queryMessagesDB("SELECT 1");
      expect(mockDbInstance.close).toHaveBeenCalled();
    });
  });

  describe("queryMessagesDBRows", () => {
    it("should return array of row objects", () => {
      const result = queryMessagesDBRows("SELECT * FROM messages");
      expect(result).toEqual([
        { id: 1, text: "Hello" },
        { id: 2, text: "World" },
      ]);
    });

    it("should be synchronous", () => {
      const result = queryMessagesDBRows("SELECT 1");
      // Check that result is not a Promise
      expect(result).not.toBeInstanceOf(Promise);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("testMessagesDBAccess", () => {
    it("should return ok: true when database is accessible", () => {
      const result = testMessagesDBAccess();
      expect(result.ok).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });
});
