import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ quiet: true });

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error(
    "Falta GEMINI_API_KEY. Copia .env.example a .env y coloca tu API key de Google AI Studio.",
  );
}

const defaultSystemInstruction =
  "Eres VenecoBot, un asistente amable y util. Responde de forma clara y concisa en el idioma del usuario.";

function loadSystemInstruction(): string {
  const file = process.env.SYSTEM_INSTRUCTION_FILE;

  if (file) {
    try {
      const content = readFileSync(resolve(process.cwd(), file), "utf8").trim();
      if (content.length > 0) {
        return content;
      }
      console.warn(`[config] SYSTEM_INSTRUCTION_FILE (${file}) esta vacio, uso el default.`);
    } catch (error) {
      console.warn(
        `[config] No se pudo leer SYSTEM_INSTRUCTION_FILE (${file}): ${(error as Error).message}. Uso el default.`,
      );
    }
  }

  return process.env.SYSTEM_INSTRUCTION ?? defaultSystemInstruction;
}

export const env = {
  apiKey,
  port: Number(process.env.PORT ?? 3000),
  model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  systemInstruction: loadSystemInstruction(),
  whatsappEnabled: process.env.WHATSAPP_ENABLED === "true",
};
