#!/bin/sh
# usage: tools/shot.sh out.png [query]   — screenshots the preview in headless Edge
DIR="$(cd "$(dirname "$0")/.." && pwd -W)"
OUT="$DIR/test/shots/$1"
URL="file:///$DIR/test/harness.html${2:+?$2}"
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
  --hide-scrollbars --window-size=1600,900 --virtual-time-budget=6000 --user-data-dir="$TEMP/ng-edge" \
  --enable-logging=stderr --v=0 --screenshot="$OUT" "$URL" 2>&1 | grep -i -E "console|error|uncaught" | grep -v -i -E "gpu|angle|swiftshader|dbus|sandbox|crashpad|edge_|ssl|fieldtrial|policy|sync" | head -20
