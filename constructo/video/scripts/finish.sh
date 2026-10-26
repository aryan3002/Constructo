#!/usr/bin/env bash
# Loudness-normalise rendered films for upload: -14 LUFS integrated, -1 dBTP
# (YouTube and Instagram both play back around -14). Video is copied untouched.
# usage: scripts/finish.sh [out/films/*.mp4]   → out/final/<name>.mp4
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p out/final
files=("$@")
[ ${#files[@]} -eq 0 ] && files=(out/films/*.mp4)
for f in "${files[@]}"; do
  name=$(basename "$f")
  stats=$(ffmpeg -hide_banner -nostats -i "$f" -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
  get() { echo "$stats" | sed -n "s/.*\"$1\" : \"\([^\"]*\)\".*/\1/p"; }
  ffmpeg -hide_banner -loglevel error -y -i "$f" \
    -af "loudnorm=I=-14:TP=-1:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true" \
    -ar 48000 -c:v copy -c:a aac -b:a 320k -movflags +faststart "out/final/$name"
  echo "$name: $(get input_i) LUFS → $(ffmpeg -nostats -i "out/final/$name" -af ebur128 -f null - 2>&1 | sed -n 's/^ *I: *\(.*\) LUFS/\1/p' | tail -1) LUFS"
done
