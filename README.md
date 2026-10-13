# AETHEL-AUTAPON

Compilador DAG para coordinación de enjambres de agentes autónomos en Monad.

## Qué es

AETHEL-AUTAPON toma N intenciones de pago de M agentes, las valida off-chain, las agrupa por agente para respetar nonces, las organiza en capas sin colisión, y las ejecuta respetando el rate limit del RPC de Monad.

Usa [Mandate SDK](https://github.com/chan30038917-hue/mandate-sdk) para los límites de gasto on-chain.

## Resultados medidos en Monad Mainnet

| Agentes | Speedup | Pagos exitosos | Tiempo |
|---------|---------|----------------|--------|
| 3 | 3.03x | 3/3 | 5.5s |
| 10 | 6.46x | 9/10 | 8.4s |
| 10 (con reintentos) | ~6.5x | 24/24 | 25.5s |

## Cómo funciona

1. **Validación previa**: descarta intenciones inviables sin tocar la chain (ahorra gas).
2. **Agrupación por agente**: cada agente tiene su propia cola de nonces.
3. **Planificación de capas**: cada capa tiene como máximo 1 pago por agente.
4. **Ejecución con rate limit**: token bucket a 40 req/s + reintentos con backoff.
5. **Reporte**: éxitos, fallos, tiempo, rango de bloques.

## Instalación

\`\`\`bash
git clone https://github.com/TU_USUARIO/aethel-autapon
cd aethel-autapon
npm install
\`\`\`

## Uso

\`\`\`bash
node dag-compiler.mjs
\`\`\`

## Modelo de negocio

Fee compartido: AETHEL-AUTAPON se queda con el 50% del fee de Mandate (0.5% o 0.03 MON por transacción).

| Empresas | Txs/día/empresa | Ingreso/mes (MON) | Ingreso/mes (USD @$1.00) |
|----------|-----------------|-------------------|--------------------------|
| 10 | 100 | 450 | $450 |
| 50 | 1,000 | 22,500 | $22,500 |
| 100 | 1,000 | 45,000 | $45,000 |

## Licencia

MIT
