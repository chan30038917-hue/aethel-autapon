import { JsonRpcProvider, Wallet, parseEther } from "ethers";
import { readFileSync } from "fs";

const provider = new JsonRpcProvider("https://rpc.monad.xyz", 143);
const walletPrincipal = new Wallet(process.env.PRIVATE_KEY, provider);

const cuentas = JSON.parse(readFileSync("cuentas-agentes.json", "utf8"));

console.log("Fondeando desde:", walletPrincipal.address);

for (const cuenta of cuentas) {
  console.log("Enviando 0.1 MON a " + cuenta.agentId + " (" + cuenta.address + ")...");
  const tx = await walletPrincipal.sendTransaction({
    to: cuenta.address,
    value: parseEther("0.1"),
  });
  console.log("Tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("Confirmada en bloque", receipt.blockNumber);
}

console.log("Todas las cuentas fondeadas");
