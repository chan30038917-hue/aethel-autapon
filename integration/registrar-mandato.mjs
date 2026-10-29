// register-mandate.mjs
import { MandateSDK } from "@chan30/mandate-sdk";

const sdk = new MandateSDK({
  privateKey: "19a9e39e0b29ecae4d07c5adfdb2733226ccd255cf3ab449eb4e4255af4f21d1",
  rpcUrl: "https://rpc.monad.xyz",
  chainId: 143,
});

// Parámetros conservadores, primera prueba
const { mandateId, passkey } = await sdk.registerMandate({
  maxPerTx: "0.001",      // Máximo 0.001 MON por transacción
  maxPerPeriod: "0.01",   // Máximo 0.01 MON por período
  validDays: 1,           // Válido por 1 día
});

console.log("mandateId:", mandateId);
console.log("passkey:", passkey);
