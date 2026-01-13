import { describe, it, expect } from "vitest";
import {
  MachinaError,
  PermissionError,
  TimeoutError,
  ValidationError,
  NotFoundError,
  DatabaseError,
  ServiceUnavailableError,
  UnknownOperationError,
} from "../../lib/errors.js";

describe("Error Hierarchy", () => {
  describe("MachinaError", () => {
    it("should have correct properties", () => {
      const error = new MachinaError("test message", "TEST_CODE", 500);
      expect(error.message).toBe("test message");
      expect(error.code).toBe("TEST_CODE");
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe("MachinaError");
    });

    it("should be an instance of Error", () => {
      const error = new MachinaError("test", "TEST", 500);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(MachinaError);
    });
  });

  describe("PermissionError", () => {
    it("should include app name and instructions", () => {
      const error = new PermissionError("Messages");
      expect(error.message).toContain("Messages");
      expect(error.message).toContain("System Settings");
      expect(error.code).toBe("PERMISSION_DENIED");
      expect(error.statusCode).toBe(403);
    });
  });

  describe("TimeoutError", () => {
    it("should include operation name and duration", () => {
      const error = new TimeoutError("AppleScript execution", 10);
      expect(error.message).toContain("AppleScript execution");
      expect(error.message).toContain("10s");
      expect(error.code).toBe("TIMEOUT");
      expect(error.statusCode).toBe(504);
    });
  });

  describe("ValidationError", () => {
    it("should pass through custom message", () => {
      const error = new ValidationError("Invalid phone number format");
      expect(error.message).toBe("Invalid phone number format");
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.statusCode).toBe(400);
    });
  });

  describe("NotFoundError", () => {
    it("should format resource name", () => {
      const error = new NotFoundError("Contact");
      expect(error.message).toBe("Contact not found");
      expect(error.code).toBe("NOT_FOUND");
      expect(error.statusCode).toBe(404);
    });
  });

  describe("DatabaseError", () => {
    it("should include database name and message", () => {
      const error = new DatabaseError("Messages", "file not found");
      expect(error.message).toContain("Messages");
      expect(error.message).toContain("file not found");
      expect(error.code).toBe("DATABASE_ERROR");
      expect(error.statusCode).toBe(500);
    });
  });

  describe("ServiceUnavailableError", () => {
    it("should include service and reason", () => {
      const error = new ServiceUnavailableError("WhatsApp", "not connected");
      expect(error.message).toContain("WhatsApp");
      expect(error.message).toContain("not connected");
      expect(error.code).toBe("SERVICE_UNAVAILABLE");
      expect(error.statusCode).toBe(503);
    });
  });

  describe("UnknownOperationError", () => {
    it("should list available operations", () => {
      const error = new UnknownOperationError("foo", ["bar", "baz"]);
      expect(error.message).toContain("foo");
      expect(error.message).toContain("bar, baz");
      expect(error.code).toBe("UNKNOWN_OPERATION");
      expect(error.statusCode).toBe(400);
    });
  });
});
