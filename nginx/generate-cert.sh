#!/bin/sh
# generate-cert.sh — Generates a self-signed SSL certificate if none exists.
# This runs automatically on Nginx container startup via /docker-entrypoint.d/

CERT_DIR="/certs"
CERT_FILE="$CERT_DIR/atlas.crt"
KEY_FILE="$CERT_DIR/atlas.key"

if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "[SSL] Certificates found, skipping generation."
    exit 0
fi

echo "[SSL] No certificates found. Generating self-signed certificate..."

mkdir -p "$CERT_DIR"

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -subj "/CN=proxmox-atlas/O=Proxmox Atlas" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>/dev/null

chmod 644 "$CERT_FILE"
chmod 600 "$KEY_FILE"

echo "[SSL] Self-signed certificate generated successfully."
