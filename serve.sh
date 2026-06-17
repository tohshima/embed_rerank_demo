#!/bin/sh
# 簡易HTTPサーバーでデモを起動する
cd "$(dirname "$0")"
echo "→ http://localhost:8000 を開いてください (Ctrl+C で停止)"
python3 -m http.server 8000
