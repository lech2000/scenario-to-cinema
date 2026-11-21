#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
VERSION="$(grep -E '^  version:' "${ROOT_DIR}/pack.yaml" | awk '{print $2}' | tr -d '"')"
NAME="$(grep -E '^  name:' "${ROOT_DIR}/pack.yaml" | awk '{print $2}' | tr -d '"')"
OUT_TAR="${DIST_DIR}/${NAME}-${VERSION}.tar.gz"

mkdir -p "${DIST_DIR}"

tar -czf "${OUT_TAR}" \
  -C "${ROOT_DIR}" \
  pack.yaml \
  domains \
  tests \
  evals

SHA256="$(shasum -a 256 "${OUT_TAR}" | awk '{print $1}')"
echo "${SHA256}  $(basename "${OUT_TAR}")" > "${OUT_TAR}.sha256"

echo "Built:  ${OUT_TAR}"
echo "SHA256: ${SHA256}"
