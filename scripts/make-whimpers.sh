#!/bin/sh
# Generates placeholder hit-reaction clips into sounds/whimpers/ using macOS's
# built-in voices. The clips are gitignored: Apple's voice license covers
# personal use, not redistribution. Replace them with your own recordings
# any time (see sounds/whimpers/README.md).
set -e

if ! command -v say >/dev/null 2>&1; then
  echo "make-whimpers: needs macOS's 'say' command" >&2
  exit 1
fi

OUT="$(cd "$(dirname "$0")/.." && pwd)/sounds/whimpers"
mkdir -p "$OUT"

# clip <file name> <voice> <text>; text may use [[rate N]] / [[pbas N]] etc.
clip() {
  if say -v '?' | grep -q "^$2 "; then
    say -v "$2" -o "$OUT/$1.m4a" --file-format=m4af --data-format=aac "$3"
    echo "  $1.m4a  ($2)"
  else
    echo "  skipped $1 (voice '$2' not installed)"
  fi
}

echo "Writing clips to $OUT"

# 1-: whimpers
clip 1-ow-quiet   Whisper "[[rate 170]] ow..."
clip 1-please     Whisper "[[rate 190]] please... not again..."
clip 1-why        Whisper "[[rate 190]] why..."

# 2-: yelps
clip 2-hey        Fred    "[[rate 260]] [[pbas 60]] OW! Hey!"
clip 2-ouch       Junior  "[[rate 280]] [[pbas 70]] Ouch! OUCH!"
clip 2-rude       Ralph   "[[rate 250]] OW! Rude!"

# 3-: screams
clip 3-scream     Junior  "[[rate 340]] [[pbas 85]] AAAAAAAAAH!"
clip 3-mercy      Albert  "[[rate 320]] AAAH! OKAY OKAY, I'LL GO FASTER!"
clip 3-robot      Zarvox  "[[rate 300]] AAAAAAH! MERCY!"

echo "Done. Clips are picked up without restarting Wrangler."
