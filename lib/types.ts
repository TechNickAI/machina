/**
 * Shared types for Machina MCP Gateway
 */

/**
 * Parameter definition for an operation
 */
export interface OperationParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: unknown;
}

/**
 * Operation definition with full help metadata
 */
export interface Operation {
  name: string;
  description: string;
  parameters: OperationParam[];
  returns: string;
  example?: string;
}

/**
 * Service definition (mcp-hubby pattern: one tool per service)
 */
export interface ServiceDef {
  name: string;
  displayName: string;
  description: string;
  prefix: string;
}

/**
 * Result types for contact resolution
 */
export type ResolveResult =
  | { type: "found"; jid: string; name: string | null }
  | { type: "ambiguous"; matches: Array<{ jid: string; name: string | null }> }
  | { type: "not_found" };

/**
 * Message from the Messages database
 */
export interface Message {
  rowid: number;
  text: string | null;
  is_from_me: number;
  date: number;
  handle_id: string;
  cache_roomnames: string | null;
}

/**
 * Conversation metadata
 */
export interface ConversationContext {
  contact: string;
  contactName: string;
  isGroup: boolean;
  messageCount: number;
  timeSpan: {
    oldest: string;
    newest: string;
    duration: string;
  };
  messages: Array<{
    timestamp: string;
    relative: string;
    sender: string;
    text: string;
    attachments?: Array<{
      id: string;
      type: string;
      filename: string | null;
    }>;
  }>;
}
