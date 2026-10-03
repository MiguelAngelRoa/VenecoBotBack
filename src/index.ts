import cors from "cors";
import express from "express";
import { env } from "./config.js";
import { chatRouter } from "./routes/chat.js";
import { webhookRouter } from "./routes/webhook.js";
import { startWhatsApp } from "./whatsapp.js";

const app = express();

app.use(cors());
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as typeof req & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(express.static("public"));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", model: env.model });
});

app.use("/api/chat", chatRouter);

if (env.whatsappCloudEnabled) {
  if (!env.whatsappToken || !env.whatsappPhoneNumberId) {
    console.warn(
      "[whatsapp-cloud] Falta WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID; el webhook no podra responder.",
    );
  }
  app.use("/webhook", webhookRouter);
  console.log("[whatsapp-cloud] Webhook activo en /webhook");
}

app.use((_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada." });
});

app.listen(env.port, () => {
  console.log(`VenecoBot escuchando en http://localhost:${env.port}`);

  if (env.whatsappEnabled) {
    startWhatsApp();
  }
});
