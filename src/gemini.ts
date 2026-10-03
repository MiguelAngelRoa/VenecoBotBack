import { GoogleGenAI, type Content } from "@google/genai";
import { env } from "./config.js";

export type ChatMessage = {
  role: "user" | "model";
  text: string;
};

const ai = new GoogleGenAI({ apiKey: env.apiKey });

function toHistory(messages: ChatMessage[]): Content[] {
  return messages.map((message) => ({
    role: message.role,
    parts: [{ text: message.text }],
  }));
}

export async function generateReply(
  history: ChatMessage[],
  message: string,
): Promise<string> {
  const chat = ai.chats.create({
    model: env.model,
    history: toHistory(history),
    config: { systemInstruction: env.systemInstruction },
  });

  const response = await chat.sendMessage({ message });
  return response.text ?? "";
}
