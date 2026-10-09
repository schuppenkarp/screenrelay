#!/bin/sh
set -eu
if [ -n "$(ls -A /app/data)" ]; then
  echo 'Target volume is not empty. Import refused.' >&2
  exit 1
fi
tar -xzf /restore/private-data.tar.gz -C /app/data
chown -R node:node /app/data
