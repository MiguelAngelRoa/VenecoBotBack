import type { ChatMessage } from "./gemini.js";

const MAX_MESSAGES = 20;

const sessions = new Map<string, ChatMessage[]>();

export function getHistory(sessionId: string): ChatMessage[] {
  return sessions.get(sessionId) ?? [];
}

export function appendMessages(sessionId: string, messages: ChatMessage[]): void {
  const history = getHistory(sessionId).concat(messages);
  sessions.set(sessionId, history.slice(-MAX_MESSAGES));
}

export function clearSession(sessionId: string): void {
  sessions.delete(sessionId);
}
