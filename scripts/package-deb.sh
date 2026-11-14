#!/usr/bin/env bash
set -euo pipefail

# Használat: scripts/package-deb.sh <binary_path> <output_deb_path> [version]
BIN_PATH="${1:-dist/ipad-audit-reader}"
OUTPUT_DEB="${2:-out/ipad-audit-reader-linux-x86_64.deb}"
RAW_VERSION="${3:-1.0.0}"
VERSION="${RAW_VERSION#v}"
case "$VERSION" in
    [0-9]*) ;;
    *) VERSION="1.0.0" ;;
esac

if [ ! -f "$BIN_PATH" ]; then
    echo "Hiba: A binaris nem talalhato: $BIN_PATH" >&2
    exit 1
fi

TMP_DIR="/tmp/ipad-audit-deb-build-$$"
mkdir -p "$TMP_DIR"
trap 'rm -rf "$TMP_DIR"' EXIT

PKG_DIR="$TMP_DIR/pkg"
mkdir -p "$PKG_DIR/DEBIAN"
mkdir -p "$PKG_DIR/usr/bin"
mkdir -p "$PKG_DIR/usr/share/applications"
mkdir -p "$PKG_DIR/usr/share/icons/hicolor/scalable/apps"

# Masoljuk a binarist
cp "$BIN_PATH" "$PKG_DIR/usr/bin/ipad-audit-reader"
chmod 755 "$PKG_DIR/usr/bin/ipad-audit-reader"

# Letrehozzuk a DEBIAN/control fajlt
cat <<EOF > "$PKG_DIR/DEBIAN/control"
Package: ipad-audit-reader
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: amd64
Maintainer: Krisztian Kovacs <krisztian.kovacs@users.noreply.github.com>
Description: iPad and Mac condition check USB reader
 Hardware audit tool for used iPads, iPhones and Macs. Reads battery
 cycles, capacity, serial and activation lock via USB.
EOF

# Letrehozzuk a .desktop fajlt
cat <<EOF > "$PKG_DIR/usr/share/applications/ipad-audit-reader.desktop"
[Desktop Entry]
Version=1.0
Type=Application
Name=iPad Audit
GenericName=iPad es iPhone allapot-ellenorzo
Comment=Apple eszkozok USB-s allapot-ellenorzoje
Exec=ipad-audit-reader
Icon=ipad-audit
Terminal=true
Categories=Utility;System;
Keywords=apple;ipad;iphone;battery;audit;
EOF

# SVG ikon letrehozasa
cat <<'EOF' > "$PKG_DIR/usr/share/icons/hicolor/scalable/apps/ipad-audit.svg"
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <rect x="16" y="8" width="96" height="112" rx="14" fill="#1c1c1e" stroke="#3a3a3c" stroke-width="4"/>
  <rect x="24" y="18" width="80" height="92" rx="6" fill="#007aff"/>
  <circle cx="64" cy="114" r="3" fill="#8e8e93"/>
  <path d="M44 64 L58 78 L84 50" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
EOF

mkdir -p "$(dirname "$OUTPUT_DEB")"
dpkg-deb --build --root-owner-group "$PKG_DIR" "$OUTPUT_DEB"
echo "Kesz .deb csomag: $OUTPUT_DEB"
