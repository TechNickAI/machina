/**
 * iMessage database access layer
 *
 * Provides read-only access to ~/Library/Messages/chat.db
 * Requires Full Disk Access permission in macOS.
 */

import Database from "better-sqlite3";
import { DatabaseError } from "./errors.js";

/** Path to the iMessage database */
const MESSAGES_DB_PATH = `${process.env.HOME}/Library/Messages/chat.db`;

/**
 * Query the iMessage database and return pipe-delimited string
 * (mimics sqlite3 CLI output format)
 *
 * @param sql - SQL query to execute
 * @returns Pipe-delimited rows joined by newlines
 * @throws DatabaseError on failure
 */
export async function queryMessagesDB(sql: string): Promise<string> {
  let db: ReturnType<typeof Database> | undefined;
  try {
    db = new Database(MESSAGES_DB_PATH, { readonly: true });
    const rows = db.prepare(sql).all() as Record<string, unknown>[];
    return rows.map((row) => Object.values(row).join("|")).join("\n");
  } catch (error: unknown) {
    const err = error as Error;
    throw new DatabaseError("Messages", err.message);
  } finally {
    if (db) db.close();
  }
}

/**
 * Query the iMessage database and return array of row objects
 *
 * @param sql - SQL query to execute
 * @returns Array of row objects
 * @throws DatabaseError on failure
 */
export function queryMessagesDBRows<T = Record<string, unknown>>(sql: string): T[] {
  let db: ReturnType<typeof Database> | undefined;
  try {
    db = new Database(MESSAGES_DB_PATH, { readonly: true });
    return db.prepare(sql).all() as T[];
  } catch (error: unknown) {
    const err = error as Error;
    throw new DatabaseError("Messages", err.message);
  } finally {
    if (db) db.close();
  }
}

/**
 * Test if the Messages database is accessible
 * (useful for health checks and permission verification)
 */
export function testMessagesDBAccess(): { ok: boolean; error?: string } {
  let db: ReturnType<typeof Database> | undefined;
  try {
    db = new Database(MESSAGES_DB_PATH, { readonly: true });
    db.prepare("SELECT 1").get();
    return { ok: true };
  } catch (error: unknown) {
    const err = error as Error;
    return { ok: false, error: err.message };
  } finally {
    if (db) db.close();
  }
}
