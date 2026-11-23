#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
REGISTRY_URL="${FIXAR_REGISTRY_VALIDATE_URL:-https://api.agrigate.pro/registry/validate}"

bash "${ROOT_DIR}/scripts/package-pack.sh"

PAYLOAD_FILE="${DIST_DIR}/validate-request.json"
RESPONSE_FILE="${DIST_DIR}/registry-validation.json"

node -e '
const fs = require("node:fs");
const packYaml = fs.readFileSync(process.argv[1], "utf8");
const domainYaml = fs.readFileSync(process.argv[2], "utf8");
fs.writeFileSync(
  process.argv[3],
  JSON.stringify({ pack_yaml: packYaml, domain_yaml: domainYaml })
);
' "${ROOT_DIR}/pack.yaml" "${ROOT_DIR}/domains/book-to-film-rpg.yaml" "${PAYLOAD_FILE}"

if [[ "${SKIP_REMOTE_VALIDATE:-0}" == "1" ]]; then
  echo "SKIP_REMOTE_VALIDATE=1 — skipping live ${REGISTRY_URL} check."
  rm -f "${PAYLOAD_FILE}"
  exit 0
fi

curl -fsS -X POST "${REGISTRY_URL}" \
  -H "Content-Type: application/json" \
  --data-binary "@${PAYLOAD_FILE}" > "${RESPONSE_FILE}"
rm -f "${PAYLOAD_FILE}"

node -e '
const fs = require("node:fs");
const res = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (!res.ok) {
  console.error("FixAR /registry/validate rejected manifest:", res.problems || res);
  process.exit(1);
}
console.log("FixAR /registry/validate OK:", res["полное_имя"], "->", res.title);
' "${RESPONSE_FILE}"
