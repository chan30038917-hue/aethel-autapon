import { MandateSDK } from "@chan30/mandate-sdk";
import { Wallet } from "ethers";

const sdk = new MandateSDK({
  privateKey: Wallet.createRandom().privateKey,
  rpcUrl: "https://rpc.monad.xyz",
  chainId: 143,
});

const casos = ["0.5", "1", "6", "10", "100"];

for (const monto of casos) {
  const fee = await sdk.calculateFee(monto);
  console.log(`Monto: ${monto} MON → Fee: ${fee} MON (tipo: ${typeof fee})`);
}
