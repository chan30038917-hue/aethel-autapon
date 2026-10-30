import { MandateSDK } from "@chan30/mandate-sdk";
import { JsonRpcProvider, Contract, Wallet, formatEther, keccak256, toUtf8Bytes, parseEther } from "ethers";
import { readFileSync } from "fs";

// ============================================================
// COMPILADOR DAG PARA AETHEL-AUTAPON (flujo separado)
// ============================================================

const DRY_RUN = process.argv.includes("--dry-run");
const RPC_URL = process.env.RPC_URL || "https://rpc.monad.xyz";
const CHAIN_ID = parseInt(process.env.CHAIN_ID) || 143;
const RATE_LIMIT_RPS = parseInt(process.env.RATE_LIMIT_RPS) || 20;
const MAX_REINTENTOS = 3;

const AGENT_YARBOX_ABI = [
  "function commitIntent(bytes32 _intentHash, bytes32 _conditionHash, bytes32 _mandateId, uint256 _maxAmount, uint64 _erc8004AgentId) external returns (uint256)",
  "function settleIntent(uint256 _id, bytes32 _paymentNonce, bytes32 _resultHash) external",
  "function getMaxAmount(uint256 _id) external view returns (uint256)",
  "function getReceipt(uint256 _id) external view returns (address, uint64, bytes32, bytes32, bytes32, uint256, bytes32, bytes32, uint256, bool, bool)",
  "event IntentCommitted(uint256 indexed id, address indexed agent, uint64 erc8004AgentId, bytes32 intentHash, bytes32 mandateId, uint256 maxAmount)",
  "event IntentSettled(uint256 indexed id, bytes32 paymentNonce, bytes32 resultHash, uint256 timestamp)",
  "event IntentInconsistent(uint256 indexed id, string reason)"
];

const AGENT_YARBOX_ADDRESS = process.env.AGENT_YARBOX || "0x4D0D993e6FF19279dF0E69d9cd9cC946480973dC";

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
const agentYarbox = new Contract(AGENT_YARBOX_ADDRESS, AGENT_YARBOX_ABI, provider);

const mandatos = JSON.parse(readFileSync("mandatos-agentes.json", "utf8"));

