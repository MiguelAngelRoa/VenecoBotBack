import cors from "cors";
import express from "express";
import { env } from "./config.js";
import { chatRouter } from "./routes/chat.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", model: env.model });
});

app.use("/api/chat", chatRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada." });
});

app.listen(env.port, () => {
  console.log(`VenecoBot escuchando en http://localhost:${env.port}`);
});
