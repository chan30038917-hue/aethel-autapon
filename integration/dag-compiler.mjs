import { MandateSDK } from "@chan30/mandate-sdk";
import { JsonRpcProvider } from "ethers";
import { readFileSync } from "fs";

// ============================================================
// COMPILADOR DAG PARA AETHEL-AUTAPON
// ============================================================

const RPC_URL = "https://rpc.monad.xyz";
const CHAIN_ID = 143;
const RATE_LIMIT_RPS = 40;
const MAX_REINTENTOS = 3;

class RateLimiter {
  constructor(maxPerSecond) {
    this.max = maxPerSecond;
    this.tokens = maxPerSecond;
    this.lastRefill = Date.now();
  }

  async acquire() {
    while (true) {
      const now = Date.now();
      const elapsed = now - this.lastRefill;
      this.tokens = Math.min(this.max, this.tokens + (elapsed / 1000) * this.max);
      this.lastRefill = now;

      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }

      const waitMs = ((1 - this.tokens) / this.max) * 1000;
      await new Promise(r => setTimeout(r, Math.max(waitMs, 10)));
    }
  }
}

const rateLimiter = new RateLimiter(RATE_LIMIT_RPS);

const provider = new JsonRpcProvider(RPC_URL, CHAIN_ID);
const mandatos = JSON.parse(readFileSync("mandatos-agentes.json", "utf8"));

