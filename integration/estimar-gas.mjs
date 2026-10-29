import { MandateSDK } from "@chan30/mandate-sdk";
import { JsonRpcProvider, Wallet } from "ethers";

const PRIVATE_KEY = "19a9e39e0b29ecae4d07c5adfdb2733226ccd255cf3ab449eb4e4255af4f21d1";
const provider = new JsonRpcProvider("https://rpc.monad.xyz", 143);
const wallet = new Wallet(PRIVATE_KEY, provider);

// Consultar el precio del gas actual
const feeData = await provider.getFeeData();
console.log("Gas Price:", feeData.gasPrice?.toString());
console.log("Max Fee Per Gas:", feeData.maxFeePerGas?.toString());

// Estimar costo para un Gas Limit típico de interacción con contrato
const gasLimitEstimado = 200000n;
const costoEstimado = gasLimitEstimado * (feeData.gasPrice || 0n);
console.log("Costo estimado (Gas Limit 200k):", costoEstimado.toString(), "wei");
