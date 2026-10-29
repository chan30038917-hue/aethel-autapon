import { MandateSDK } from "@chan30/mandate-sdk";
import { JsonRpcProvider } from "ethers";
import { readFileSync } from "fs";

const provider = new JsonRpcProvider("https://rpc.monad.xyz", 143);
const mandatos = JSON.parse(readFileSync("mandatos-agentes.json", "utf8"));

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
    rpcUrl: "https://rpc.monad.xyz",
    chainId: 143,
  }),
}));

const RECIPIENT = "0x0000000000000000000000000000000000000001";
const DELAY_MS = 250;
const N = agentes.length;

function esperar(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function grupoSecuencial() {
  console.log("\n=== GRUPO A: " + N + " pagos SECUENCIALES desde 1 agente ===");
  const t0 = Date.now();
  let exitosos = 0;
  let fallidos = 0;
  const bloques = [];

  for (let i = 0; i < N; i++) {
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
      process.stdout.write(".");
    } catch (e) {
      fallidos++;
      process.stdout.write("x");
    }
  }

  const t1 = Date.now();
  const rango = bloques.length > 1 ? Math.max(...bloques) - Math.min(...bloques) : 0;
  console.log("\nTiempo total: " + (t1 - t0) + "ms");
  console.log("Exitosos: " + exitosos + "/" + N);
  console.log("Rango de bloques: " + rango);
  return { nombre: "A secuencial (" + N + ")", tiempo: t1 - t0, exitosos, total: N, rangoBloques: rango };
}

async function grupoParalelo() {
  console.log("\n=== GRUPO B: " + N + " pagos PARALELOS desde " + N + " agentes ===");
  const t0 = Date.now();

  const resultados = await Promise.all(
    agentes.map(async (agente) => {
      try {
        await esperar(Math.random() * 100);
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

  if (fallidos.length > 0) {
    console.log("\nFallidos:");
    fallidos.forEach(f => console.log("  " + f.agente + ": " + f.error));
  }

  const bloques = exitosos.map(r => r.bloque);
  const rango = bloques.length > 1 ? Math.max(...bloques) - Math.min(...bloques) : 0;
  console.log("\nTiempo total: " + (t1 - t0) + "ms");
  console.log("Exitosos: " + exitosos.length + "/" + N);
  console.log("Rango de bloques: " + rango);
  return { nombre: "B paralelo (" + N + ")", tiempo: t1 - t0, exitosos: exitosos.length, total: N, rangoBloques: rango };
}

console.log("=== EXPERIMENTO ESCALADO: " + N + " AGENTES ===\n");

const resultadoA = await grupoSecuencial();
console.log("\nEsperando 5 segundos...");
await esperar(5000);
const resultadoB = await grupoParalelo();

console.log("\n\n=== RESUMEN COMPARATIVO ===");
console.table([
  { grupo: resultadoA.nombre, tiempo: resultadoA.tiempo + "ms", exitosos: resultadoA.exitosos + "/" + resultadoA.total, rangoBloques: resultadoA.rangoBloques },
  { grupo: resultadoB.nombre, tiempo: resultadoB.tiempo + "ms", exitosos: resultadoB.exitosos + "/" + resultadoB.total, rangoBloques: resultadoB.rangoBloques },
]);

const diff = resultadoA.tiempo - resultadoB.tiempo;
const pct = ((diff / resultadoA.tiempo) * 100).toFixed(1);
const speedup = (resultadoA.tiempo / resultadoB.tiempo).toFixed(2);

console.log("\nSpeedup: " + speedup + "x");
console.log("Grupo B fue " + diff + "ms mas rapido (" + pct + "% mas rapido)");
