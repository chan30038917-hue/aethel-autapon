# Estructura del proyecto AETHEL-AUTAPON

aethel-autapon/
├── README.md                    # Documentación principal
├── ESTRUCTURA.md                # Este archivo
├── integration/
│   ├── dag-compiler.mjs         # Compilador DAG (script CLI)
│   ├── api-server.mjs           # API HTTP para empresas
│   ├── facturacion.mjs          # Reporte mensual
│   ├── tracking.json            # Datos de uso por API key (generado)
│   ├── mandatos-agentes.json    # Mandatos registrados (NO subir a git)
│   ├── cuentas-agentes.json     # Cuentas de agentes (NO subir a git)
│   ├── package.json
│   └── node_modules/
├── contracts/                   # Contratos Solidity (si aplica)
└── docs/
    ├── whitepaper.md
    └── pitch.md
