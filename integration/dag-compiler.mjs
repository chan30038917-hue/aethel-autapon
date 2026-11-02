import { MandateSDK } from "@chan30/mandate-sdk";
import { JsonRpcProvider, Contract, Wallet, formatEther, keccak256, toUtf8Bytes, parseEther, Network } from "ethers";
import { readFileSync, writeFileSync } from "fs";

const RPC_URL = process.env.RPC_URL || "https://rpc.monad.xyz";
const CHAIN_ID = parseInt(process.env.CHAIN_ID) || 143;
const RATE_LIMIT_RPS = parseInt(process.env.RATE_LIMIT_RPS) || 5;
const MAX_REINTENTOS = 3;

const AGENT_YARBOX_ADDRESS = process.env.AGENT_YARBOX || "0x4D0D993e6FF19279dF0E69d9cd9cC946480973dC";
const REPUTATION_NFT_ADDRESS = process.env.REPUTATION_NFT || "0xDE2153656df0dd9b370bc9796A5dd04Ad24BF4f8";

const AGENT_YARBOX_ABI = [
  "function commitIntent(bytes32 _intentHash, bytes32 _conditionHash, bytes32 _mandateId, uint256 _maxAmount, uint64 _erc8004AgentId) external returns (uint256)",
  "function settleIntent(uint256 _id, bytes32 _paymentNonce, bytes32 _resultHash) external",
  "function getMaxAmount(uint256 _id) external view returns (uint256)",
  "function getReceipt(uint256 _id) external view returns (address, uint64, bytes32, bytes32, bytes32, uint256, bytes32, bytes32, uint256, bool, bool)",
  "event IntentCommitted(uint256 indexed id, address indexed agent, uint64 erc8004AgentId, bytes32 intentHash, bytes32 mandateId, uint256 maxAmount)",
  "event IntentSettled(uint256 indexed id, bytes32 paymentNonce, bytes32 resultHash, uint256 timestamp)",
  "event IntentInconsistent(uint256 indexed id, string reason)"
];

const REPUTATION_NFT_ABI = [
  "function mintReceipt(address _agent, uint256 _intentId, uint256 _maxAmount, bytes32 _paymentNonce, uint256 _timestamp) external returns (uint256)"
];

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
      if (this.tokens >= 1) { this.tokens -= 1; return; }
      const waitMs = ((1 - this.tokens) / this.max) * 1000;
      await new Promise(r => setTimeout(r, Math.max(waitMs, 10)));
    }
  }
}

function guardarEstadoDashboard(capas, capaActual, resultados, agenteActual = null) {
  try {
    const estado = {
      timestamp: Date.now(),
      capasTotales: capas.length,
      capaActual,
      agenteActual,
      capas: capas.map((c, i) => ({
        numero: i + 1,
        pagos: c.map(p => p.intencion.agente.agentId),
        estado: i < capaActual ? 'completada' : (i === capaActual ? 'en_progreso' : 'pendiente')
      })),
      resultados: resultados.map(r => ({ ok: r.ok, agente: r.agente }))
    };
    writeFileSync('/home/usuariochan/agent-yarbox/explorer/web/dashboard-status.json', JSON.stringify(estado, null, 2));
  } catch (e) {}
}

const rateLimiter = new RateLimiter(RATE_LIMIT_RPS);
const provider = new JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true });
const agentYarbox = new Contract(AGENT_YARBOX_ADDRESS, AGENT_YARBOX_ABI, provider);
const reputationNft = new Contract(REPUTATION_NFT_ADDRESS, REPUTATION_NFT_ABI, provider);

const mandatos = JSON.parse(readFileSync("mandatos-agentes.json", "utf8"));
const agentes = mandatos.map(m => ({
  agentId: m.agentId,
  address: m.address,
  mandateId: m.mandateId,
  privateKey: m.privateKey,
  passkey: { privateKey: new Uint8Array(m.passkey.privateKey), publicKey: new Uint8Array(m.passkey.publicKey), pubX: m.passkey.pubX, pubY: m.passkey.pubY },
  sdk: new MandateSDK({ privateKey: m.privateKey, rpcUrl: RPC_URL, chainId: CHAIN_ID }),
}));

