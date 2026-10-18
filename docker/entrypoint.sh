#!/bin/sh
set -e

echo "[entrypoint] applying database migrations…"
node /opt/prisma/node_modules/prisma/build/index.js migrate deploy --schema ./prisma/schema.prisma

# `docker compose run app <command>` runs a one-off command (e.g. scripts/create-admin.mjs).
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

echo "[entrypoint] starting server on :${PORT:-3000}"
exec node server.js
