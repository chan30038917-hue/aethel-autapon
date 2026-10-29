import { MandateSDK } from "@chan30/mandate-sdk";

const sdk = new MandateSDK({
  privateKey: "19a9e39e0b29ecae4d07c5adfdb2733226ccd255cf3ab449eb4e4255af4f21d1",
  rpcUrl: "https://rpc.monad.xyz",
  chainId: 143,
});

const passkey = {
  privateKey: new Uint8Array([
    52, 106, 39, 221, 137, 224, 218,
    31, 192, 192, 188, 186, 205, 180,
    51, 235, 76, 206, 92, 193, 107,
    19, 255, 119, 85, 14, 140, 146,
    235, 76, 108, 115
  ]),
  publicKey: new Uint8Array([
    4, 81, 200, 57, 239, 55, 80, 229, 102, 114, 12,
    23, 222, 219, 94, 164, 40, 186, 9, 52, 161, 181,
    96, 72, 141, 137, 79, 70, 11, 167, 165, 251, 79,
    114, 73, 26, 163, 137, 65, 66, 82, 200, 171, 130,
    212, 176, 150, 22, 171, 32, 156, 8, 49, 54, 53,
    114, 198, 117, 24, 117, 124, 21, 212, 243, 54
  ]),
  pubX: "51c839ef3750e566720c17dedb5ea428ba0934a1b560488d894f460ba7a5fb4f",
  pubY: "72491aa389414252c8ab82d4b09616ab209c0831363572c67518757c15d4f336",
};

const mandateId = "0xeed58693b85c7b4d05b3a23a7458fd81f174cc3163e528d7cffe4016a2cd5494";

const result = await sdk.pay({
  mandateId,
  passkey,
  amount: "0.5",
  recipient: "0x0000000000000000000000000000000000000001",
});

console.log("✅ Pago ejecutado");
console.log("Fee:", result.fee, "MON");
console.log("NetAmount:", result.netAmount, "MON");
console.log("Payment Nonce:", result.paymentNonce);
console.log("Tx:", result.tx);
