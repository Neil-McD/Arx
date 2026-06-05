#!/bin/sh
set -eu

export PATH="/usr/local/bin:$PATH"

/usr/local/bin/sandbox-api &
sandbox_api_pid="$!"
child_pid=""

cleanup() {
  if [ -n "$child_pid" ]; then
    kill "$child_pid" 2>/dev/null || true
  fi
  kill "$sandbox_api_pid" 2>/dev/null || true
  wait "$sandbox_api_pid" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

wait_for_port() {
  port="$1"
  timeout="${2:-30}"
  count=0
  while ! bash -lc ":</dev/tcp/127.0.0.1/$port" >/dev/null 2>&1; do
    sleep 1
    count=$((count + 1))
    if [ "$count" -gt "$timeout" ]; then
      echo "Timeout waiting for sandbox-api port $port" >&2
      exit 1
    fi
  done
}

wait_for_port 8080 30

"$@" &
child_pid="$!"
wait "$child_pid"
