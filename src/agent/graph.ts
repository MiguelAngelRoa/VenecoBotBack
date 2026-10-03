import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import { Annotation, END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { env } from "../config.js";
import { createChatModel } from "./llm.js";
import { createRateTools } from "./tools/rates.js";
import { createWebTools } from "./tools/web.js";

type Destino = "tasas" | "general";

const personalidad = env.systemInstruction;

const tasasAgent = createReactAgent({
  llm: createChatModel(0.2),
  tools: createRateTools(),
  prompt: `${personalidad}

Eres el especialista en TASAS de VenecoBot. Respondes dolar oficial (BCV), euro oficial (BCV)
y el promedio del dolar en Binance P2P (USDT/VES). Usa SIEMPRE tus herramientas para dar el
valor actual; nunca inventes cifras. Si preguntan por otra cosa, dilo y sugiere preguntar por las tasas.`,
});

const generalAgent = createReactAgent({
  llm: createChatModel(0.4),
  tools: createWebTools(),
  prompt: `${personalidad}

Eres el especialista GENERAL de VenecoBot. Puedes responder cualquier tema y, cuando haga falta
informacion actual o verificable, usa la herramienta de busqueda web (buscar_web) antes de responder.
Te especializas en Venezuela: noticias, cultura, tramites, y cualquier dato de interes general del pais.
Cita de forma breve la fuente cuando uses la busqueda. Si no sabes algo, dilo con honestidad.`,
});

const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  next: Annotation<Destino>({
    reducer: (_a, b) => b,
    default: () => "general",
  }),
});

const TEMAS_TASAS = [
  "dolar",
  "dólar",
  "euro",
  "binance",
  "p2p",
  "usdt",
  "tasa",
  "tasas",
  "bcv",
  "bolivar",
  "bolívar",
  "bolivares",
  "bolívares",
  "cambio",
  "cotizacion",
  "cotización",
];

function supervisor(state: typeof AgentState.State): { next: Destino } {
  const last = state.messages[state.messages.length - 1];
  const text = (typeof last?.content === "string" ? last.content : "").toLowerCase();
  const esTasas = TEMAS_TASAS.some((palabra) => text.includes(palabra));
  return { next: esTasas ? "tasas" : "general" };
}

function lastText(messages: BaseMessage[]): string {
  const last = messages[messages.length - 1];
  if (!last) {
    return "";
  }
  if (typeof last.content === "string") {
    return last.content;
  }
  if (Array.isArray(last.content)) {
    return last.content
      .map((part) => (typeof part === "string" ? part : "text" in part ? part.text : ""))
      .join("");
  }
  return "";
}

async function runSpecialist(
  agent: typeof tasasAgent,
  state: typeof AgentState.State,
): Promise<{ messages: BaseMessage[] }> {
  const result = await agent.invoke({ messages: state.messages });
  return { messages: [result.messages[result.messages.length - 1] as BaseMessage] };
}

function route(state: typeof AgentState.State): Destino {
  return state.next;
}

const graph = new StateGraph(AgentState)
  .addNode("supervisor", supervisor)
  .addNode("tasas", (state) => runSpecialist(tasasAgent, state))
  .addNode("general", (state) => runSpecialist(generalAgent, state))
  .addEdge(START, "supervisor")
  .addConditionalEdges("supervisor", route, {
    tasas: "tasas",
    general: "general",
  })
  .addEdge("tasas", END)
  .addEdge("general", END)
  .compile({ checkpointer: new MemorySaver() });

const resets = new Map<string, number>();

function threadId(sessionId: string): string {
  const n = resets.get(sessionId) ?? 0;
  return n === 0 ? sessionId : `${sessionId}#${n}`;
}

export function resetAgent(sessionId: string): void {
  resets.set(sessionId, (resets.get(sessionId) ?? 0) + 1);
}

export async function runAgent(sessionId: string, message: string): Promise<string> {
  const result = await graph.invoke(
    { messages: [new HumanMessage(message)] },
    { configurable: { thread_id: threadId(sessionId) } },
  );
  return lastText(result.messages);
}
