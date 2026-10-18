#!/bin/sh
# Nightly logical backup (custom format, compressed). Restore with:
#   pg_restore --clean --if-exists -d "$DATABASE_URL" backups/warranty-YYYYMMDD-HHMMSS.dump
set -e
STAMP=$(date +%Y%m%d-%H%M%S)
FILE="/backups/warranty-${STAMP}.dump"
pg_dump --format=custom --compress=9 --file="$FILE"
echo "[backup] wrote $FILE ($(du -h "$FILE" | cut -f1))"
find /backups -name 'warranty-*.dump' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
# Copy /backups off-site (S3, rclone, …) — a backup on the same VPS is not a disaster-recovery plan.
