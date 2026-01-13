/**
 * Shared utility functions for Machina
 *
 * Pure helper functions with no external dependencies.
 */

/**
 * Escape string for SQL LIKE patterns (prevents SQL injection)
 * Escapes: ' (quotes), % and _ (LIKE wildcards), \ (escape character)
 */
export function escapeSQL(str: string): string {
  return str
    .replace(/\\/g, "\\\\") // Backslash first to avoid double-escaping
    .replace(/'/g, "''")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * Normalize phone number for matching (strips formatting)
 * Handles US numbers with or without country code
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Handle US numbers with or without country code
  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  return digits;
}

/**
 * Format relative time ("5 minutes ago", "2 days ago")
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin === 1) return "1 minute ago";
  if (diffMin < 60) return `${diffMin} minutes ago`;
  if (diffHour === 1) return "1 hour ago";
  if (diffHour < 24) return `${diffHour} hours ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  if (diffDay < 30) {
    const weeks = Math.floor(diffDay / 7);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }
  if (diffDay < 365) {
    const months = Math.floor(diffDay / 30);
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }
  const years = Math.floor(diffDay / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

/**
 * Format chat age ("5 years, 3 months")
 */
export function formatChatAge(firstMessageDate: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - firstMessageDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const years = Math.floor(diffDays / 365);
  const months = Math.floor((diffDays % 365) / 30);

  if (years > 0 && months > 0) {
    return `${years} year${years > 1 ? "s" : ""}, ${months} month${months > 1 ? "s" : ""}`;
  }
  if (years > 0) {
    return `${years} year${years > 1 ? "s" : ""}`;
  }
  if (months > 0) {
    return `${months} month${months > 1 ? "s" : ""}`;
  }
  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? "s" : ""}`;
  }
  return "today";
}

/**
 * Check if a string looks like a phone number
 */
export function isPhoneNumber(str: string): boolean {
  return /^[\d\s()+-]+$/.test(str);
}
