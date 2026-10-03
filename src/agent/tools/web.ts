import { tool } from "@langchain/core/tools";
import { z } from "zod";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeUrl(href: string): string {
  const match = href.match(/[?&]uddg=([^&]+)/);
  if (match?.[1]) {
    return decodeURIComponent(match[1]);
  }
  if (href.startsWith("//")) {
    return `https:${href}`;
  }
  return href;
}

type Resultado = { titulo: string; url: string; resumen: string };

function parseResultados(html: string): Resultado[] {
  const titulos = [
    ...html.matchAll(
      /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g,
    ),
  ];
  const resumenes = [
    ...html.matchAll(
      /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g,
    ),
  ];

  return titulos.slice(0, 5).map((match, index) => ({
    titulo: stripTags(match[2] ?? ""),
    url: decodeUrl(match[1] ?? ""),
    resumen: stripTags(resumenes[index]?.[1] ?? ""),
  }));
}

async function buscar(query: string): Promise<string> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const resultados = parseResultados(await response.text());
  if (resultados.length === 0) {
    return `Sin resultados para "${query}".`;
  }

  return resultados
    .map(
      (r, i) =>
        `${i + 1}. ${r.titulo}\n   ${r.url}${r.resumen ? `\n   ${r.resumen}` : ""}`,
    )
    .join("\n\n");
}

export function createWebTools() {
  const buscarWeb = tool(
    async ({ query }) => {
      try {
        return await buscar(query);
      } catch (error) {
        return `No pude completar la busqueda web (${(error as Error).message}).`;
      }
    },
    {
      name: "buscar_web",
      description:
        "Busca informacion actual en internet (noticias, precios, datos recientes). " +
        "Usa una consulta clara y en el idioma de la informacion buscada.",
      schema: z.object({
        query: z.string().describe("La busqueda a realizar."),
      }),
    },
  );

  return [buscarWeb];
}
