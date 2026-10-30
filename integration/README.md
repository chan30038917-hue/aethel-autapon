# AETHEL-AUTAPON

Compilador DAG para coordinación de enjambres de agentes autónomos en Monad.

## Qué es

AETHEL-AUTAPON toma N intenciones de pago de M agentes, las valida off-chain, las agrupa por agente para respetar nonces, las organiza en capas sin colisión, y las ejecuta respetando el rate limit del RPC de Monad.

Usa Mandate SDK para los límites de gasto on-chain.

## Resultados medidos en Monad Mainnet

| Agentes | Speedup | Pagos exitosos | Tiempo |
|---------|---------|----------------|--------|
| 3 | 3.03x | 3/3 | 5.5s |
| 10 | 6.46x | 9/10 | 8.4s |
| 10 (con reintentos) | ~6.5x | 24/24 | 25.5s |

## Cómo funciona

1. Validación previa: descarta intenciones inviables sin tocar la chain.
2. Agrupación por agente: cada agente tiene su propia cola de nonces.
3. Planificación de capas: cada capa tiene como máximo 1 pago por agente.
4. Ejecución con rate limit: token bucket a 25 req/s + reintentos.
5. Reporte: éxitos, fallos, tiempo, rango de bloques.

## Instalación

git clone https://github.com/chan30038917-hue/aethel-autapon.git
cd aethel-autapon/integration
npm install

## Uso

node dag-compiler.mjs

## API

POST /pagar con header x-api-key
GET /health
GET /tracking/:apiKey

## Modelo de negocio

Fee de Mandate (0.5% o 0.03 MON por transacción).

| Empresas | Txs/día/empresa | Ingreso/mes (MON) |
|----------|-----------------|-------------------|
| 10 | 100 | 900 |
| 50 | 1,000 | 45,000 |
| 100 | 1,000 | 90,000 |

## Licencia

MIT


---

## Configuración para producción

AETHEL-AUTAPON está diseñado para ser instalado y ejecutado por cada cliente en su propio entorno. Cada instancia es independiente.

### Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| RPC_URL | https://rpc.monad.xyz | Endpoint RPC de Monad. Para producción, usa un RPC de pago (Alchemy, QuickNode) con mayor límite. |
| RATE_LIMIT_RPS | 20 | Peticiones por segundo al RPC. Baja este valor si usas el RPC público (25 rps). |
| CHAIN_ID | 143 | Chain ID de Monad Mainnet (143) o Testnet (10143). |

### Ejemplo de uso en producción

    RPC_URL="https://monad-mainnet.g.alchemy.com/v2/TU_API_KEY"     RATE_LIMIT_RPS=50     node dag-compiler.mjs

### Modo dry-run

Para probar sin gastar MON:

    node dag-compiler.mjs --dry-run
