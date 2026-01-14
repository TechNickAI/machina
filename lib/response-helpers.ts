/**
 * MCP Response Helpers
 *
 * Structured response format following MCP 2025-06-18 spec.
 * Uses structuredContent for machine-readable JSON alongside human-readable text.
 */

/**
 * MCP Tool Response following the spec.
 * - content: Human-readable text summary
 * - structuredContent: Machine-readable JSON (for LLM consumption)
 * - isError: Whether this is an error response
 */
export interface MCPToolResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}

/**
 * Create a successful response with structured data.
 * Human-readable summary is generated from the data.
 */
export function createResponse(data: Record<string, unknown>): MCPToolResponse {
  return {
    content: [{ type: "text", text: formatHumanSummary(data) }],
    isError: false,
    structuredContent: data,
  };
}

/**
 * Create an error response with optional suggestions.
 */
export function createErrorResponse(message: string, suggestions?: string[]): MCPToolResponse {
  const data: Record<string, unknown> = { error: true, message };
  if (suggestions?.length) {
    data.suggestions = suggestions;
  }
  return {
    content: [{ type: "text", text: message }],
    isError: true,
    structuredContent: data,
  };
}

/**
 * Generate a human-readable summary from structured data.
 * Keeps it concise - LLMs should use structuredContent for details.
 */
function formatHumanSummary(data: Record<string, unknown>): string {
  // Message sent
  if (data.success && data.sent_to) {
    const to = data.sent_to as { name?: string; identifier?: string };
    return `Sent to ${to.name || to.identifier}`;
  }

  // Conversations list
  if (data.conversations && Array.isArray(data.conversations)) {
    return `${data.conversations.length} conversation${data.conversations.length === 1 ? "" : "s"}`;
  }

  // Messages from a contact
  if (data.messages && Array.isArray(data.messages)) {
    const count = data.messages.length;
    const contact = data.contact_name || data.contact || "contact";
    return `${count} message${count === 1 ? "" : "s"} from ${contact}`;
  }

  // Disambiguation needed
  if (data.disambiguation_needed && Array.isArray(data.options)) {
    const options = data.options as Array<{ name?: string }>;
    return `Multiple matches: ${options.map((o) => o.name).join(", ")}`;
  }

  // Contact not found with suggestions
  if (data.not_found && data.similar_contacts) {
    const similar = data.similar_contacts as Array<{ name: string }>;
    return `Not found. Did you mean: ${similar.map((c) => c.name).join(", ")}?`;
  }

  // Search results
  if (data.results && Array.isArray(data.results)) {
    return `${data.results.length} result${data.results.length === 1 ? "" : "s"}`;
  }

  // Notes
  if (data.notes && Array.isArray(data.notes)) {
    return `${data.notes.length} note${data.notes.length === 1 ? "" : "s"}`;
  }

  // Reminders
  if (data.reminders && Array.isArray(data.reminders)) {
    return `${data.reminders.length} reminder${data.reminders.length === 1 ? "" : "s"}`;
  }

  // Describe output
  if (data.services && Array.isArray(data.services)) {
    return `${data.services.length} services available`;
  }

  // Operation docs
  if (data.operation && data.docs) {
    return `Documentation for ${data.operation}`;
  }

  // Generic success
  if (data.success) {
    return "Success";
  }

  // Fallback: count keys
  const keys = Object.keys(data).filter((k) => !k.startsWith("_"));
  if (keys.length === 1) {
    const val = data[keys[0]];
    if (typeof val === "string") return val.slice(0, 100);
    if (Array.isArray(val)) return `${val.length} items`;
  }

  return JSON.stringify(data, null, 2).slice(0, 200);
}
