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
curl -fsS "http://localhost:$api_port/api/docs" >/dev/null
curl -fsS "http://localhost:$api_port/openapi.yaml" >/dev/null

login=$(curl -fsS -X POST "http://localhost:$api_port/api/auth/login" -H 'content-type: application/json' --data '{"username":"admin","password":"admin"}')
token=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).token)' "$login")
spots=$(curl -fsS "http://localhost:$api_port/api/parking-spots" -H "authorization: Bearer $token")
spot=$(node -e 'console.log(JSON.parse(process.argv[1]).items[0].id)' "$spots")
bay=$(node -e 'console.log(JSON.parse(process.argv[1]).items[0].bayId)' "$spots")
checked_in=$(curl -fsS -X POST "http://localhost:$api_port/api/parking-sessions/check-in" -H "authorization: Bearer $token" -H 'content-type: application/json' --data "{\"licensePlate\":\"INTEGRATION-1\",\"spotId\":\"$spot\"}")
session=$(node -e 'console.log(JSON.parse(process.argv[1]).id)' "$checked_in")
curl -fsS -X POST "http://localhost:$api_port/api/parking-sessions/check-out" -H "authorization: Bearer $token" -H 'content-type: application/json' --data "{\"sessionId\":\"$session\"}" >/dev/null
curl -fsS -X PATCH "http://localhost:$api_port/api/parking-spots/$spot" -H "authorization: Bearer $token" -H 'content-type: application/json' --data '{"status":"occupied","reason":"maintenance"}' >/dev/null
curl -fsS -X PATCH "http://localhost:$api_port/api/parking-spots/$spot" -H "authorization: Bearer $token" -H 'content-type: application/json' --data '{"status":"available"}' >/dev/null
API_URL="http://localhost:$api_port" npx tsx scripts/assert-events.ts
curl -fsS -X POST "http://localhost:$api_port/api/users" -H "authorization: Bearer $token" -H 'content-type: application/json' --data '{"username":"integration-attendant","password":"password123","role":"attendant"}' >/dev/null
audit=$(curl -fsS "http://localhost:$api_port/api/audit-events" -H "authorization: Bearer $token")
node -e 'if(JSON.parse(process.argv[1]).total < 4) process.exit(1)' "$audit"
history=$(curl -fsS "http://localhost:$api_port/api/parking-sessions?licensePlate=INTEGRATION-1" -H "authorization: Bearer $token")
node -e 'const value=JSON.parse(process.argv[1]); if(value.total!==1 || !value.items[0].checkedOutAt) process.exit(1)' "$history"
history_from=$(node -e 'process.stdout.write(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())')
history_to=$(node -e 'process.stdout.write(new Date(Date.now() + 60 * 60 * 1000).toISOString())')
asset_history=$(curl -fsS --get "http://localhost:$api_port/api/history/occupancy" -H "authorization: Bearer $token" --data-urlencode "bayId=$bay" --data-urlencode "from=$history_from" --data-urlencode "to=$history_to")
node -e 'const value=JSON.parse(process.argv[1]); if(value.asset.type!=="bay" || value.summary.checkIns!==1 || value.summary.checkOuts!==1 || value.summary.manualHolds<1 || value.summary.manualReleases<1 || !value.points.length) process.exit(1)' "$asset_history"
attendant_login=$(curl -fsS -X POST "http://localhost:$api_port/api/auth/login" -H 'content-type: application/json' --data '{"username":"integration-attendant","password":"password123"}')
attendant_token=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).token)' "$attendant_login")
curl -fsS --get "http://localhost:$api_port/api/history/occupancy" -H "authorization: Bearer $attendant_token" --data-urlencode "bayId=$bay" --data-urlencode "from=$history_from" --data-urlencode "to=$history_to" >/dev/null
raw_history_status=$(curl -sS -o /dev/null -w '%{http_code}' "http://localhost:$api_port/api/parking-sessions" -H "authorization: Bearer $attendant_token")
test "$raw_history_status" = '403'
invalid_history_status=$(curl -sS -o /dev/null -w '%{http_code}' --get "http://localhost:$api_port/api/history/occupancy" -H "authorization: Bearer $token" --data-urlencode "bayId=$bay" --data-urlencode "from=$history_to" --data-urlencode "to=$history_from")
test "$invalid_history_status" = '422'
layout=$(node -e 'console.log(JSON.stringify({yaml:require("fs").readFileSync("examples/garage-layout.yml", "utf8")}))')
invalid_layout=$(node -e 'const yaml=require("fs").readFileSync("examples/garage-layout.yml", "utf8").replace("connectsTo: ground-main", "connectsTo: missing-route"); console.log(JSON.stringify({yaml}))')
invalid_status=$(curl -sS -o /dev/null -w '%{http_code}' -X PUT "http://localhost:$api_port/api/garage/floor-plan" -H "authorization: Bearer $token" -H 'content-type: application/json' --data "$invalid_layout")
test "$invalid_status" = '422'
curl -fsS -X PUT "http://localhost:$api_port/api/garage/floor-plan" -H "authorization: Bearer $token" -H 'content-type: application/json' --data "$layout" >/dev/null
reset_history=$(curl -fsS "http://localhost:$api_port/api/parking-sessions" -H "authorization: Bearer $token")
node -e 'if(JSON.parse(process.argv[1]).total !== 0) process.exit(1)' "$reset_history"
echo 'Integration test passed: seed, login, live events, spot/session workflows, history, and layout reset.'
