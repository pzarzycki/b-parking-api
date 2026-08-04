#!/usr/bin/env bash
set -euo pipefail

if [[ "${RUN_INTEGRATION_TESTS:-}" != "1" ]]; then
  echo 'Set RUN_INTEGRATION_TESTS=1 to run live integration tests.' >&2
  exit 2
fi

project='parking-api-integration'
api_port=3101
postgres_port=54331
cleanup() { API_PORT="$api_port" POSTGRES_PORT="$postgres_port" docker compose -p "$project" down --volumes --remove-orphans; }
trap cleanup EXIT

API_PORT="$api_port" POSTGRES_PORT="$postgres_port" docker compose -p "$project" up --build -d api
for _ in {1..30}; do
  if curl -fsS "http://localhost:$api_port/api/garage/floor-plan" >/dev/null; then break; fi
  sleep 1
done
curl -fsS "http://localhost:$api_port/api/garage/floor-plan" >/dev/null

login=$(curl -fsS -X POST "http://localhost:$api_port/api/auth/login" -H 'content-type: application/json' --data '{"username":"admin","password":"admin"}')
token=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).token)' "$login")
spots=$(curl -fsS "http://localhost:$api_port/api/parking-spots" -H "authorization: Bearer $token")
spot=$(node -e 'console.log(JSON.parse(process.argv[1])[0].id)' "$spots")
checked_in=$(curl -fsS -X POST "http://localhost:$api_port/api/parking-sessions/check-in" -H "authorization: Bearer $token" -H 'content-type: application/json' --data "{\"licensePlate\":\"INTEGRATION-1\",\"spotId\":\"$spot\"}")
session=$(node -e 'console.log(JSON.parse(process.argv[1]).id)' "$checked_in")
curl -fsS -X POST "http://localhost:$api_port/api/parking-sessions/check-out" -H "authorization: Bearer $token" -H 'content-type: application/json' --data "{\"sessionId\":\"$session\"}" >/dev/null
history=$(curl -fsS "http://localhost:$api_port/api/parking-sessions?licensePlate=INTEGRATION-1" -H "authorization: Bearer $token")
node -e 'const value=JSON.parse(process.argv[1]); if(value.total!==1 || !value.items[0].checkedOutAt) process.exit(1)' "$history"
echo 'Integration test passed: seed, login, list spots, check-in, check-out, and history.'
