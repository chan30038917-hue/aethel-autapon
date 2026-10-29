import { MandateSDK } from "@chan30/mandate-sdk";
import { Wallet } from "ethers";

// Genera una clave aleatoria SOLO para pruebas de lectura.
// NO la uses para pagos reales.
const testWallet = Wallet.createRandom();

console.log("Wallet de prueba:", testWallet.address);

const sdk = new MandateSDK({
  privateKey: testWallet.privateKey,
  rpcUrl: "https://rpc.monad.xyz",
  chainId: 143,
});

try {
  const info = await sdk.info();
  console.log("✅ Conexión OK");
  console.log("Chain ID:", info.chainId);
  console.log("Wallet:", info.wallet);
  console.log("Balance:", info.balance);
  console.log("Fee:", info.fee);
  console.log("FeeRecipient:", info.feeRecipient);
} catch (e) {
  console.error("❌ Error:", e.message);
}
