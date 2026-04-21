#!/bin/sh
# Export RESOLVERS for the nginx envsubst templating. The stock
# nginx:alpine image ships /docker-entrypoint.d/15-local-resolvers.envsh
# that does this already, but the entrypoint sources .envsh files inside
# a pipe-subshell — in practice the export does not always reach the
# sibling 20-envsubst-on-templates.sh script, which leaves
# ${NGINX_LOCAL_RESOLVERS} as a literal string in the generated config
# and nginx fails at boot with "host not found in resolver". Seen on
# Railway; reproducible elsewhere.
#
# Setting RESOLVERS here, before chaining to the stock entrypoint,
# sidesteps all the subshell timing and is portable across PaaS,
# docker-compose, and k8s.

set -e

RESOLVERS=$(awk 'BEGIN{ORS=" "} $1=="nameserver" {if ($2 ~ ":") {print "["$2"]"} else {print $2}}' /etc/resolv.conf)
RESOLVERS=${RESOLVERS% }

if [ -z "$RESOLVERS" ]; then
    # Shouldn't happen — Docker, Railway, Fly, k8s all populate resolv.conf —
    # but fall back to public DNS rather than booting a broken nginx.
    RESOLVERS="8.8.8.8 [2001:4860:4860::8888]"
fi

export RESOLVERS

exec /docker-entrypoint.sh "$@"
