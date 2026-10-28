import { createServer } from "http";
import { MandateSDK } from "@chan30/mandate-sdk";
import { JsonRpcProvider } from "ethers";
import { readFileSync, writeFileSync, existsSync } from "fs";

const PORT = 3000;
const RPC_URL = "https://rpc.monad.xyz";
const CHAIN_ID = 143;
const FEE_SHARE = 1.0;

const provider = new JsonRpcProvider(RPC_URL, CHAIN_ID);
const mandatos = JSON.parse(readFileSync("mandatos-agentes.json", "utf8"));

// Tracking por API key
const TRACKING_FILE = "tracking.json";
let tracking = existsSync(TRACKING_FILE)
  ? JSON.parse(readFileSync(TRACKING_FILE, "utf8"))
  : {};

function guardarTracking() {
  writeFileSync(TRACKING_FILE, JSON.stringify(tracking, null, 2));
}

const agentes = mandatos.map(m => ({
  agentId: m.agentId,
  mandateId: m.mandateId,
  passkey: {
    privateKey: new Uint8Array(m.passkey.privateKey),
    publicKey: new Uint8Array(m.passkey.publicKey),
    pubX: m.passkey.pubX,
    pubY: m.passkey.pubY,
  },
  sdk: new MandateSDK({
    privateKey: m.privateKey,
    rpcUrl: RPC_URL,
    chainId: CHAIN_ID,
  }),
}));

// Rate limiter corregido
const RATE_LIMIT = 20;        // 20 req/s (por debajo del límite de 25 del RPC público)
const BUCKET_SIZE = 20;       // máximo de tokens acumulables
const rateLimiter = { tokens: BUCKET_SIZE, last: Date.now() };

async function acquire() {
  while (true) {
    const now = Date.now();
    const elapsed = (now - rateLimiter.last) / 1000;
    rateLimiter.last = now;
    rateLimiter.tokens = Math.min(
      BUCKET_SIZE,
      rateLimiter.tokens + elapsed * RATE_LIMIT
    );
    if (rateLimiter.tokens >= 1) {
      rateLimiter.tokens -= 1;
      return;
    }
    const waitMs = Math.ceil(((1 - rateLimiter.tokens) / RATE_LIMIT) * 1000);
    await new Promise(r => setTimeout(r, waitMs));
  }
}

async function ejecutarIntenciones(intenciones, apiKey) {
  const t0 = Date.now();
  const resultados = [];

  // Agrupar por agente
  const porAgente = new Map();
  for (const int of intenciones) {
    const agente = agentes.find(a => a.agentId === int.agentId);
    if (!agente) {
      resultados.push({ ok: false, agente: int.agentId, error: "agente no encontrado" });
      continue;
    }
    if (!porAgente.has(int.agentId)) porAgente.set(int.agentId, []);
    porAgente.get(int.agentId).push({ agente, ...int });
  }

  // Planificar capas
  const capas = [];
  const colas = new Map();
  for (const [id, ints] of porAgente) colas.set(id, [...ints]);
  while (true) {
    const capa = [];
    for (const [id, cola] of colas) {
      if (cola.length > 0) capa.push(cola.shift());
    }
    if (capa.length === 0) break;
    capas.push(capa);
  }

  // Ejecutar
  let feesGenerados = 0n;
  for (const capa of capas) {
    const resCapa = await Promise.all(
      capa.map(async (v) => {
        for (let intento = 0; intento < 3; intento++) {
          try {
            await acquire();
            const r = await v.agente.sdk.pay({
              mandateId: v.agente.mandateId,
              passkey: v.agente.passkey,
              amount: v.amount,
              recipient: v.recipient,
            });
            await acquire();
            const receipt = await provider.waitForTransaction(r.tx);
            const feeMON = BigInt(Math.floor(parseFloat(r.fee) * 1e18));
            feesGenerados += feeMON;
            return { ok: true, agente: v.agente.agentId, tx: r.tx, bloque: receipt.blockNumber, fee: r.fee };
          } catch (e) {
            if (intento === 2) return { ok: false, agente: v.agente.agentId, error: e.message.slice(0, 80) };
             await new Promise(r => setTimeout(r, Math.pow(2, intento) * 1000));
          }
        }
      })
    );
    resultados.push(...resCapa);
  }

  // Tracking
  const exitosos = resultados.filter(r => r.ok).length;
  const feeTotalMON = Number(feesGenerados) / 1e18;
  const feeCompartido = feeTotalMON * FEE_SHARE;

  if (!tracking[apiKey]) tracking[apiKey] = { txs: 0, feeMON: 0, feeCompartido: 0, ultimaActividad: null };
  tracking[apiKey].txs += exitosos;
  tracking[apiKey].feeMON += feeTotalMON;
  tracking[apiKey].feeCompartido += feeCompartido;
  tracking[apiKey].ultimaActividad = new Date().toISOString();
  guardarTracking();

  return {
    resultados,
    metricas: {
      total: intenciones.length,
      exitosos,
      fallidos: intenciones.length - exitosos,
      capas: capas.length,
      tiempoMs: Date.now() - t0,
      feeTotalMON,
      feeCompartidoMON: feeCompartido,
    },
  };
}

const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET" && req.url === "/health") {
    res.end(JSON.stringify({ status: "ok", agentes: agentes.length }));
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/tracking/")) {
    const apiKey = req.url.split("/")[2];
    res.end(JSON.stringify(tracking[apiKey] || { error: "api key no encontrada" }));
    return;
  }

  if (req.method === "POST" && req.url === "/pagar") {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "falta x-api-key" }));
      return;
    }

    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const { intenciones } = JSON.parse(body);
        if (!Array.isArray(intenciones)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "intenciones debe ser array" }));
          return;
        }
        const resultado = await ejecutarIntenciones(intenciones, apiKey);
        res.end(JSON.stringify(resultado));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "ruta no encontrada" }));
});

server.listen(PORT, () => {
  console.log("API AETHEL-AUTAPON escuchando en http://localhost:" + PORT);
  console.log("Agentes disponibles: " + agentes.length);
  console.log("");
  console.log("Endpoints:");
  console.log("  GET  /health");
  console.log("  GET  /tracking/:apiKey");
  console.log("  POST /pagar  (header x-api-key)");
});