async function validarIntenciones(intenciones) {
  console.log("\n[FASE 1] Validando " + intenciones.length + " intenciones...");
  const validaciones = await Promise.all(
    intenciones.map(async (int) => {
      try {
        await rateLimiter.acquire();
        const fee = await int.agente.sdk.calculateFee(int.amount);
        await rateLimiter.acquire();
        const activo = await int.agente.sdk.isMandateActive(int.agente.mandateId, int.agente.passkey);
        const monto = BigInt(Math.floor(parseFloat(int.amount) * 1e18));
        const feeBig = BigInt(Math.floor(parseFloat(fee) * 1e18));
        const netoValido = monto > feeBig;
        await rateLimiter.acquire();
        const balance = await provider.getBalance(int.agente.address);
        const balanceMON = parseFloat(formatEther(balance));
        const amountNum = parseFloat(int.amount);
        const balanceOk = balanceMON >= (amountNum + 5);
        if (!balanceOk) return { intencion: int, valido: false, error: `balance insuficiente: ${balanceMON} MON` };
        return { intencion: int, fee, activo, netoValido, balanceOk, valido: activo && netoValido && balanceOk };
      } catch (e) {
        return { intencion: int, valido: false, error: e.message.slice(0, 80) };
      }
    })
  );
  const validas = validaciones.filter(v => v.valido);
  const invalidas = validaciones.filter(v => !v.valido);
  console.log("  Válidas: " + validas.length);
  console.log("  Inválidas: " + invalidas.length);
  return { validas, invalidas };
}

function agruparPorAgente(intencionesValidas) {
  console.log("\n[FASE 2] Agrupando por agente...");
  const porAgente = new Map();
  for (const v of intencionesValidas) {
    const agentId = v.intencion.agente.agentId;
    if (!porAgente.has(agentId)) porAgente.set(agentId, []);
    porAgente.get(agentId).push(v);
  }
  console.log("  Agentes con intenciones: " + porAgente.size);
  return porAgente;
}

function planificarCapas(porAgente) {
  console.log("\n[FASE 3] Planificando capas del DAG...");
  const capas = [];
  const colas = new Map();
  for (const [agentId, ints] of porAgente) colas.set(agentId, [...ints]);
  while (true) {
    const capa = [];
    for (const [agentId, cola] of colas) if (cola.length > 0) capa.push(cola.shift());
    if (capa.length === 0) break;
    capas.push(capa);
  }
  console.log("  Capas: " + capas.length);
  return capas;
}

