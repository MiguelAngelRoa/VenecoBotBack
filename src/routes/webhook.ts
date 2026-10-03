import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Request } from "express";
import { env } from "../config.js";
import { runAgent } from "../agent/graph.js";

type WhatsAppText = { body?: string };

type WebhookPayload = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: { phone_number_id?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{
          from?: string;
          id?: string;
          type?: string;
          text?: WhatsAppText;
        }>;
      };
    }>;
  }>;
};

function rawBodyOf(req: Request): Buffer | undefined {
  return (req as Request & { rawBody?: Buffer }).rawBody;
}

function verifySignature(req: Request): boolean {
  if (!env.whatsappAppSecret) {
    return true;
  }

  const signature = req.get("x-hub-signature-256");
  const rawBody = rawBodyOf(req);
  if (!signature || !rawBody) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", env.whatsappAppSecret)
    .update(rawBody)
    .digest("hex")}`;

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function graphPost(path: string, body: unknown): Promise<void> {
  const url = `https://graph.facebook.com/${env.whatsappApiVersion}/${env.whatsappPhoneNumberId}/${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.whatsappToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Graph API ${response.status}: ${await response.text()}`);
  }
}

async function sendText(to: string, body: string): Promise<void> {
  await graphPost("messages", {
    messaging_product: "whatsapp",
    to,
    text: { body },
  });
}

async function markRead(messageId: string): Promise<void> {
  await graphPost("messages", {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  });
}

const procesados = new Set<string>();
const MAX_PROCESADOS = 500;

function yaProcesado(id: string): boolean {
  if (procesados.has(id)) {
    return true;
  }
  procesados.add(id);
  if (procesados.size > MAX_PROCESADOS) {
    const primero = procesados.values().next().value;
    if (primero) {
      procesados.delete(primero);
    }
  }
  return false;
}

async function procesarMensaje(from: string, id: string, texto: string): Promise<void> {
  const sessionId = `wa-cloud:${from}`;
  try {
    await markRead(id).catch(() => undefined);
    const reply = await runAgent(sessionId, texto.trim());
    await sendText(from, reply);
  } catch (error) {
    console.error("[whatsapp-cloud] Error generando respuesta:", error);
    const detalle = error instanceof Error ? error.message : String(error);
    const aviso =
      detalle.includes("429") || detalle.toLowerCase().includes("quota")
        ? "En este momento alcanzamos el limite de uso. Por favor intenta nuevamente mas tarde."
        : "Ocurrio un error al generar la respuesta. Por favor intenta de nuevo.";
    await sendText(from, aviso).catch(() => undefined);
  }
}

export const webhookRouter = Router();

webhookRouter.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.whatsappVerifyToken) {
    res.status(200).send(String(challenge ?? ""));
    return;
  }

  res.status(403).send("Forbidden");
});

webhookRouter.post("/", (req, res) => {
  if (!verifySignature(req)) {
    res.sendStatus(401);
    return;
  }

  res.sendStatus(200);

  const payload = req.body as WebhookPayload;
  if (payload.object !== "whatsapp_business_account") {
    return;
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") {
        continue;
      }
      for (const message of change.value?.messages ?? []) {
        const from = message.from;
        const id = message.id;
        const texto = message.text?.body;
        if (message.type !== "text" || !from || !id || !texto) {
          continue;
        }
        if (yaProcesado(id)) {
          continue;
        }
        void procesarMensaje(from, id, texto);
      }
    }
  }
});
