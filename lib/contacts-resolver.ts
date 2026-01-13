/**
 * Contact resolution from macOS Contacts (AddressBook)
 *
 * Provides fast contact name lookup by building an in-memory cache
 * from the AddressBook SQLite databases.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import { normalizePhone, isPhoneNumber } from "./utils.js";

const execAsync = promisify(exec);

/** Cache of phone/email → contact name */
let contactCache: Map<string, string> | null = null;
let contactCacheTime = 0;
const CONTACT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Build contact cache from Contacts SQLite database
 * Much faster than AppleScript for bulk lookups
 */
async function buildContactCache(): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  const addressBookDir = `${process.env.HOME}/Library/Application Support/AddressBook/Sources`;

  try {
    // Find all source databases with timeout to prevent blocking
    const { stdout: sources } = await Promise.race([
      execAsync(`ls -d "${addressBookDir}"/*/ 2>/dev/null || true`),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AddressBook access timeout")), 5000)
      ),
    ]);

    for (const sourceDir of sources.trim().split("\n").filter(Boolean)) {
      const dbPath = `${sourceDir}AddressBook-v22.abcddb`;
      let db: ReturnType<typeof Database> | undefined;

      try {
        db = new Database(dbPath, { readonly: true });

        // Query phones with owner names
        const phoneRows = db
          .prepare(
            `SELECT p.ZFULLNUMBER as phone,
                    COALESCE(r.ZFIRSTNAME, '') || ' ' || COALESCE(r.ZLASTNAME, '') as name
             FROM ZABCDPHONENUMBER p
             JOIN ZABCDRECORD r ON p.ZOWNER = r.Z_PK
             WHERE p.ZFULLNUMBER IS NOT NULL`
          )
          .all() as { phone: string; name: string }[];

        for (const row of phoneRows) {
          const name = row.name.trim();
          if (name) {
            // Store both original and normalized
            cache.set(row.phone.toLowerCase().trim(), name);
            cache.set(normalizePhone(row.phone), name);
          }
        }

        // Query emails with owner names
        const emailRows = db
          .prepare(
            `SELECT e.ZADDRESSNORMALIZED as email,
                    COALESCE(r.ZFIRSTNAME, '') || ' ' || COALESCE(r.ZLASTNAME, '') as name
             FROM ZABCDEMAILADDRESS e
             JOIN ZABCDRECORD r ON e.ZOWNER = r.Z_PK
             WHERE e.ZADDRESSNORMALIZED IS NOT NULL`
          )
          .all() as { email: string; name: string }[];

        for (const row of emailRows) {
          const name = row.name.trim();
          if (name) {
            cache.set(row.email.toLowerCase().trim(), name);
          }
        }
      } catch (error: unknown) {
        // Skip individual databases that can't be opened (common with multiple AddressBook sources)
        console.warn(`Skipping AddressBook database ${dbPath}: ${(error as Error).message}`);
      } finally {
        if (db) db.close();
      }
    }

    console.log(`Contact cache built: ${cache.size} entries`);
    return cache;
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Failed to build contact cache:", err.message);
    console.warn("DEGRADED: Contact name resolution unavailable - will show raw handles");
    return new Map();
  }
}

/**
 * Ensure contact cache is fresh (build or refresh if expired)
 */
async function ensureFreshCache(): Promise<Map<string, string>> {
  if (!contactCache || Date.now() - contactCacheTime > CONTACT_CACHE_TTL) {
    contactCache = await buildContactCache();
    contactCacheTime = Date.now();
  }
  return contactCache;
}

/**
 * Resolve a phone/email handle to a contact name
 *
 * @param handle - Phone number or email address
 * @returns Contact name if found, original handle otherwise
 */
export async function resolveHandleToName(handle: string): Promise<string> {
  const cache = await ensureFreshCache();

  // Try exact match first
  const lowerHandle = handle.toLowerCase().trim();
  if (cache.has(lowerHandle)) {
    return cache.get(lowerHandle)!;
  }

  // Try normalized phone number match
  if (isPhoneNumber(handle)) {
    const normalized = normalizePhone(handle);
    if (cache.has(normalized)) {
      return cache.get(normalized)!;
    }
  }

  // Return original handle if no match found
  return handle;
}

/**
 * Resolve multiple handles at once (more efficient for batch lookups)
 *
 * @param handles - Array of phone numbers or email addresses
 * @returns Map of handle → resolved name
 */
export async function resolveHandlesToNames(handles: string[]): Promise<Map<string, string>> {
  // Ensure cache is fresh before batch processing
  await ensureFreshCache();

  const result = new Map<string, string>();
  for (const handle of handles) {
    result.set(handle, await resolveHandleToName(handle));
  }
  return result;
}

/**
 * Search contacts by name
 *
 * @param searchTerm - Name to search for (case-insensitive partial match)
 * @returns Array of matching contacts with their phone/email handles
 */
export async function searchContactsByName(
  searchTerm: string
): Promise<Array<{ handle: string; name: string }>> {
  const cache = await ensureFreshCache();
  const searchLower = searchTerm.toLowerCase();
  const matches: Array<{ handle: string; name: string }> = [];

  for (const [handle, name] of cache.entries()) {
    if (name.toLowerCase().includes(searchLower)) {
      matches.push({ handle, name });
    }
  }

  return matches;
}

/**
 * Get the raw contact cache (for advanced use cases)
 */
export async function getContactCache(): Promise<Map<string, string>> {
  return ensureFreshCache();
}

/**
 * Clear the contact cache (forces rebuild on next access)
 */
export function clearContactCache(): void {
  contactCache = null;
  contactCacheTime = 0;
}
