#!/usr/bin/env bash
# Screenshots for a UX audit: the production build in viewer mode, as readers see it, at each
# audit width in light and dark, for the start view and two records. Interactive states
# (drawer, popovers, hover cards) need the browser tools instead; see SKILL.md.
#
# Usage: .claude/skills/ux-audit/capture.sh [out-dir]   (default: $CLAUDE_JOB_DIR/tmp/ux or /tmp/ux-audit)
# Set SKIP_BUILD=1 to reuse an existing dist/.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
OUT="${1:-${CLAUDE_JOB_DIR:+$CLAUDE_JOB_DIR/tmp/ux}}"
OUT="${OUT:-/tmp/ux-audit}"
mkdir -p "$OUT"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT=5191

[ "${SKIP_BUILD:-}" = 1 ] || npm run build >/dev/null

# vite preview serves dist; records open from #<id> links, which the app moves to /<id>
npx vite preview --port "$PORT" --strictPort >/dev/null 2>&1 &
PREVIEW=$!
trap 'kill $PREVIEW 2>/dev/null' EXIT
for _ in $(seq 1 30); do curl -s -o /dev/null "http://localhost:$PORT/" && break; sleep 0.5; done

STATES=("start|/" "eyrie|/#the-eyrie-vineyards" "temperance|/#temperance-hill-vineyard")
WIDTHS=(1512 1024 820 393 360)
count=0
for state in "${STATES[@]}"; do
  name="${state%%|*}"; path="${state#*|}"
  for width in "${WIDTHS[@]}"; do
    height=$([ "$width" -le 600 ] && echo 844 || echo 900)
    for scheme in light dark; do
      flag=$([ "$scheme" = dark ] && echo 0 || echo 1)
      shot="$OUT/$name-$width-$scheme.png"
      url="http://localhost:$PORT$path"
      window=$width
      # Headless Chrome won't lay a page out narrower than 500px, whatever the window size,
      # so phone widths go in a frame of the exact width, centred in a 520px window and cropped
      if [ "$width" -lt 500 ]; then
        frame="$OUT/.frame-$width.html"
        # Centred, as sips crops from the centre
        printf '<!doctype html><body style="margin:0;display:flex;justify-content:center"><iframe src="%s" style="border:0;display:block;flex:none;width:%spx;height:%spx"></iframe>' \
          "$url" "$width" "$height" > "$frame"
        url="file://$frame"; window=520
      fi
      "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
        --window-size="$window,$height" --blink-settings=preferredColorScheme=$flag \
        --virtual-time-budget=9000 --user-data-dir="$OUT/.profile-$scheme" \
        --screenshot="$shot" "$url" 2>/dev/null
      [ "$window" = "$width" ] || sips -c $((height * 2)) $((width * 2)) "$shot" >/dev/null
      count=$((count + 1))
    done
  done
done
rm -rf "$OUT"/.profile-* "$OUT"/.frame-*.html
echo "$count screenshots in $OUT"
