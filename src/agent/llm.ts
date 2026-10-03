import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { env } from "../config.js";

export function createChatModel(temperature = 0.3): ChatGoogleGenerativeAI {
  return new ChatGoogleGenerativeAI({
    model: env.model,
    apiKey: env.apiKey,
    temperature,
  });
}
