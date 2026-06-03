#!/usr/bin/env bash
# Login smoke test — verifies every role can authenticate and reach its landing
# data, hitting the SAME backend base URL the mobile app uses. Run this whenever
# "login is broken" to localize the fault to config / backend / seed in seconds.
#
# What it checks, in order:
#   0) The mobile .env points at the backend PORT (8000), not Metro (8081).
#   1) Backend is up and reachable at $BASE.
#   2) Each contractor/staff role: phone+OTP login -> /auth/me -> a landing call.
#   3) Homeowner: join-code redeem -> /home, /photos, /updates, /capabilities.
#
# Prereqs (from constructo/):
#   docker compose up -d
#   cd backend && uv run alembic upgrade head
#   cd backend && uv run python -m scripts.seed_demo        # creates the roles + SUNRISE-HOME
#   cd backend && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
#
# Usage:
#   bash scripts/smoke_login.sh                 # tests http://localhost:8000
#   BASE=http://192.168.4.21:8000 bash scripts/smoke_login.sh   # test the LAN IP a phone uses
set -uo pipefail

BASE="${BASE:-http://localhost:8000}"
OTP="000000"
JOIN_CODE="${JOIN_CODE:-SUNRISE-HOME}"   # seeded homeowner code (override to test a real one)
HO_PHONE="+9198000$(printf '%05d' $((RANDOM % 100000)))"

PASS=0; FAIL=0
green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
ok()   { green "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { red   "  ❌ $1"; FAIL=$((FAIL+1)); }
jget() { python3 -c "import sys,json
try: d=json.load(sys.stdin); print(eval('d'+sys.argv[1]))
except Exception: print('')" "$1" 2>/dev/null; }

echo "▶ Testing backend at: $BASE"
echo "  (the mobile app must point EXPO_PUBLIC_API_BASE at this exact host:port)"

# --- 0) Mobile .env sanity (the bug that bit us: port 8081 = Metro, not API) ---
ENV_FILE="$(dirname "$0")/../../mobile/.env"
echo; echo "0) Mobile .env check ......................................................"
if [ -f "$ENV_FILE" ]; then
  ENV_BASE=$(grep -E '^EXPO_PUBLIC_API_BASE=' "$ENV_FILE" | cut -d= -f2-)
  echo "  .env -> $ENV_BASE"
  if echo "$ENV_BASE" | grep -q ':8081'; then
    bad ".env points at :8081 (that's the Expo Metro bundler, NOT the backend). Use :8000."
  elif echo "$ENV_BASE" | grep -q ':8000'; then
    ok ".env points at the backend port (:8000)."
  else
    echo "  ⚠️  .env port is unusual — make sure it matches the backend ($BASE)."
  fi
else
  echo "  ⚠️  no mobile/.env found (app will fall back to http://10.0.2.2:8000)."
fi

# --- 1) Backend reachable ---------------------------------------------------
echo; echo "1) Backend reachable ....................................................."
RESP=$(curl -s -m 5 -X POST "$BASE/api/v1/auth/request-otp" -H 'Content-Type: application/json' -d '{"phone":"+910000000000"}')
if echo "$RESP" | grep -q '"sent"'; then ok "request-otp responded ($RESP)"; else bad "no/!bad response: $RESP"; echo "  (is uvicorn running on this host:port? is the device on the same Wi-Fi?)"; fi

# --- 2) Contractor / staff roles -------------------------------------------
# phone -> expected role (from scripts/seed_demo.py). Login auto-creates an
# 'owner' for any UNKNOWN phone, so a wrong role here means the seed is missing.
echo; echo "2) Contractor / staff logins ............................................."
test_staff() {
  local phone="$1" want="$2" probe="$3" label="$4"
  local tok role
  tok=$(curl -s -m 5 -X POST "$BASE/api/v1/auth/login" -H 'Content-Type: application/json' \
        -d "{\"phone\":\"$phone\",\"otp\":\"$OTP\"}" | jget "['token']")
  if [ -z "$tok" ]; then bad "$label ($phone): login returned no token"; return; fi
  role=$(curl -s -m 5 "$BASE/api/v1/auth/me" -H "Authorization: Bearer $tok" | jget "['role']")
  if [ "$role" = "$want" ]; then ok "$label: login + /me -> role=$role"
  else bad "$label: expected role=$want but got '$role' (run seed_demo? — login mints 'owner' for unknown phones)"; fi
  # landing data probe (best-effort; 200/empty is fine, a hard error is not)
  if [ -n "$probe" ]; then
    local code
    code=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "$BASE$probe" -H "Authorization: Bearer $tok")
    if [ "$code" = "200" ] || [ "$code" = "204" ]; then ok "   landing $probe -> $code"
    else echo "   ⚠️  landing $probe -> $code (check this role's home screen data)"; fi
  fi
}
test_staff "+919800000001" "owner"            "/api/v1/dashboard/home"        "Owner"
test_staff "+919800000002" "pm"               "/api/v1/dashboard/home"        "PM"
test_staff "+919800000003" "supervisor"       ""                              "Supervisor"
test_staff "+919800000004" "accountant"       ""                              "Accountant"
test_staff "+919800000005" "procurement"      ""                              "Procurement"
test_staff "+919800000006" "labor_contractor" ""                              "Mukadam (labor)"

# --- 3) Homeowner join ------------------------------------------------------
echo; echo "3) Homeowner join ($JOIN_CODE) ..........................................."
JOIN=$(curl -s -m 5 -X POST "$BASE/api/v1/homeowner/join" -H 'Content-Type: application/json' \
       -d "{\"join_code\":\"$JOIN_CODE\",\"phone\":\"$HO_PHONE\",\"otp\":\"$OTP\"}")
HTOK=$(echo "$JOIN" | jget "['token']")
SITE=$(echo "$JOIN" | jget "['site_id']")
if [ -n "$HTOK" ]; then
  ok "join -> $(echo "$JOIN" | jget "['display_name']") / $(echo "$JOIN" | jget "['company_name']") (sub_role=$(echo "$JOIN" | jget "['sub_role']"))"
  for ep in home photos updates me/capabilities; do
    code=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "$BASE/api/v1/homeowner/$ep?site_id=$SITE" -H "Authorization: Bearer $HTOK")
    if [ "$code" = "200" ]; then ok "   /homeowner/$ep -> 200"; else echo "   ⚠️  /homeowner/$ep -> $code"; fi
  done
else
  bad "join failed: $JOIN"
  echo "  (run seed_demo for SUNRISE-HOME, or pass a real code: JOIN_CODE=xxxx bash $0)"
fi

# --- Summary ----------------------------------------------------------------
echo; echo "──────────────────────────────────────────"
if [ "$FAIL" -eq 0 ]; then green "ALL GOOD — $PASS checks passed. The app should log in cleanly."
else red "$FAIL check(s) FAILED, $PASS passed. See ❌ lines above."; fi
echo "Reminder: after editing mobile/.env, restart Expo with cache clear:  npx expo start -c"
exit $FAIL
