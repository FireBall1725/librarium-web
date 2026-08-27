#!/bin/sh
# Mount the app at a path rather than at the root of a host.
#
# A server hosting several apps behind one hostname gives each a path instead of
# a port. Vite's `base` is a build-time setting, so baking the path into the
# bundle would mean one image per deployment; instead the built files carry a
# placeholder and this rewrites them before nginx starts. One image, any path.
#
# Runs from /docker-entrypoint.d, which the nginx image executes in order before
# starting the server. Does nothing at all when LIBRARIUM_BASE_PATH is unset,
# which is the ordinary deployment.
set -eu

RAW="${LIBRARIUM_BASE_PATH:-}"

# Accept librarium, /librarium and /librarium/ as the same thing: an operator
# writing this by hand will eventually write all three.
BASE=$(printf '%s' "$RAW" | tr -d '[:space:]')
case "$BASE" in
  ''|'/') BASE='' ;;
  /*)     BASE="${BASE%/}" ;;
  *)      BASE="/${BASE%/}" ;;
esac
# Trailing slashes can nest: `///` collapses to nothing rather than to `//`,
# which the browser reads as a protocol-relative URL.
while [ "${BASE%/}" != "$BASE" ]; do BASE="${BASE%/}"; done

HTML=/usr/share/nginx/html/index.html

if [ -z "$BASE" ]; then
  # Still substitute, so the placeholder never reaches a browser.
  sed -i 's|%%LIBRARIUM_BASE_PATH%%||g' "$HTML"
  echo "librarium: serving at the root"
  exit 0
fi

echo "librarium: serving at $BASE"

# What the app reads to build request and image URLs.
sed -i "s|%%LIBRARIUM_BASE_PATH%%|${BASE}|g" "$HTML"

# Everything the document points at from the root: the script and stylesheet
# vite emitted, the favicon, the touch icon. One pass over both attributes
# rather than one per kind of asset, because two passes that can both match the
# same tag prefix it twice.
sed -i "s|src=\"/|src=\"${BASE}/|g; s|href=\"/|href=\"${BASE}/|g" "$HTML"

# And the server config that has to answer on that prefix.
cp /etc/nginx/librarium-base-path.conf /etc/nginx/conf.d/default.conf
sed -i "s|__LIBRARIUM_BASE__|${BASE}|g" /etc/nginx/conf.d/default.conf
