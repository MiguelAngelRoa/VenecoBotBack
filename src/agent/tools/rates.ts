import { tool } from "@langchain/core/tools";
import { z } from "zod";

type CacheEntry = { value: string; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const TTL_MS = 90_000;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

async function cached(key: string, loader: () => Promise<string>): Promise<string> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value;
  }
  const value = await loader();
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

type DolarApiItem = {
  fuente: string;
  promedio: number | null;
  fechaActualizacion: string;
};

async function fetchFuente(
  path: string,
  fuente: string,
  etiqueta: string,
): Promise<string> {
  const data = await getJson<DolarApiItem[]>(`https://ve.dolarapi.com/v1/${path}`);
  const item = data.find((d) => d.fuente.toLowerCase() === fuente);
  if (!item || item.promedio == null) {
    throw new Error("sin dato disponible");
  }
  return `${etiqueta}: ${item.promedio.toFixed(2)} Bs. (actualizado ${item.fechaActualizacion})`;
}

type Criptoya = { ask: number; bid: number };

async function fetchBinanceP2P(): Promise<string> {
  const data = await getJson<Criptoya>(
    "https://criptoya.com/api/binancep2p/USDT/VES/1",
  );
  const promedio = (data.ask + data.bid) / 2;
  return `Binance P2P USDT/VES: compra ${data.bid.toFixed(2)} Bs, venta ${data.ask.toFixed(
    2,
  )} Bs, promedio ${promedio.toFixed(2)} Bs.`;
}

export function createRateTools() {
  const dolarOficial = tool(
    async () => {
      try {
        return await cached("oficial", () =>
          fetchFuente("dolares", "oficial", "Dolar oficial (BCV)"),
        );
      } catch {
        return "No pude consultar el dolar oficial del BCV en este momento.";
      }
    },
    {
      name: "dolar_oficial_bcv",
      description:
        "Devuelve la tasa oficial del dolar del Banco Central de Venezuela (BCV) en bolivares.",
      schema: z.object({}),
    },
  );

  const euroOficial = tool(
    async () => {
      try {
        return await cached("euro", () =>
          fetchFuente("euros", "oficial", "Euro oficial (BCV)"),
        );
      } catch {
        return "No pude consultar el euro oficial del BCV en este momento.";
      }
    },
    {
      name: "euro_oficial_bcv",
      description:
        "Devuelve la tasa oficial del euro del Banco Central de Venezuela (BCV) en bolivares.",
      schema: z.object({}),
    },
  );

  const binanceP2P = tool(
    async () => {
      try {
        return await cached("binance", fetchBinanceP2P);
      } catch {
        return "No pude consultar el promedio del dolar en Binance P2P en este momento.";
      }
    },
    {
      name: "binance_p2p_usdt",
      description:
        "Devuelve el promedio del dolar en Binance P2P (USDT/VES): precio de compra, venta y promedio en bolivares.",
      schema: z.object({}),
    },
  );

  return [dolarOficial, euroOficial, binanceP2P];
}