const agentes = mandatos.map(m => ({
  agentId: m.agentId,
  address: m.address,
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

// --- FASE 1: Validación previa ---
async function validarIntenciones(intenciones) {
  console.log("\n[FASE 1] Validando " + intenciones.length + " intenciones...");

  const validaciones = await Promise.all(
    intenciones.map(async (int) => {
      try {
        await rateLimiter.acquire();
        const fee = await int.agente.sdk.calculateFee(int.amount);

        await rateLimiter.acquire();
        const activo = await int.agente.sdk.isMandateActive(
          int.agente.mandateId,
          int.agente.passkey
        );

        const monto = BigInt(Math.floor(parseFloat(int.amount) * 1e18));
        const feeBig = BigInt(Math.floor(parseFloat(fee) * 1e18));
        const netoValido = monto > feeBig;

        return {
          intencion: int,
          fee,
          activo,
          netoValido,
          valido: activo && netoValido,
        };
      } catch (e) {
        return {
          intencion: int,
          valido: false,
          error: e.message.slice(0, 80),
        };
      }
    })
  );

  const validas = validaciones.filter(v => v.valido);
  const invalidas = validaciones.filter(v => !v.valido);

  console.log("  Válidas: " + validas.length);
  console.log("  Inválidas: " + invalidas.length);

  if (invalidas.length > 0) {
    invalidas.slice(0, 3).forEach(v => {
      console.log("    - " + v.intencion.agente.agentId + ": " + (v.error || "no cumple límites"));
    });
  }

  return { validas, invalidas };
}

// --- FASE 2: Agrupación por agente ---
function agruparPorAgente(intencionesValidas) {
  console.log("\n[FASE 2] Agrupando por agente...");

  const porAgente = new Map();

  for (const v of intencionesValidas) {
    const agentId = v.intencion.agente.agentId;
    if (!porAgente.has(agentId)) {
      porAgente.set(agentId, []);
    }
    porAgente.get(agentId).push(v);
  }

  console.log("  Agentes con intenciones: " + porAgente.size);
  for (const [agentId, ints] of porAgente) {
    console.log("    " + agentId + ": " + ints.length + " pagos");
  }

  return porAgente;
}

// --- FASE 3: Planificación de capas (DAG) ---
function planificarCapas(porAgente) {
  console.log("\n[FASE 3] Planificando capas del DAG...");

  const capas = [];
  const colas = new Map();

  for (const [agentId, ints] of porAgente) {
    colas.set(agentId, [...ints]);
  }

  while (true) {
    const capa = [];
    for (const [agentId, cola] of colas) {
      if (cola.length > 0) {
        capa.push(cola.shift());
      }
    }
    if (capa.length === 0) break;
    capas.push(capa);
  }

  console.log("  Capas: " + capas.length);
  capas.forEach((capa, i) => {
    console.log("    Capa " + (i + 1) + ": " + capa.length + " pagos");
  });

  return capas;
}

// --- FASE 4: Ejecución con rate limit y reintentos ---
async function ejecutarCapas(capas) {
  console.log("\n[FASE 4] Ejecutando capas...");

  const t0 = Date.now();
  const resultados = [];

  for (let i = 0; i < capas.length; i++) {
    const capa = capas[i];
    process.stdout.write("  Capa " + (i + 1) + "/" + capas.length + ": ");

    const resultadosCapa = await Promise.all(
      capa.map(async (v) => {
        let ultimoError = null;

        for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
          try {
            await rateLimiter.acquire();
            const r = await v.intencion.agente.sdk.pay({
              mandateId: v.intencion.agente.mandateId,
              passkey: v.intencion.agente.passkey,
              amount: v.intencion.amount,
              recipient: v.intencion.recipient,
            });

            await rateLimiter.acquire();
            const receipt = await provider.waitForTransaction(r.tx);

            return {
              ok: true,
              agente: v.intencion.agente.agentId,
              tx: r.tx,
              bloque: receipt.blockNumber,
              fee: r.fee,
              netAmount: r.netAmount,
            };
          } catch (e) {
            ultimoError = e.message.slice(0, 80);

            if (ultimoError.includes("-32007") || ultimoError.includes("50/second")) {
              const backoff = Math.pow(2, intento) * 1000;
              process.stdout.write("\n    Reintento " + (intento + 1) + "/" + MAX_REINTENTOS + " para " + v.intencion.agente.agentId + " en " + backoff + "ms\n  ");
              await new Promise(r => setTimeout(r, backoff));
            } else {
              break;
            }
          }
        }

        return {
          ok: false,
          agente: v.intencion.agente.agentId,
          error: ultimoError,
        };
      })
    );

    const ok = resultadosCapa.filter(r => r.ok).length;
    process.stdout.write(ok + "/" + capa.length + " OK\n");

    resultados.push(...resultadosCapa);
  }

  const t1 = Date.now();
  return { resultados, tiempo: t1 - t0 };
}

// ============================================================
// MAIN
// ============================================================

console.log("=== COMPILADOR DAG AETHEL-AUTAPON ===");
console.log("Agentes disponibles: " + agentes.length);
console.log("Rate limit: " + RATE_LIMIT_RPS + " req/s");
console.log("Reintentos por pago: " + MAX_REINTENTOS);

const PAGOS_POR_AGENTE = 3;
const RECIPIENT = "0x0000000000000000000000000000000000000001";

const intenciones = [];
for (const agente of agentes) {
  for (let i = 0; i < PAGOS_POR_AGENTE; i++) {
    intenciones.push({
      agente,
      amount: "0.05",
      recipient: RECIPIENT,
    });
  }
}

console.log("Total de intenciones: " + intenciones.length);
console.log("Pagos por agente: " + PAGOS_POR_AGENTE);

const tInicio = Date.now();

const { validas, invalidas } = await validarIntenciones(intenciones);
if (validas.length === 0) {
  console.log("\nNo hay intenciones válidas. Abortando.");
  process.exit(1);
}

const porAgente = agruparPorAgente(validas);
const capas = planificarCapas(porAgente);
const { resultados, tiempo } = await ejecutarCapas(capas);

const tTotal = Date.now() - tInicio;

const exitosos = resultados.filter(r => r.ok);
const fallidos = resultados.filter(r => !r.ok);

const bloques = exitosos.map(r => r.bloque);
const rangoBloques = bloques.length > 0
  ? Math.max(...bloques) - Math.min(...bloques)
  : 0;

console.log("\n\n=== RESUMEN FINAL ===");
console.log("Intenciones totales:  " + intenciones.length);
console.log("Válidas:              " + validas.length);
console.log("Inválidas:            " + invalidas.length);
console.log("Pagos exitosos:       " + exitosos.length);
console.log("Pagos fallidos:       " + fallidos.length);
console.log("Capas ejecutadas:     " + capas.length);
console.log("Tiempo de ejecución:  " + tiempo + "ms");
console.log("Tiempo total:         " + tTotal + "ms");
console.log("Rango de bloques:     " + rangoBloques);

if (fallidos.length > 0) {
  console.log("\nFallos:");
  fallidos.forEach(f => {
    console.log("  " + f.agente + ": " + f.error);
  });
}

console.log("\n=== FIN DEL COMPILADOR DAG ===");
