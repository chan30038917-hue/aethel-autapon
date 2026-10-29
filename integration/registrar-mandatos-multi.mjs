import { MandateSDK } from "@chan30/mandate-sdk";
import { readFileSync, writeFileSync } from "fs";

const cuentas = JSON.parse(readFileSync("cuentas-agentes.json", "utf8"));
const mandatos = [];

for (const cuenta of cuentas) {
  console.log("\nRegistrando mandato para " + cuenta.agentId + "...");

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

  console.log("mandateId: " + resultado.mandateId);
  console.log("tx: " + resultado.tx);
  console.log("status: " + resultado.receipt.status);

  mandatos.push({
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

writeFileSync("mandatos-agentes.json", JSON.stringify(mandatos, null, 2));
console.log("\n3 mandatos registrados en mandatos-agentes.json");
