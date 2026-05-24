#!/usr/bin/env bash
# Phase 32 / J.5 — Upload validation tests
#
# Exercises the live gateway against three cases:
#  1. JPG bytes uploaded with .pdf extension and application/pdf MIME → 400
#     "Uploaded file is not a valid PDF." (magic-byte check rejects)
#  2. PDF larger than UPLOAD_MAX_SIZE_MB → 400 "File too large" (multer
#     limits.fileSize)
#  3. Normal small PDF → 202 (queued for ingestion)
#
# Requires: docker compose stack running (gateway on :4000, mongo, …)
# Run: bash apps/gateway/tests/upload-validation.test.sh
#
# Exits 0 on all-pass, non-zero on any failure.

set -e

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

JWT_SECRET="$(grep ^JWT_SECRET "$ROOT/.env" | cut -d= -f2-)"
USER_ID="$(docker exec synapse-mongodb-1 mongosh synapse --quiet --eval 'print(db.users.findOne()._id.toString())' 2>/dev/null | tail -1)"
SET_ID="$(docker exec synapse-mongodb-1 mongosh synapse --quiet --eval "print(db.studysets.findOne({userId:ObjectId('$USER_ID')})._id.toString())" 2>/dev/null | tail -1)"

if [ -z "$USER_ID" ] || [ -z "$SET_ID" ]; then
  echo "FATAL: could not resolve test user/set (USER_ID='$USER_ID' SET_ID='$SET_ID')"
  exit 2
fi
JWT="$(docker exec -e USER_ID="$USER_ID" -e JWT_SECRET="$JWT_SECRET" synapse-gateway-1 node -e "const j=require('jsonwebtoken'); console.log(j.sign({sub:process.env.USER_ID,email:'x@x.com'}, process.env.JWT_SECRET))")"

# Build test fixtures
printf '\xff\xd8\xff\xe0%s' "JPEG-as-PDF" > "$TMP/bad.pdf"
head -c 500000 /dev/urandom >> "$TMP/bad.pdf"

printf '%%PDF-1.4\n%s' "small" > "$TMP/good.pdf"
head -c 2000000 /dev/urandom >> "$TMP/good.pdf"

printf '%%PDF-1.4\n%s' "oversize" > "$TMP/oversize.pdf"
head -c 53000000 /dev/urandom >> "$TMP/oversize.pdf"

fail=0
run() {
  local label="$1"; local file="$2"; local expect="$3"
  local body
  body="$TMP/out.json"
  local code
  code=$(curl -sS -o "$body" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $JWT" \
    -F "file=@$file;type=application/pdf" -F "studySetId=$SET_ID" \
    http://localhost:4000/api/documents)
  if [ "$code" = "$expect" ]; then
    echo "  ok ($code) $label"
  else
    echo "  FAIL $label expected $expect got $code: $(cat "$body")"
    fail=1
  fi
}

echo "Case 1: JPG renamed .pdf must 400"
run "JPG-as-PDF" "$TMP/bad.pdf" 400

echo "Case 3: valid small PDF must 202"
run "valid-pdf" "$TMP/good.pdf" 202

echo "Case 2: oversize PDF must 400 (>${UPLOAD_MAX_SIZE_MB:-50}MB)"
run "oversize-pdf" "$TMP/oversize.pdf" 400

exit $fail
