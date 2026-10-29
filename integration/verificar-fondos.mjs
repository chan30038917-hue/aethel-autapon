import { JsonRpcProvider, formatEther } from "ethers";
import { readFileSync } from "fs";

const provider = new JsonRpcProvider("https://rpc.monad.xyz", 143);
const cuentas = JSON.parse(readFileSync("cuentas-agentes.json", "utf8"));

for (const cuenta of cuentas) {
  const balance = await provider.getBalance(cuenta.address);
  console.log(cuenta.agentId + " (" + cuenta.address + "): " + formatEther(balance) + " MON");
}
