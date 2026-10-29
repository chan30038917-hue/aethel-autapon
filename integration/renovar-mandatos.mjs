import { MandateSDK } from "@chan30/mandate-sdk";
import { readFileSync, writeFileSync } from "fs";

const RPC_URL = "https://rpc.monad.xyz";
const CHAIN_ID = 143;

const mandatos = JSON.parse(readFileSync("mandatos-agentes.json", "utf8"));

console.log("Renovando " + mandatos.length + " mandatos...");

const nuevosMandatos = [];

for (const m of mandatos) {
  console.log("\nProcesando " + m.agentId + "...");

  const sdk = new MandateSDK({
    privateKey: m.privateKey,
    rpcUrl: RPC_URL,
    chainId: CHAIN_ID,
  });

  try {
    // Registrar un mandato nuevo con 30 días de validez
    const { mandateId, passkey } = await sdk.registerMandate({
      maxPerTx: "10",
      maxPerPeriod: "100",
      validDays: 30,
    });

    console.log("  Nuevo mandateId: " + mandateId);

    // Guardar el nuevo mandato con la misma privateKey y agentId
    nuevosMandatos.push({
      agentId: m.agentId,
      address: m.address,
      privateKey: m.privateKey,
      mandateId: mandateId,
      passkey: passkey,
    });

  } catch (e) {
    console.error("  Error: " + e.message);
    // Mantener el mandato viejo si falla
    nuevosMandatos.push(m);
  }
}

// Guardar el archivo actualizado
writeFileSync("mandatos-agentes.json", JSON.stringify(nuevosMandatos, null, 2));
console.log("\nArchivo mandatos-agentes.json actualizado.");
