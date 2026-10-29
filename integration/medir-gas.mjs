import { MandateSDK } from "@chan30/mandate-sdk";
import { JsonRpcProvider } from "ethers";
import { readFileSync } from "fs";

const mandatos = JSON.parse(readFileSync("mandatos-agentes.json", "utf8"));
const provider = new JsonRpcProvider("https://rpc.monad.xyz", 143);

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

const intenciones = agentes.map((a) => ({
  agente: a,
  amount: "0.05",
  recipient: "0x0000000000000000000000000000000000000001",
}));

console.log("=== EXPERIMENTO: gasUsed vs gasLimit en Mandate SDK ===\n");

const resultados = [];

for (const int of intenciones) {
  process.stdout.write("Enviando pago " + int.agente.agentId + "... ");

  const t0 = Date.now();
  const result = await int.agente.sdk.pay({
    mandateId: int.agente.mandateId,
    passkey: int.agente.passkey,
    amount: int.amount,
    recipient: int.recipient,
  });
  const t1 = Date.now();

  // Esperar a que la transaccion este minada
  const receipt = await provider.waitForTransaction(result.tx);

  if (!receipt) {
    console.log("AVISO: receipt null para tx " + result.tx);
    continue;
  }

  // Inspeccionar campos del receipt
  console.log("OK (" + (t1 - t0) + "ms)");
  if (resultados.length === 0) {
    console.log("Campos del receipt: " + Object.keys(receipt).join(", "));
  }

  // Obtener gasLimit de la transaccion original, gasUsed del receipt
  const tx = await provider.getTransaction(result.tx);

  const gasLimit = tx && tx.gasLimit ? tx.gasLimit : 0n;
  const gasUsed = receipt.gasUsed ? receipt.gasUsed : 0n;
  const gasPrice = receipt.gasPrice
    ? receipt.gasPrice
    : (receipt.effectiveGasPrice ? receipt.effectiveGasPrice : 0n);

  resultados.push({
    agente: int.agente.agentId,
    tx: result.tx,
    gasLimit: gasLimit.toString(),
    gasUsed: gasUsed.toString(),
    gasPrice: gasPrice.toString(),
    tiempoEnvio: t1 - t0,
    fee: result.fee,
    netAmount: result.netAmount,
  });
}

console.log("\n=== RESULTADOS ===");
console.table(resultados.map(r => ({
  agente: r.agente,
  gasLimit: r.gasLimit,
  gasUsed: r.gasUsed,
  gasPrice: r.gasPrice,
  tiempoEnvio: r.tiempoEnvio + "ms",
})));

console.log("\n=== ANALISIS DE DESPERDICIO ===");
for (const r of resultados) {
  const limit = BigInt(r.gasLimit);
  const used = BigInt(r.gasUsed);
  const price = BigInt(r.gasPrice);

  if (used === 0n) {
    console.log(r.agente + ": gasUsed es 0 (receipt incompleto)");
    continue;
  }

  const desperdicioGas = limit - used;
  const factor = Number(limit) / Number(used);
  const desperdicioMON = (desperdicioGas * price) / (10n ** 18n);

  console.log(
    r.agente + ": limit=" + limit + ", used=" + used +
    ", factor=" + factor.toFixed(2) + "x, desperdicio=" +
    desperdicioGas + " gas (" + desperdicioMON + " MON)"
  );
}

const totalLimit = resultados.reduce((s, r) => s + BigInt(r.gasLimit), 0n);
const totalUsed = resultados.reduce((s, r) => s + BigInt(r.gasUsed), 0n);
const totalPrice = BigInt(resultados[0].gasPrice);

const costoLimit = (totalLimit * totalPrice) / (10n ** 18n);
const costoUsed = (totalUsed * totalPrice) / (10n ** 18n);

console.log("\n=== TOTALES ===");
console.log("Gas Limit total: " + totalLimit);
console.log("Gas Used total:  " + totalUsed);
if (totalUsed > 0n) {
  console.log("Factor:          " + (Number(totalLimit) / Number(totalUsed)).toFixed(2) + "x");
}
console.log("Costo por limit: " + costoLimit + " MON");
console.log("Costo por used:  " + costoUsed + " MON");
console.log("Desperdicio:     " + (costoLimit - costoUsed) + " MON");
