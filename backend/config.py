import os
import json

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "clusters.json")

try:
    with open(CONFIG_PATH) as f:
        CLUSTERS = json.load(f)
except FileNotFoundError:
    print("[FATAL] clusters.json non trovato!")
    print(f"  Copia clusters.json.example in clusters.json e configuralo:")
    print(f"  cp {CONFIG_PATH}.example {CONFIG_PATH}")
    raise SystemExit(1)
except json.JSONDecodeError as e:
    print(f"[FATAL] clusters.json contiene JSON non valido: {e}")
    raise SystemExit(1)
