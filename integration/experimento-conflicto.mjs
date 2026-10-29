import { MandateSDK } from "@chan30/mandate-sdk";
import { JsonRpcProvider } from "ethers";
import { readFileSync } from "fs";

const provider = new JsonRpcProvider("https://rpc.monad.xyz", 143);
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
    rpcUrl: "https://rpc.monad.xyz",
    chainId: 143,
  }),
}));

const RECIPIENT = "0x0000000000000000000000000000000000000001";
const DELAY_MS = 300;

function esperar(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Grupo A: 3 pagos secuenciales desde agente-01
async function grupoASecuencial() {
  console.log("\n=== GRUPO A (3 secuenciales, 1 agente) ===");
  const t0 = Date.now();
  let exitosos = 0;
  let fallidos = 0;
  const bloques = [];

  for (let i = 0; i < 3; i++) {
    try {
      await esperar(DELAY_MS);
      const r = await agentes[0].sdk.pay({
        mandateId: agentes[0].mandateId,
        passkey: agentes[0].passkey,
        amount: "0.05",
        recipient: RECIPIENT,
      });
      const receipt = await provider.waitForTransaction(r.tx);
      bloques.push(receipt.blockNumber);
      exitosos++;
      console.log("  pago " + (i+1) + ": OK (bloque " + receipt.blockNumber + ")");
    } catch (e) {
      fallidos++;
      console.log("  pago " + (i+1) + ": FALLO - " + e.message.slice(0, 60));
    }
  }

  const t1 = Date.now();
  const rango = bloques.length > 1 ? Math.max(...bloques) - Math.min(...bloques) : 0;
  console.log("Tiempo total: " + (t1 - t0) + "ms");
  console.log("Exitosos: " + exitosos + "/3");
  console.log("Rango de bloques: " + rango);
  return { nombre: "A (secuencial)", tiempo: t1 - t0, exitosos, rangoBloques: rango };
}

// Grupo B: 3 pagos paralelos desde 3 agentes distintos
async function grupoBParalelo() {
  console.log("\n=== GRUPO B (3 paralelos, 3 agentes) ===");
  const t0 = Date.now();

  const tareas = agentes.map(a => a);

  const resultados = await Promise.all(
    tareas.map(async (agente) => {
      try {
        await esperar(Math.random() * 200);
        const r = await agente.sdk.pay({
          mandateId: agente.mandateId,
          passkey: agente.passkey,
          amount: "0.05",
          recipient: RECIPIENT,
        });
        const receipt = await provider.waitForTransaction(r.tx);
        return { ok: true, bloque: receipt.blockNumber, agente: agente.agentId };
      } catch (e) {
        return { ok: false, error: e.message.slice(0, 60), agente: agente.agentId };
      }
    })
  );

  const t1 = Date.now();
  const exitosos = resultados.filter(r => r.ok);
  const fallidos = resultados.filter(r => !r.ok);

  exitosos.forEach(r => console.log("  " + r.agente + ": OK (bloque " + r.bloque + ")"));
  fallidos.forEach(r => console.log("  " + r.agente + ": FALLO - " + r.error));

  const bloques = exitosos.map(r => r.bloque);
  const rango = bloques.length > 1 ? Math.max(...bloques) - Math.min(...bloques) : 0;
  console.log("Tiempo total: " + (t1 - t0) + "ms");
  console.log("Exitosos: " + exitosos.length + "/3");
  console.log("Rango de bloques: " + rango);
  return { nombre: "B (paralelo)", tiempo: t1 - t0, exitosos: exitosos.length, rangoBloques: rango };
}

console.log("=== EXPERIMENTO DE CONFLICTO DE SLOTS EN MONAD ===");
console.log("Delay entre peticiones: " + DELAY_MS + "ms");

const resultadoA = await grupoASecuencial();

console.log("\nEsperando 5 segundos...");
await esperar(5000);

const resultadoB = await grupoBParalelo();

console.log("\n\n=== RESUMEN COMPARATIVO ===");
console.table([
  { grupo: resultadoA.nombre, tiempo: resultadoA.tiempo + "ms", exitosos: resultadoA.exitosos + "/3", rangoBloques: resultadoA.rangoBloques },
  { grupo: resultadoB.nombre, tiempo: resultadoB.tiempo + "ms", exitosos: resultadoB.exitosos + "/3", rangoBloques: resultadoB.rangoBloques },
]);

const diff = resultadoA.tiempo - resultadoB.tiempo;
if (diff > 0) {
  console.log("\nGrupo B fue " + diff + "ms mas rapido (" + ((diff / resultadoA.tiempo) * 100).toFixed(1) + "%)");
} else {
  console.log("\nGrupo A fue " + Math.abs(diff) + "ms mas rapido");
}
