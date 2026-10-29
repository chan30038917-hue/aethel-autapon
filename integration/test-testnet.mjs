import { MandateSDK } from "@chan30/mandate-sdk";
import { Wallet } from "ethers";

const sdk = new MandateSDK({
  privateKey: Wallet.createRandom().privateKey,
  rpcUrl: "https://testnet-rpc.monad.xyz",
  chainId: 10143,
});

try {
  const info = await sdk.info();
  console.log("✅ Conexión Testnet OK");
  console.log("Chain ID:", info.chainId);
  console.log("Wallet:", info.wallet);
  console.log("Balance:", info.balance);
  console.log("FeeRecipient:", info.feeRecipient);
} catch (e) {
  console.error("❌ Error:", e.message);
}
