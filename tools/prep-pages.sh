#!/bin/bash
# Turn a book scan into the page images a book folder needs.
# usage: tools/prep-pages.sh <scan.pdf | folder of photos> <book folder>
#   PDF: one embedded image per page (phone "scan to PDF" output) is extracted as-is.
#   Folder: photos are taken in file-name order (name them so they sort: 01.jpg, 02.jpg, ...).
# Writes <book folder>/page-00.jpg, page-01.jpg, ... (EXIF-rotated, at most 1600 px, metadata stripped).
set -euo pipefail
src=$1 out=$2
mkdir -p "$out"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
if [ -f "$src" ]; then
  pdfimages -all "$src" "$tmp/p"
else
  i=0
  for f in "$src"/*; do
    case "${f,,}" in *.jpg|*.jpeg|*.png|*.heic|*.webp) cp "$f" "$tmp/p-$(printf '%04d' $i).${f##*.}"; i=$((i+1));; esac
  done
fi
i=0
for f in "$tmp"/p-*; do
  magick "$f" -auto-orient -resize '1600x1600>' -strip -quality 84 "$out/page-$(printf '%02d' $i).jpg"
  i=$((i+1))
done
echo "$i pages -> $out"
