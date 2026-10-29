import { JsonRpcProvider, Wallet, parseEther, formatEther } from "ethers";
import { readFileSync } from "fs";

const provider = new JsonRpcProvider("https://rpc.monad.xyz", 143);
const walletPrincipal = new Wallet(process.env.PRIVATE_KEY, provider);
const cuentas = JSON.parse(readFileSync("cuentas-agentes.json", "utf8"));

const objetivo = parseEther("0.5");
let totalEnviado = 0n;

console.log("Fondeando " + cuentas.length + " agentes con " + formatEther(objetivo) + " MON cada uno\n");

for (const cuenta of cuentas) {
  const balanceActual = await provider.getBalance(cuenta.address);
  
  if (balanceActual >= objetivo) {
    console.log(cuenta.agentId + " ya tiene " + formatEther(balanceActual) + " MON. Saltando.");
    continue;
  }
  
  const aEnviar = objetivo - balanceActual;
  console.log(cuenta.agentId + " (" + cuenta.address.slice(0, 10) + "...) enviando " + formatEther(aEnviar) + " MON...");
  
  const tx = await walletPrincipal.sendTransaction({
    to: cuenta.address,
    value: aEnviar,
  });
  await tx.wait();
  totalEnviado += aEnviar;
}

console.log("\nTotal enviado: " + formatEther(totalEnviado) + " MON");
