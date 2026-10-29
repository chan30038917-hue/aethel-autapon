import { MandateSDK } from "@chan30/mandate-sdk";
import { readFileSync, writeFileSync } from "fs";

const cuentas = JSON.parse(readFileSync("cuentas-agentes.json", "utf8"));
const mandatosExistentes = JSON.parse(readFileSync("mandatos-agentes.json", "utf8"));

// Mapear mandatos existentes por agentId
const mandatosMap = new Map();
for (const m of mandatosExistentes) {
  mandatosMap.set(m.agentId, m);
}

// Registrar mandatos para las cuentas que no los tengan
for (const cuenta of cuentas) {
  if (mandatosMap.has(cuenta.agentId)) {
    console.log(cuenta.agentId + " ya tiene mandato. Saltando.");
    continue;
  }

  console.log("Registrando mandato para " + cuenta.agentId + "...");

  const sdk = new MandateSDK({
    privateKey: cuenta.privateKey,
    rpcUrl: "https://rpc.monad.xyz",
    chainId: 143,
  });

  const resultado = await sdk.registerMandate({
    maxPerTx: "1.0",
    maxPerPeriod: "10.0",
    validDays: 7,
  });

  console.log("  mandateId: " + resultado.mandateId);
  console.log("  tx: " + resultado.tx);

  mandatosMap.set(cuenta.agentId, {
    agentId: cuenta.agentId,
    address: cuenta.address,
    privateKey: cuenta.privateKey,
    mandateId: resultado.mandateId,
    passkey: {
      privateKey: Array.from(resultado.passkey.privateKey),
      publicKey: Array.from(resultado.passkey.publicKey),
      pubX: resultado.passkey.pubX,
      pubY: resultado.passkey.pubY,
    },
  });
}

const todosLosMandatos = Array.from(mandatosMap.values());
writeFileSync("mandatos-agentes.json", JSON.stringify(todosLosMandatos, null, 2));
console.log("\nTotal de mandatos: " + todosLosMandatos.length);
