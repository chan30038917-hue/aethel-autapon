import { JsonRpcProvider, Wallet, parseEther, formatEther } from "ethers";
import { readFileSync } from "fs";

const provider = new JsonRpcProvider("https://rpc.monad.xyz", 143);
const walletPrincipal = new Wallet(process.env.PRIVATE_KEY, provider);
const cuentas = JSON.parse(readFileSync("cuentas-agentes.json", "utf8"));

const objetivo = parseEther("0.5");

console.log("Refundiendo desde:", walletPrincipal.address);
console.log("Objetivo por agente:", formatEther(objetivo), "MON\n");

for (const cuenta of cuentas) {
  const balanceActual = await provider.getBalance(cuenta.address);
  console.log(cuenta.agentId + " saldo actual: " + formatEther(balanceActual) + " MON");

  if (balanceActual >= objetivo) {
    console.log("  Ya tiene suficiente. Saltando.\n");
    continue;
  }

  const aEnviar = objetivo - balanceActual;
  console.log("  Enviando " + formatEther(aEnviar) + " MON...");

  const tx = await walletPrincipal.sendTransaction({
    to: cuenta.address,
    value: aEnviar,
  });
  console.log("  Tx: " + tx.hash);
  await tx.wait();
  console.log("  Confirmada\n");
}

console.log("=== SALDOS FINALES ===");
for (const cuenta of cuentas) {
  const balance = await provider.getBalance(cuenta.address);
  console.log(cuenta.agentId + ": " + formatEther(balance) + " MON");
}
