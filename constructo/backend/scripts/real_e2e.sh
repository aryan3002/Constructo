#!/usr/bin/env bash
# Real end-to-end test — NO seed data. Bootstraps a fresh company → site →
# property → publishes a photo + updates + weekly summary where the CAPTION and
# SUMMARY are written live by your Azure gpt-4o-mini → mints a homeowner join
# code → logs in as the homeowner → prints what she actually sees.
#
# Prereqs (in three terminals from constructo/):
#   1)  docker compose up -d                      # Postgres + Redis
#   2)  cd backend && uv run alembic upgrade head
#   3)  cd backend && EXTRACTION_SYNC=true uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
# Then:  cd backend && bash scripts/real_e2e.sh
set -euo pipefail

BASE="${BASE:-http://localhost:8000}"
OTP="000000"
OWNER_PHONE="+9199000$(printf '%05d' $((RANDOM % 100000)))"
HO_PHONE="+9198000$(printf '%05d' $((RANDOM % 100000)))"
TAG="run$RANDOM"

jget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1"; }
hdr_owner() { echo "Authorization: Bearer $OWNER_TOKEN"; }

echo "▶ BASE=$BASE   owner=$OWNER_PHONE   homeowner=$HO_PHONE"

echo; echo "1) OWNER LOGIN (auto-creates company + owner) ............................"
OWNER_TOKEN=$(curl -s -X POST "$BASE/api/v1/auth/login" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$OWNER_PHONE\",\"otp\":\"$OTP\"}" | jget "['token']")
echo "   owner token: ${OWNER_TOKEN:0:18}…"

echo; echo "2) CREATE SITE ..........................................................."
SITE_ID=$(curl -s -X POST "$BASE/api/v1/sites" -H "$(hdr_owner)" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Sharma Villa $TAG\",\"type\":\"villa\",\"location\":\"Whitefield\"}" | jget "['id']")
echo "   site_id: $SITE_ID"

echo; echo "3) CREATE PROPERTY (gives the Home time-bar real dates) .................."
curl -s -X POST "$BASE/api/v1/publish/property" -H "$(hdr_owner)" -H 'Content-Type: application/json' \
  -d "{\"site_id\":\"$SITE_ID\",\"display_name\":\"4BHK Villa, Whitefield\",\"type\":\"villa\",\"status\":\"on_track\",\"started_on\":\"2026-01-14\",\"expected_handover_on\":\"2026-11-30\"}" >/dev/null
echo "   property created (started 14 Jan → handover 30 Nov)"

echo; echo "4) CREATE MILESTONES (now + next) ........................................"
curl -s -X POST "$BASE/api/v1/publish/milestones" -H "$(hdr_owner)" -H 'Content-Type: application/json' \
  -d "{\"site_id\":\"$SITE_ID\",\"name\":\"Flooring & Tiling\",\"status\":\"now\",\"started_on\":\"2026-05-20\",\"expected_on\":\"2026-06-10\",\"order\":6}" >/dev/null
curl -s -X POST "$BASE/api/v1/publish/milestones" -H "$(hdr_owner)" -H 'Content-Type: application/json' \
  -d "{\"site_id\":\"$SITE_ID\",\"name\":\"Painting & Wall Finish\",\"status\":\"upcoming\",\"expected_on\":\"2026-06-12\",\"order\":7}" >/dev/null
echo "   milestones: Flooring (now) · Painting (next)"

echo; echo "5) PUBLISH PHOTO — caption OMITTED → REAL gpt-4o-mini writes it 🤖 ........"
PHOTO_JSON=$(curl -s -X POST "$BASE/api/v1/publish/photo" -H "$(hdr_owner)" -H 'Content-Type: application/json' \
  -d "{\"site_id\":\"$SITE_ID\",\"image_url\":\"https://images.unsplash.com/photo-1581094794329-c8112a89af12\",\"room_tag\":\"Kitchen\",\"event_summary\":\"kitchen floor tiling row 2 in progress, 60 percent done\"}")
echo "   AI caption → $(echo "$PHOTO_JSON" | jget "['caption']")"

echo; echo "6) PUBLISH UPDATES (titles feed the weekly summary) ......................"
for t in "Master bedroom flooring completed (Italian marble)" "Kitchen floor tiling 60% done" "Bathroom waterproofing passed water test"; do
  curl -s -X POST "$BASE/api/v1/publish/update" -H "$(hdr_owner)" -H 'Content-Type: application/json' \
    -d "{\"site_id\":\"$SITE_ID\",\"type\":\"progress\",\"title\":\"$t\"}" >/dev/null
done
echo "   3 updates published"

echo; echo "7) PUBLISH WEEKLY SUMMARY — text OMITTED → REAL gpt-4o-mini drafts it 🤖 .."
WK_JSON=$(curl -s -X POST "$BASE/api/v1/publish/weekly-summary" -H "$(hdr_owner)" -H 'Content-Type: application/json' \
  -d "{\"site_id\":\"$SITE_ID\",\"week_start\":\"2026-05-25\"}")
echo "   AI weekly summary → $(echo "$WK_JSON" | jget "['text']")"

echo; echo "8) MINT HOMEOWNER JOIN CODE .............................................."
JOIN_CODE=$(curl -s -X POST "$BASE/api/v1/homeowner/members" -H "$(hdr_owner)" -H 'Content-Type: application/json' \
  -d "{\"site_id\":\"$SITE_ID\",\"sub_role\":\"primary_owner\",\"phone\":\"$HO_PHONE\"}" | jget "['join_code']")
echo "   JOIN CODE → $JOIN_CODE   (use this in the mobile app!)"

echo; echo "9) HOMEOWNER JOINS (join code + phone + OTP) ............................."
HO_TOKEN=$(curl -s -X POST "$BASE/api/v1/homeowner/join" -H 'Content-Type: application/json' \
  -d "{\"join_code\":\"$JOIN_CODE\",\"phone\":\"$HO_PHONE\",\"otp\":\"$OTP\"}" | jget "['token']")
echo "   homeowner token: ${HO_TOKEN:0:18}…"

echo; echo "════════════ WHAT THE HOMEOWNER ACTUALLY SEES (real data) ════════════"
echo "── Home ──"
curl -s "$BASE/api/v1/homeowner/home" -H "Authorization: Bearer $HO_TOKEN" | python3 -m json.tool
echo "── Photos (note the AI caption) ──"
curl -s "$BASE/api/v1/homeowner/photos" -H "Authorization: Bearer $HO_TOKEN" | python3 -m json.tool
echo "── Weekly summary (AI-drafted) ──"
curl -s "$BASE/api/v1/homeowner/weekly-summary" -H "Authorization: Bearer $HO_TOKEN" | python3 -m json.tool

echo; echo "✅ Done. To continue on a real device: open the Expo app, choose \"I have a join code\","
echo "   enter  $JOIN_CODE  + any phone + OTP 000000, and you'll see exactly this — with the AI caption + summary your Azure account just generated."
