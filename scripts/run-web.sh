#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose up -d
[[ -f .env ]] || cp .env.example .env
npm install
npm run db:generate
npm run dev