const agentes = mandatos.map(m => ({
  agentId: m.agentId,
  address: m.address,
  mandateId: m.mandateId,
  privateKey: m.privateKey,
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

        await rateLimiter.acquire();
        const balance = await provider.getBalance(int.agente.address);
        const balanceMON = parseFloat(formatEther(balance));
        const amountNum = parseFloat(int.amount);
        const gasReserve = 5;
        const balanceOk = balanceMON >= (amountNum + gasReserve);

        if (!balanceOk) {
          return {
            intencion: int,
            valido: false,
            error: `balance insuficiente: ${balanceMON} MON`
          };
        }

        return {
          intencion: int,
          fee,
          activo,
          netoValido,
          balanceOk,
          valido: activo && netoValido && balanceOk,
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

// --- FASE 4: Ejecución con flujo separado ---
async function ejecutarCapas(capas) {
  console.log("\n[FASE 4] Ejecutando capas (flujo separado)...");

  const t0 = Date.now();
  const resultados = [];

  for (let i = 0; i < capas.length; i++) {
    const capa = capas[i];
    process.stdout.write("  Capa " + (i + 1) + "/" + capas.length + ": ");

    // PASO 1: Commitear todas las intenciones de la capa
    const commits = await Promise.all(
      capa.map(async (v) => {
        try {
          const signer = new Wallet(v.intencion.agente.privateKey, provider);
          const agentYarboxConSigner = agentYarbox.connect(signer);

          const intentHash = keccak256(toUtf8Bytes("intent-" + Date.now() + "-" + v.intencion.agente.agentId));
          const conditionHash = keccak256(toUtf8Bytes("condition-" + v.intencion.agente.agentId));
          const mandateIdBytes = v.intencion.agente.mandateId;
          const maxAmount = parseEther(v.intencion.amount);

          await rateLimiter.acquire();
          const txCommit = await agentYarboxConSigner.commitIntent(
            intentHash,
            conditionHash,
            mandateIdBytes,
            maxAmount,
            0
          );
          const receiptCommit = await txCommit.wait();

          if (receiptCommit.logs.length === 0) {
            return { ok: false, v, error: "Sin logs en commitIntent" };
          }
          const intentId = receiptCommit.logs[0].args[0];

          return { ok: true, v, intentId };
        } catch (e) {
          return { ok: false, v, error: e.message.slice(0, 80) };
        }
      })
    );

    // Mostrar errores de commit
    commits.forEach(c => {
      if (!c.ok) {
        console.log("\n  Error en commit para " + c.v.intencion.agente.agentId + ": " + c.error);
      }
    });

    const commitsOk = commits.filter(c => c.ok);
    process.stdout.write("commits: " + commitsOk.length + "/" + capa.length + " ");

    // Esperar para que la red actualice el saldo
    await new Promise(r => setTimeout(r, 3000));

    // PASO 2: Pagar todas las intenciones commiteadas y liquidarlas en AgentYarbox
    const pagos = await Promise.all(
      commitsOk.map(async (c) => {
        const v = c.v;
        let ultimoError = null;

        for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
          try {
            await rateLimiter.acquire();
            const r = await v.intencion.agente.sdk.pay({
              mandateId: v.intencion.agente.mandateId,
              passkey: v.intencion.agente.passkey,
              amount: v.intencion.amount,
              recipient: v.intencion.recipient,
              gasLimit: 500000,
            });

            // --- NUEVO: Liquidar la intención en AgentYarbox ---
            const paymentNonce = r.paymentNonce;
            const resultHash = keccak256(toUtf8Bytes("result-" + r.tx));

            const signer = new Wallet(v.intencion.agente.privateKey, provider);
            const agentYarboxConSigner = agentYarbox.connect(signer);

            await rateLimiter.acquire();
            const txSettle = await agentYarboxConSigner.settleIntent(
              c.intentId,
              paymentNonce,
              resultHash
            );
            await txSettle.wait();
            // --- FIN NUEVO ---

            await rateLimiter.acquire();
            const receipt = await provider.waitForTransaction(r.tx);

            let tiquete = null;
            try {
              await rateLimiter.acquire();
              const rec = await agentYarbox.getReceipt(c.intentId);
              tiquete = {
                intentId: c.intentId.toString(),
                agent: rec[0],
                mandateId: rec[4],
                maxAmount: rec[5].toString(),
                paymentNonce: rec[6],
                resultHash: rec[7],
                timestamp: rec[8].toString(),
                settled: rec[9],
                inconsistent: rec[10],
              };
            } catch (e) {
              tiquete = { error: e.message.slice(0, 80) };
            }

            return {
              ok: true,
              agente: v.intencion.agente.agentId,
              tx: r.tx,
              bloque: receipt.blockNumber,
              fee: r.fee,
              netAmount: r.netAmount,
              intentId: c.intentId.toString(),
              tiquete,
            };
          } catch (e) {
            ultimoError = e.message.slice(0, 80);
            if (ultimoError.includes("-32007") || ultimoError.includes("50/second")) {
              const backoff = Math.pow(2, intento) * 1000;
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

    // Mostrar errores de pago
    pagos.forEach(p => {
      if (!p.ok) {
        console.log("\n  Error en pago para " + p.agente + ": " + p.error);
      }
    });

    const ok = pagos.filter(r => r.ok).length;
    process.stdout.write("pagos: " + ok + "/" + capa.length + " OK\n");

    resultados.push(...pagos);
  }

  const t1 = Date.now();
  return { resultados, tiempo: t1 - t0 };
}

// ============================================================
// MAIN
// ============================================================

console.log("=== COMPILADOR DAG AETHEL-AUTAPON (flujo separado) ===");
console.log("Agentes disponibles: " + agentes.length);
console.log("Rate limit: " + RATE_LIMIT_RPS + " req/s");
console.log("Reintentos por pago: " + MAX_REINTENTOS);
console.log("AgentYarbox: " + AGENT_YARBOX_ADDRESS);

const PAGOS_POR_AGENTE = 3;
const RECIPIENT = "0xF6805F61820A860db4B7462Bc9940793fC8ed22A";

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

if (exitosos.length > 0) {
  console.log("\n=== TIQUETES DE PAGO ===");
  exitosos.forEach(r => {
    if (r.tiquete && !r.tiquete.error) {
      console.log("\nIntent ID: " + r.tiquete.intentId);
      console.log("  Agente: " + r.tiquete.agent);
      console.log("  Mandato: " + r.tiquete.mandateId);
      console.log("  Monto máximo: " + r.tiquete.maxAmount);
      console.log("  Payment Nonce: " + r.tiquete.paymentNonce);
      console.log("  Liquidado: " + r.tiquete.settled);
      console.log("  Inconsistente: " + r.tiquete.inconsistent);
    }
  });
}

console.log("\n=== FIN DEL COMPILADOR DAG ===");
