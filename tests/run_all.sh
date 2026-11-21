#!/usr/bin/env bash
# Ejecuta todas las pruebas. Requisitos: node, python3 con playwright y Chrome/Chromium.
# Las pruebas online necesitan el servidor PeerJS local (npm install en esta carpeta la primera vez).
cd "$(dirname "$0")"
echo "== Motor"; node test.js | tail -1; node arsenal_test.js | tail -1
(node peer-server.js > /tmp/peer.log 2>&1 &) ; (cd .. && python3 -m http.server 8000 > /tmp/http.log 2>&1 &) ; sleep 3
for t in arsenal_ui.py robo_ui.py posesion_ui.py cuentas_ui.py arsenal_botui.py botui.py manual.py arsenal_online.py online.py; do
  timeout 400 python3 "$t" > /tmp/t.txt 2>&1; echo "$t -> exit $? $(grep -E '^errors' /tmp/t.txt | tail -1)"
done
pkill -f peer-server.js; pkill -f "http.server 8000"
