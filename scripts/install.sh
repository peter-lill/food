#!/usr/bin/env bash
set -euo pipefail
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-/home/peter/Development/food}"
if [[ -e "$TARGET" ]]; then
  BACKUP="${TARGET}.backup.$(date +%Y%m%d-%H%M%S)"
  echo "Existing Food project detected; moving it to $BACKUP"
  mv "$TARGET" "$BACKUP"
fi
mkdir -p "$(dirname "$TARGET")"
cp -a "$SOURCE_DIR" "$TARGET"
rm -rf "$TARGET/.git"
cp "$TARGET/.env.example" "$TARGET/.env"
chmod +x "$TARGET/scripts/"*.sh
cat <<MSG
Installed Food to $TARGET
Next:
  cd $TARGET
  docker compose up -d
  npm install
  npm run db:generate
  npm run dev
Open http://localhost:3100
MSG
