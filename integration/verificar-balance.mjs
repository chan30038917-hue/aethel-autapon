import { MandateSDK } from "@chan30/mandate-sdk";
import { Wallet } from "ethers";

// ⚠️ REEMPLAZA ESTO con tu private key real
const PRIVATE_KEY = "0xTU_CLAVE_PRIVADA_AQUI";

const sdk = new MandateSDK({
  privateKey: PRIVATE_KEY,
  rpcUrl: "https://rpc.monad.xyz",
  chainId: 143,
});

const info = await sdk.info();
console.log("Wallet:", info.wallet);
console.log("Balance:", info.balance, "MON");
console.log("Chain ID:", info.chainId);
