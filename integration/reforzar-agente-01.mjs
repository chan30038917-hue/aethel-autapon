import { JsonRpcProvider, Wallet, parseEther, formatEther } from "ethers";
import { readFileSync } from "fs";

const provider = new JsonRpcProvider("https://rpc.monad.xyz", 143);
const walletPrincipal = new Wallet(process.env.PRIVATE_KEY, provider);
const cuentas = JSON.parse(readFileSync("cuentas-agentes.json", "utf8"));

const agente01 = cuentas[0];
const balanceActual = await provider.getBalance(agente01.address);
const objetivo = parseEther("2.0");

console.log("agente-01 saldo actual: " + formatEther(balanceActual) + " MON");

if (balanceActual < objetivo) {
  const aEnviar = objetivo - balanceActual;
  console.log("Enviando " + formatEther(aEnviar) + " MON...");
  const tx = await walletPrincipal.sendTransaction({
    to: agente01.address,
    value: aEnviar,
  });
  console.log("Tx: " + tx.hash);
  await tx.wait();
  console.log("Confirmada");
} else {
  console.log("agente-01 ya tiene suficiente");
}
