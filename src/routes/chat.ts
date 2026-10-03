import { Router } from "express";
import { generateReply } from "../gemini.js";
import { appendMessages, clearSession, getHistory } from "../sessions.js";

export const chatRouter = Router();

function resolveSessionId(sessionId: unknown): string {
  return typeof sessionId === "string" && sessionId.length > 0 ? sessionId : "default";
}

chatRouter.post("/", async (req, res) => {
  const body = req.body as { message?: unknown; sessionId?: unknown };
  const message = body.message;

  if (typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "El campo 'message' es obligatorio." });
    return;
  }

  const sessionId = resolveSessionId(body.sessionId);

  try {
    const history = getHistory(sessionId);
    const reply = await generateReply(history, message.trim());
    appendMessages(sessionId, [
      { role: "user", text: message.trim() },
      { role: "model", text: reply },
    ]);
    res.json({ sessionId, reply });
  } catch (error) {
    console.error("Error consultando Gemini:", error);
    res.status(502).json({ error: "No se pudo generar la respuesta." });
  }
});

chatRouter.post("/reset", (req, res) => {
  const body = req.body as { sessionId?: unknown };
  const sessionId = resolveSessionId(body.sessionId);
  clearSession(sessionId);
  res.json({ sessionId, ok: true });
});
