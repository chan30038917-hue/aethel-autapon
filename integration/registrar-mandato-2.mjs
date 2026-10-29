import { MandateSDK } from "@chan30/mandate-sdk";

const sdk = new MandateSDK({
  privateKey: "19a9e39e0b29ecae4d07c5adfdb2733226ccd255cf3ab449eb4e4255af4f21d1",
  rpcUrl: "https://rpc.monad.xyz",
  chainId: 143,
});

console.log("Registrando mandato funcional...");

const { mandateId, passkey, tx, receipt } = await sdk.registerMandate({
  maxPerTx: "1.0",       // 1 MON max por transacción (cubre fee 0.03 + margen)
  maxPerPeriod: "10.0",  // 10 MON por período
  validDays: 7,          // 7 días de validez
});

console.log("mandateId:", mandateId);
console.log("passkey:", passkey);
console.log("tx:", tx);
console.log("receipt status:", receipt.status);