async function ejecutarCapas(capas) {
  console.log("\n[FASE 4] Ejecutando capas...");
  guardarEstadoDashboard(capas, 0, []);
  const resultados = [];
  for (let i = 0; i < capas.length; i++) {
    guardarEstadoDashboard(capas, i, resultados);
    const capa = capas[i];
    process.stdout.write("  Capa " + (i + 1) + "/" + capas.length + ": ");

    const commits = await Promise.all(
      capa.map(async (v) => {
        try {
          const signer = new Wallet(v.intencion.agente.privateKey, provider);
          const agentYarboxConSigner = agentYarbox.connect(signer);
          const intentHash = keccak256(toUtf8Bytes("intent-" + Date.now() + "-" + v.intencion.agente.agentId));
          const conditionHash = keccak256(toUtf8Bytes("condition-" + v.intencion.agente.agentId));
          const maxAmount = parseEther(v.intencion.amount);
          await rateLimiter.acquire();
          const txCommit = await agentYarboxConSigner.commitIntent(intentHash, conditionHash, v.intencion.agente.mandateId, maxAmount, 0);
          const receiptCommit = await txCommit.wait();
          if (receiptCommit.logs.length === 0) return { ok: false, v, error: "Sin logs en commitIntent" };
          return { ok: true, v, intentId: receiptCommit.logs[0].args[0] };
        } catch (e) {
          return { ok: false, v, error: e.message.slice(0, 80) };
        }
      })
    );

    const commitsOk = commits.filter(c => c.ok);
    process.stdout.write("commits: " + commitsOk.length + "/" + capa.length + " ");
    await new Promise(r => setTimeout(r, 3000));

    const pagos = await Promise.all(
      commitsOk.map(async (c) => {
        const v = c.v;
        for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
          try {
            await rateLimiter.acquire();
            const r = await v.intencion.agente.sdk.pay({ mandateId: v.intencion.agente.mandateId, passkey: v.intencion.agente.passkey, amount: v.intencion.amount, recipient: v.intencion.recipient, gasLimit: 500000 });
            
            const signer = new Wallet(v.intencion.agente.privateKey, provider);
            const agentYarboxConSigner = agentYarbox.connect(signer);
            const paymentNonce = r.paymentNonce;
            const resultHash = keccak256(toUtf8Bytes("result-" + r.tx));
            
            await rateLimiter.acquire();
            const txSettle = await agentYarboxConSigner.settleIntent(c.intentId, paymentNonce, resultHash);
            await txSettle.wait();

            try {
              const ownerKey = process.env.OWNER_KEY || JSON.parse(readFileSync("mandatos-agentes.json", "utf8"))[0].privateKey;
              const ownerSigner = new Wallet(ownerKey, provider);
              const nftConSigner = reputationNft.connect(ownerSigner);
              const txNft = await nftConSigner.mintReceipt(v.intencion.agente.address, c.intentId, 50000000000000000n, paymentNonce, Math.floor(Date.now() / 1000));
              await txNft.wait();
              console.log("\n  ✅ NFT acuñado para intent " + c.intentId + " al agente " + v.intencion.agente.agentId);
            } catch (e) {
              console.log("\n  ❌ Error al acuñar NFT: " + e.message.slice(0, 80));
            }

            await rateLimiter.acquire();
            const receipt = await provider.waitForTransaction(r.tx);
            let tiquete = null;
            try {
              await rateLimiter.acquire();
              const rec = await agentYarbox.getReceipt(c.intentId);
              tiquete = { intentId: c.intentId.toString(), agent: rec[0], mandateId: rec[4], maxAmount: rec[5].toString(), paymentNonce: rec[6], resultHash: rec[7], timestamp: rec[8].toString(), settled: rec[9], inconsistent: rec[10] };
            } catch (e) { tiquete = { error: e.message.slice(0, 80) }; }
            return { ok: true, agente: v.intencion.agente.agentId, tx: r.tx, bloque: receipt.blockNumber, fee: r.fee, netAmount: r.netAmount, intentId: c.intentId.toString(), tiquete };
          } catch (e) {
            if (e.message.includes("-32007") || e.message.includes("50/second")) {
              await new Promise(r => setTimeout(r, Math.pow(2, intento) * 1000));
            } else break;
          }
        }
        return { ok: false, agente: v.intencion.agente.agentId, error: "Fallo después de reintentos" };
      })
    );
    const ok = pagos.filter(r => r.ok).length;
    process.stdout.write("pagos: " + ok + "/" + capa.length + " OK\n");
    resultados.push(...pagos);
    await new Promise(r => setTimeout(r, 3000));
  }
  return { resultados };
}

console.log("=== COMPILADOR DAG AETHEL-AUTAPON ===");
const intenciones = [];
for (const agente of agentes) for (let i = 0; i < 3; i++) intenciones.push({ agente, amount: "0.05", recipient: "0xF6805F61820A860db4B7462Bc9940793fC8ed22A" });

const { validas } = await validarIntenciones(intenciones);
if (validas.length === 0) process.exit(1);
const porAgente = agruparPorAgente(validas);
const capas = planificarCapas(porAgente);
const { resultados } = await ejecutarCapas(capas);
console.log("\n=== RESUMEN FINAL ===");
console.log("Pagos exitosos: " + resultados.filter(r => r.ok).length);
console.log("Pagos fallidos: " + resultados.filter(r => !r.ok).length);
