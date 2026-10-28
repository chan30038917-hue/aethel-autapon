import { readFileSync } from "fs";

const tracking = JSON.parse(readFileSync("tracking.json", "utf8"));

console.log("=== REPORTE DE FACTURACION ===");
console.log("Fecha: " + new Date().toISOString());
console.log("");

const filas = [];
let totalTxs = 0;
let totalFee = 0;
let totalCompartido = 0;

for (const [apiKey, data] of Object.entries(tracking)) {
  filas.push({
    apiKey: apiKey.slice(0, 12) + "...",
    txs: data.txs,
    feeMON: data.feeMON.toFixed(4),
    feeCompartido: data.feeCompartido.toFixed(4),
    ultimaActividad: data.ultimaActividad || "nunca",
  });
  totalTxs += data.txs;
  totalFee += data.feeMON;
  totalCompartido += data.feeCompartido;
}

console.table(filas);

console.log("");
console.log("TOTAL:");
console.log("  Transacciones: " + totalTxs);
console.log("  Fee total: " + totalFee.toFixed(4) + " MON");
console.log("  Equivalente USD @$1.00: $" + totalCompartido.toFixed(2));
