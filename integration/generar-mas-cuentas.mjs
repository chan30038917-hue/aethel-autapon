import { Wallet } from "ethers";
import { readFileSync, writeFileSync } from "fs";

const cuentas = JSON.parse(readFileSync("cuentas-agentes.json", "utf8"));
const existentes = cuentas.length;

console.log("Cuentas existentes: " + existentes);

for (let i = existentes + 1; i <= 10; i++) {
  const w = Wallet.createRandom();
  cuentas.push({
    agentId: "agente-" + String(i).padStart(2, "0"),
    address: w.address,
    privateKey: w.privateKey,
  });
  console.log("Generada: agente-" + String(i).padStart(2, "0") + " -> " + w.address);
}

writeFileSync("cuentas-agentes.json", JSON.stringify(cuentas, null, 2));
console.log("\nTotal de cuentas: " + cuentas.length);
