import { MandateSDK } from "@chan30/mandate-sdk";

const sdk = new MandateSDK({
  privateKey: "0xeed58693b85c7b4d05b3a23a7458fd81f174cc3163e528d7cffe4016a2cd5494",
  rpcUrl: "https://rpc.monad.xyz",
  chainId: 143,
});

const mandateId = "0xeed58693b85c7b4d05b3a23a7458fd81f174cc3163e528d7cffe4016a2cd5494";

const spendState = await sdk.getSpendState(mandateId);
console.log("Gasto del período actual:", spendState);

const mandate = await sdk.getMandate(mandateId);
console.log("Info del mandato:", mandate);
