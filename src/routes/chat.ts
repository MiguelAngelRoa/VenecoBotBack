import { Router } from "express";
import { resetAgent, runAgent } from "../agent/graph.js";

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
    const reply = await runAgent(sessionId, message.trim());
    res.json({ sessionId, reply });
  } catch (error) {
    console.error("Error consultando el agente:", error);
    const detalle = error instanceof Error ? error.message : String(error);
    if (detalle.includes("429") || detalle.toLowerCase().includes("quota")) {
      res.status(429).json({
        error:
          "El bot alcanzo su limite de uso de Gemini por ahora. Intenta de nuevo mas tarde.",
      });
      return;
    }
    res.status(502).json({ error: "No se pudo generar la respuesta." });
  }
});

chatRouter.post("/reset", (req, res) => {
  const body = req.body as { sessionId?: unknown };
  const sessionId = resolveSessionId(body.sessionId);
  resetAgent(sessionId);
  res.json({ sessionId, ok: true });
});
