/**
 * WhatsApp HTTP Service
 *
 * HTTP wrapper for whatsapp-mcp-ts providing API access for the Machina gateway.
 * - Maintains WhatsApp Web connection via Baileys
 * - Syncs messages to SQLite for fast reads
 * - Exposes HTTP API for sends (reads go directly to SQLite)
 *
 * DEPLOYMENT: This file gets copied to ~/machina/components/whatsapp-mcp-ts/src/
 * during setup so it can import from the whatsapp-mcp-ts library.
 *
 * Port: 9901 (configurable via WHATSAPP_PORT env var)
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pino } from "pino";
import { initializeDatabase } from "./database.ts";
import { startWhatsAppConnection, sendWhatsAppMessage, type WhatsAppSocket } from "./whatsapp.ts";

const PORT = parseInt(process.env.WHATSAPP_PORT || "9901", 10);
const dataDir = process.env.WHATSAPP_MCP_DATA_DIR || ".";

const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination(`${dataDir}/whatsapp-service.log`)
);

let whatsappSocket: WhatsAppSocket | null = null;

async function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: any) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || "/";
  const method = req.method || "GET";

  // Health check
  if (url === "/health" && method === "GET") {
    const connected = whatsappSocket?.user != null;
    sendJson(res, connected ? 200 : 503, {
      status: connected ? "connected" : "disconnected",
      user: whatsappSocket?.user?.name || null,
    });
    return;
  }

  // Send message
  if (url === "/api/send" && method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const { recipient, message } = body;

      if (!recipient || !message) {
        sendJson(res, 400, {
          success: false,
          error: "Missing recipient or message",
        });
        return;
      }

      if (!whatsappSocket || !whatsappSocket.user) {
        sendJson(res, 503, { success: false, error: "WhatsApp not connected" });
        return;
      }

      const result = await sendWhatsAppMessage(logger, whatsappSocket, recipient, message);

      if (result && result.key?.id) {
        sendJson(res, 200, {
          success: true,
          message_id: result.key.id,
          recipient,
        });
      } else {
        sendJson(res, 500, { success: false, error: "Failed to send message" });
      }
    } catch (error: any) {
      logger.error({ err: error }, "Error handling /api/send");
      sendJson(res, 500, { success: false, error: error.message });
    }
    return;
  }

  // Not found
  sendJson(res, 404, { error: "Not found" });
}

async function main() {
  logger.info("Starting WhatsApp service...");

  try {
    logger.info("Initializing database...");
    initializeDatabase();
    logger.info("Database initialized.");

    logger.info("Connecting to WhatsApp...");
    whatsappSocket = await startWhatsAppConnection(logger);
    logger.info("WhatsApp connection initiated.");
  } catch (error: any) {
    logger.fatal({ err: error }, "Failed to initialize");
    process.exit(1);
  }

  const server = createServer(handleRequest);
  // Bind to localhost only - gateway handles external access with auth
  server.listen(PORT, "127.0.0.1", () => {
    logger.info(`HTTP API listening on 127.0.0.1:${PORT}`);
    console.log(`WhatsApp service running on 127.0.0.1:${PORT}`);
  });
}

async function shutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down...`);
  logger.flush();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((error) => {
  logger.fatal({ err: error }, "Unhandled error");
  logger.flush();
  process.exit(1);
});
