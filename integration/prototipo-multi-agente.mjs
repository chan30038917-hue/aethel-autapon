import { MandateSDK } from "@chan30/mandate-sdk";
import { readFileSync } from "fs";

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

const intenciones = [
  { agente: agentes[0], amount: "0.05", recipient: "0x0000000000000000000000000000000000000001" },
  { agente: agentes[1], amount: "0.05", recipient: "0x0000000000000000000000000000000000000001" },
  { agente: agentes[2], amount: "0.05", recipient: "0x0000000000000000000000000000000000000001" },
];

console.log("=== VALIDACION PARALELA MULTI-AGENTE ===");
const t0 = Date.now();

const validaciones = await Promise.all(
  intenciones.map(async (int) => {
    const fee = await int.agente.sdk.calculateFee(int.amount);
    const activo = await int.agente.sdk.isMandateActive(int.agente.mandateId, int.agente.passkey);
    return { intencion: int, fee, activo, valido: activo };
  })
);

const t1 = Date.now();
console.log("Tiempo de validacion paralela: " + (t1 - t0) + "ms");
console.table(validaciones.map(v => ({
  agente: v.intencion.agente.agentId,
  monto: v.intencion.amount,
  fee: v.fee,
  valido: v.valido,
})));

const validas = validaciones.filter(v => v.valido);
console.log("Validas: " + validas.length + ", Invalidas: " + (validaciones.length - validas.length));

console.log("\n=== EJECUCION DE PAGOS EN PARALELO REAL ===");
const t2 = Date.now();

const pagos = await Promise.all(
  validas.map(v =>
    v.intencion.agente.sdk.pay({
      mandateId: v.intencion.agente.mandateId,
      passkey: v.intencion.agente.passkey,
      amount: v.intencion.amount,
      recipient: v.intencion.recipient,
    }).catch(e => ({ error: e.message, agente: v.intencion.agente.agentId }))
  )
);

const t3 = Date.now();
console.log("Tiempo de pagos: " + (t3 - t2) + "ms");
pagos.forEach((p, i) => {
  if (p.error) {
    console.log("FALLO " + validas[i].intencion.agente.agentId + ": " + p.error);
  } else {
    console.log("OK " + validas[i].intencion.agente.agentId + " -> fee: " + p.fee + ", net: " + p.netAmount + ", tx: " + p.tx.slice(0, 12) + "...");
  }
});

const exitosos = pagos.filter(p => !p.error).length;
console.log("\nResultado: " + exitosos + "/" + validas.length + " pagos exitosos");
