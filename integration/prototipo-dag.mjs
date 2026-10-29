import { MandateSDK } from "@chan30/mandate-sdk";

const sdk = new MandateSDK({
  privateKey: process.env.PRIVATE_KEY,
  rpcUrl: "https://rpc.monad.xyz",
  chainId: 143,
});

// Intenciones de ejemplo — 3 agentes pagando APIs
const intenciones = [
  { agentId: "agente-01", amount: "0.1", recipient: "0x0000000000000000000000000000000000000001" },
  { agentId: "agente-02", amount: "0.2", recipient: "0x0000000000000000000000000000000000000001" },
  { agentId: "agente-03", amount: "0.3", recipient: "0x0000000000000000000000000000000000000001" },
];

// El mandato #2 que ya registraste
const mandateId = "0xeed58693b85c7b4d05b3a23a7458fd81f174cc3163e528d7cffe4016a2cd5494";

const passkey = {
  privateKey: new Uint8Array([52,106,39,221,137,224,218,31,192,192,188,186,205,180,51,235,76,206,92,193,107,19,255,119,85,14,140,146,235,76,108,115]),
  publicKey: new Uint8Array([4,81,200,57,239,55,80,229,102,114,12,23,222,219,94,164,40,186,9,52,161,181,96,72,141,137,79,70,11,167,165,251,79,114,73,26,163,137,65,66,82,200,171,130,212,176,150,22,171,32,156,8,49,54,53,114,198,117,24,117,124,21,212,243,54]),
  pubX: "51c839ef3750e566720c17dedb5ea428ba0934a1b560488d894f460ba7a5fb4f",
  pubY: "72491aa389414252c8ab82d4b09616ab209c0831363572c67518757c15d4f336",
};

console.log("=== VALIDACIÓN PARALELA (estilo AETHEL-AUTAPON) ===");
const t0 = Date.now();

const validaciones = await Promise.all(
  intenciones.map(async (int) => {
    const [fee, activo] = await Promise.all([
      sdk.calculateFee(int.amount),
      sdk.isMandateActive(mandateId, passkey),
    ]);
    return { intencion: int, fee, activo, valido: activo };
  })
);

const t1 = Date.now();
console.log(`Tiempo de validación paralela: ${t1 - t0}ms`);
console.table(validaciones.map(v => ({
  agente: v.intencion.agentId,
  monto: v.intencion.amount,
  fee: v.fee,
  valido: v.valido,
})));

const validas = validaciones.filter(v => v.valido);
const invalidas = validaciones.filter(v => !v.valido);
console.log(`Válidas: ${validas.length}, Inválidas: ${invalidas.length}`);

console.log("\n=== EJECUCIÓN DE PAGOS ===");
const t2 = Date.now();

const pagos = await Promise.all(
  validas.map(v =>
    sdk.pay({
      mandateId,
      passkey,
      amount: v.intencion.amount,
      recipient: v.intencion.recipient,
    }).catch(e => ({ error: e.message, agente: v.intencion.agentId }))
  )
);

const t3 = Date.now();
console.log(`Tiempo de pagos: ${t3 - t2}ms`);
pagos.forEach((p, i) => {
  if (p.error) {
    console.log(`❌ ${validas[i].intencion.agentId}: ${p.error}`);
  } else {
    console.log(`✅ ${validas[i].intencion.agentId} → fee: ${p.fee}, net: ${p.netAmount}, tx: ${p.tx.slice(0, 10)}...`);
  }
});
