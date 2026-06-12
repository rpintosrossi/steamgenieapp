#!/bin/sh
set -e

cd /app

echo "Running database migrations..."
pnpm db:deploy

echo "Release step complete."
