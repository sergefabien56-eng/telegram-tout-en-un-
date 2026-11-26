#!/usr/bin/env bash
# Installer les bibliothèques système de Chromium **sans root**.
#
# `apt-get download` ne demande aucun privilège : on récupère les paquets
# dans un dossier temporaire, on les extrait dans `~/.local/chromium-deps`, et
# on pointe `LD_LIBRARY_PATH` dessus. Rien n'est installé dans le système :
# le sandbox reste intact.
set -euo pipefail

DEPS_DIR="${HOME}/.local/chromium-deps"
WORK_DIR="$(mktemp -d)"
CHROME="${HOME}/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell"

mkdir -p "${DEPS_DIR}"
cd "${WORK_DIR}"

# Paquets covering the missing shared objects (Chromium headless + Playwright).
PACKAGES=(
  libnspr4
  libnss3
  # Debian 13 (trixie) suffixe les paquets « t64 » (transition 64 bits).
  libatk1.0-0t64
  libatk-bridge2.0-0t64
  libatspi2.0-0t64
  libasound2t64
  libcups2t64
  libgtk-3-0t64
  libxdamage1
  libxkbcommon0
  libxcomposite1
  libxfixes3
  libxrandr2
  libxkbcommon-x11-0
  libpango-1.0-0
  libcairo2
  libgbm1
  libdrm2
  libxshmfence1
  libwayland-client0
  libepoxy0
)

echo "→ Téléchargement des paquets…"
for pkg in "${PACKAGES[@]}"; do
  apt-get download "${pkg}" > /dev/null 2>&1 || echo "  (ignoré : ${pkg} indisponible)"
done

echo "→ Extraction dans ${DEPS_DIR}…"
for deb in ./*.deb; do
  [ -e "${deb}" ] || continue
  dpkg-deb -x "${deb}" "${DEPS_DIR}" 2>/dev/null || true
done

rm -rf "${WORK_DIR}"

# Toutes les bibliothèques extraites, dans l'ordre de recherche de l'éditeur.
export LD_LIBRARY_PATH="${DEPS_DIR}/usr/lib/x86_64-linux-gnu:${DEPS_DIR}/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"

echo "→ Bibliothèques encore manquantes :"
if ldd "${CHROME}" 2>/dev/null | grep "not found"; then
  echo "  (liste ci-dessus : il manque encore des paquets)"
  exit 1
fi

echo "  aucune ✓"
echo
echo "Pour utiliser ce Chromium dans un autre shell :"
echo "  export LD_LIBRARY_PATH=\"${DEPS_DIR}/usr/lib/x86_64-linux-gnu:${DEPS_DIR}/lib/x86_64-linux-gnu:\$LD_LIBRARY_PATH\""
