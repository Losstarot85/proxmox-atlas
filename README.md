# Proxmox Atlas

Dashboard multi-cluster per monitoraggio e simulazione di cluster Proxmox VE.

## Obiettivo
- Monitorare più cluster contemporaneamente
- Visualizzare stato nodi e VM
- Alert base su CPU/RAM/VM
- Timeline degli eventi (Time Machine)
- Simulazioni di failure / What-If Engine

## Quick Start

### 1. Configura le credenziali

```bash
cp backend/clusters.json.example backend/clusters.json
```

Modifica `backend/clusters.json` con i dati dei tuoi cluster Proxmox:

```json
[
  {
    "name": "Il mio cluster",
    "host": "https://192.168.1.1:8006",
    "token_id": "root@pam!atlas",
    "token_secret": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  }
]
```

> ⚠️ **Non committare mai `clusters.json`** — contiene credenziali reali. Il file è già nel `.gitignore`.

### 2. Avvia con Docker Compose

```bash
docker compose up --build
```

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:8000

## Sicurezza

- Le credenziali vanno **solo** in `backend/clusters.json` (ignorato da git)
- Il file `clusters.json.example` contiene valori placeholder ed è safe da committare
- I token API Proxmox dovrebbero avere i **permessi minimi** necessari (read-only è sufficiente)

## Roadmap mini-step
0. ~~Setup iniziale~~
1. ~~Backend minimale FastAPI con connessione cluster~~
2. ~~Frontend minimale con tabella nodi~~
3. ~~Polling minimo~~
4. ~~Lista VM~~
5. ~~Multi-cluster support~~
6. Alert CPU/RAM
7. Timeline eventi (Time Machine)
8. What-If Engine