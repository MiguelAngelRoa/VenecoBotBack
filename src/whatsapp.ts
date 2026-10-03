import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  isJidStatusBroadcast,
  makeWASocket,
  useMultiFileAuthState,
  type WAMessage,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import { env } from "./config.js";
import { runAgent } from "./agent/graph.js";

const AUTH_DIR = "whatsapp-auth";

function extractText(message: WAMessage): string | null {
  const content = message.message;
  if (!content) {
    return null;
  }
  if (typeof content.conversation === "string") {
    return content.conversation;
  }
  if (content.extendedTextMessage?.text) {
    return content.extendedTextMessage.text;
  }
  if (content.imageMessage?.caption) {
    return content.imageMessage.caption;
  }
  if (content.videoMessage?.caption) {
    return content.videoMessage.caption;
  }
  return null;
}

function shouldIgnore(message: WAMessage): boolean {
  const jid = message.key.remoteJid;
  if (!jid || message.key.fromMe) {
    return true;
  }
  return Boolean(
    isJidGroup(jid) ||
      isJidBroadcast(jid) ||
      isJidStatusBroadcast(jid) ||
      isJidNewsletter(jid),
  );
}

export function startWhatsApp(): () => void {
  let reconnectTimer: NodeJS.Timeout | null = null;

  const connect = async (): Promise<void> => {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(
          "[whatsapp] Escanea este QR con WhatsApp > Dispositivos vinculados:",
        );
        qrcode.generate(qr, { small: true });
      }

      if (connection === "open") {
        console.log("[whatsapp] Conectado. VenecoBot ya responde en WhatsApp.");
      }

      if (connection === "close") {
        const error = lastDisconnect?.error as
          | { output?: { statusCode?: number } }
          | undefined;
        const statusCode = error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        console.log(
          `[whatsapp] Conexion cerrada (${statusCode ?? "?"}). ${
            loggedOut
              ? "Sesion cerrada; borra la carpeta whatsapp-auth para reconectar."
              : "Reintentando en 3s..."
          }`,
        );

        if (!loggedOut) {
          reconnectTimer = setTimeout(() => {
            void connect();
          }, 3000);
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") {
        return;
      }

      for (const message of messages) {
        if (shouldIgnore(message)) {
          continue;
        }

        const jid = message.key.remoteJid as string;
        const text = extractText(message);
        if (!text || text.trim().length === 0) {
          continue;
        }

        const sessionId = `wa:${jid}`;
        try {
          await sock.readMessages([message.key]);
          await sock.sendPresenceUpdate("composing", jid);
          const reply = await runAgent(sessionId, text.trim());
          await sock.sendMessage(jid, { text: reply }, { quoted: message });
          await sock.sendPresenceUpdate("paused", jid);
        } catch (error) {
          console.error("[whatsapp] Error generando respuesta:", error);
          const detalle = error instanceof Error ? error.message : String(error);
          const aviso =
            detalle.includes("429") || detalle.toLowerCase().includes("quota")
              ? "En este momento alcanzamos el limite de uso. Por favor intenta nuevamente mas tarde."
              : "Ocurrio un error al generar la respuesta. Por favor intenta de nuevo.";
          await sock
            .sendMessage(jid, { text: aviso }, { quoted: message })
            .catch(() => undefined);
        }
      }
    });
  };

  void connect();

  return () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };
}
