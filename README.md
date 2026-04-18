# <a href="frontend/public/logo.png"><img src="frontend/public/logo.png" width="35"></a> Proxmox Atlas

**Real-time multi-cluster monitoring dashboard for Proxmox VE infrastructure.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](docker-compose.yml)

Proxmox Atlas provides a unified, high-performance dashboard to monitor all your Proxmox VE clusters in real time. Built with a performance-first architecture (~100MB RAM), it delivers live metrics via Server-Sent Events, anomaly detection, capacity planning simulations, and full historical data powered by Prometheus.

---

## ✨ Features

- **Multi-Cluster Monitoring** — Monitor unlimited Proxmox clusters from a single dashboard
- **Real-Time Metrics** — Live CPU, RAM, Storage, Network, Disk I/O, Pressure Stalls via SSE
- **Anomaly Detection** — Automatic 3σ deviation alerts powered by Prometheus PromQL
- **What-If Engine** — Simulate node failures and predict migration outcomes
- **Time Machine** — Browse historical metrics with interactive Prometheus-backed charts
- **Uptime Heatmaps** — 30-day uptime visualization for every node and VM
- **Smart Alerts** — Configurable thresholds with webhook notifications (Slack, Teams, Discord)
- **JWT Authentication** — Secure login with bcrypt-hashed passwords
- **HTTPS by Default** — Self-signed SSL certificate auto-generated on first deploy
- **Ultra Lightweight** — Native SVG charts, zero external charting libraries, ~100MB RAM footprint

---

## 🚀 Quick Start

### One-Line Install

```bash
curl -sSL https://raw.githubusercontent.com/Losstarot85/proxmox-atlas/main/install.sh | bash
```

This will:
1. Clone the repository to `~/proxmox-atlas`
2. Generate a self-signed SSL certificate
3. Build and start all containers
4. Atlas will be available at `https://<your-ip>`

### Default Credentials

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin` |

> You will be prompted to set a new password on first login.

### Manual Install

```bash
git clone https://github.com/Losstarot85/proxmox-atlas.git
cd proxmox-atlas
mkdir -p certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout certs/atlas.key -out certs/atlas.crt \
    -subj "/CN=proxmox-atlas"
docker compose up -d --build
```

---

## 🏗️ Architecture

```
                    ┌─────────────────────┐
                    │   Browser (HTTPS)   │
                    └─────────┬───────────┘
                              │ :443
                    ┌─────────▼───────────┐
                    │   Nginx (SSL/TLS)   │
                    │  Static Files + API  │
                    │   Reverse Proxy      │
                    └───┬─────────────┬───┘
                        │             │
              ┌─────────▼──┐   ┌──────▼────────┐
              │  FastAPI    │   │  Prometheus   │
              │  Backend    │◄──│  TSDB (30d)   │
              │  :8000      │──►│  :9090        │
              └─────────────┘   └───────────────┘
```

- **Nginx** — SSL termination, static frontend, API reverse proxy, security headers
- **Backend** — FastAPI + Uvicorn, SSE streaming, JWT auth, polling engine
- **Prometheus** — Time-series database for historical metrics and anomaly detection

> Backend and Prometheus are **not exposed** to the host network. Only Nginx is accessible.

---

## ⚙️ Configuration

### Adding Clusters

Clusters can be added directly from the **Settings** tab in the web UI. No manual file editing required.

Alternatively, you can pre-configure clusters by creating a `clusters.json` file in the Docker data volume.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ATLAS_HTTPS_PORT` | `443` | HTTPS port exposed on the host |
| `ATLAS_HTTP_PORT` | `80` | HTTP port (redirects to HTTPS) |
| `DATA_DIR` | `/data` | Path for persistent data inside the backend container |
| `PROMETHEUS_URL` | `http://prometheus:9090` | Prometheus endpoint |

Example with custom port:
```bash
ATLAS_HTTPS_PORT=8443 docker compose up -d
```

---

## 🔐 SSL Certificates

### Self-Signed (Default)

A self-signed certificate is automatically generated on first deploy. Browsers will show a security warning — this is expected and safe for internal/lab use.

### Custom Certificate

To use your own SSL certificate (e.g., from Let's Encrypt or your corporate CA):

```bash
# Copy your certificate and private key
cp /path/to/your-cert.pem ./certs/atlas.crt
cp /path/to/your-key.pem  ./certs/atlas.key

# Restart Nginx to apply
docker compose restart nginx
```

### Let's Encrypt (Certbot)

```bash
# Generate certificate with certbot
sudo certbot certonly --standalone -d atlas.example.com

# Copy to Atlas
sudo cp /etc/letsencrypt/live/atlas.example.com/fullchain.pem ./certs/atlas.crt
sudo cp /etc/letsencrypt/live/atlas.example.com/privkey.pem   ./certs/atlas.key

# Restart
docker compose restart nginx
```

> **Tip:** Set up a cron job to auto-renew and copy certificates periodically.

---

## 🔄 Updating

```bash
cd ~/proxmox-atlas
git pull
docker compose up -d --build
```

Or use the installer:
```bash
cd ~/proxmox-atlas && ./install.sh --update
```

Your data (clusters, settings, credentials) is persisted in Docker volumes and will survive updates.

---

## 🛡️ Security

- **HTTPS enforced** — HTTP automatically redirects to HTTPS
- **JWT authentication** — All API endpoints require a valid Bearer token
- **bcrypt passwords** — Admin password is hashed with bcrypt (never stored in plaintext)
- **No exposed internal services** — Prometheus and backend are only accessible within the Docker network
- **Security headers** — HSTS, X-Frame-Options, X-Content-Type-Options, CSP
- **Non-root containers** — Backend runs as unprivileged `atlas` user

### Proxmox API Tokens

For monitoring, Proxmox API tokens only need **read-only** permissions:
- `PVEAuditor` role is sufficient for full monitoring capabilities
- Never use root tokens in production

---

## 📊 Prometheus Integration

Atlas automatically exports metrics in Prometheus format and ships with a built-in Prometheus instance. Metrics are retained for **30 days** by default.

Available metrics:
- `proxmox_node_cpu_usage_ratio`, `proxmox_node_mem_*`, `proxmox_node_uptime_seconds`
- `proxmox_vm_cpu_usage_ratio`, `proxmox_vm_mem_*`, `proxmox_vm_disk_*`, `proxmox_vm_net_*`
- `proxmox_node_storage_total_bytes`, `proxmox_node_storage_used_bytes`

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
