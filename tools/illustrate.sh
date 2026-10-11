#!/bin/bash
# Draw the pages of an original book with Codex, four at a time.
# usage: tools/illustrate.sh <work folder> [page numbers...]
# The work folder holds:
#   title.txt     the book's title
#   ref.png       character sheet (see AGENTS.md: make it first)
#   moodboard.png style guide: palette, lettering, layouts, cast, setting
#   pages.tsv     one line per page: NN <tab> scene description <tab> words on the page (' | ' = line break)
# Writes page-NN.png and log-NN.txt; pages that already exist are skipped (delete one to redraw it).
set -uo pipefail
W=$(cd "$1" && pwd); shift
pages=("$@")
[ ${#pages[@]} -eq 0 ] && mapfile -t pages < <(cut -f1 "$W/pages.tsv")
title=$(cat "$W/title.txt")
draw() {
  local n=$1 scene words
  IFS=$'\t' read -r _ scene words < <(grep "^$n	" "$W/pages.tsv")
  [ -s "$W/page-$n.png" ] && { echo "page $n: exists"; return; }
  local prompt="Illustrate one page of the toddler board book '$title'. Follow the attached style guide exactly: ./moodboard.png (palette, lettering, layouts, supporting cast, setting) and ./ref.png (the main characters - keep them identical). 3:2 landscape spread, generous margins, nothing important across the vertical center line.
Scene: $scene
Lettering on the page (render exactly these words, spelled exactly, using the mood board's typography; ' | ' marks a line break, notes in parentheses are styling instructions, not text): $words
Generate the image, check the spelling of every word once, fix it once if needed, then save the final image as ./page-$n.png (at least 1536 px wide) and reply with just the path. Do not keep iterating beyond one fix."
  (cd "$W" && timeout 900 codex exec --skip-git-repo-check -s workspace-write -C "$W" "$prompt" -i ref.png moodboard.png < /dev/null > "log-$n.txt" 2>&1)
  echo "page $n: $([ -s "$W/page-$n.png" ] && echo done || echo "FAILED (see log-$n.txt)")"
}
export -f draw; export W title
printf '%s\n' "${pages[@]}" | xargs -P 4 -I{} bash -c 'draw {}'
