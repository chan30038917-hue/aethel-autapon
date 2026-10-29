import { Wallet } from "ethers";
import { writeFileSync } from "fs";

const cuentas = [];
for (let i = 1; i <= 3; i++) {
  const w = Wallet.createRandom();
  cuentas.push({
    agentId: `agente-0${i}`,
    address: w.address,
    privateKey: w.privateKey,
  });
}

writeFileSync("cuentas-agentes.json", JSON.stringify(cuentas, null, 2));
console.log("✅ 3 cuentas generadas y guardadas en cuentas-agentes.json");
console.table(cuentas.map(c => ({ agentId: c.agentId, address: c.address })));
