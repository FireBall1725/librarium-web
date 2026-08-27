# Pinned to the BUILD platform. This stage emits static assets, which are
# architecture-independent, so there is no reason to run npm under QEMU for
# the arm64 leg.
FROM --platform=$BUILDPLATFORM node:26-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# VERSION is what the shared release workflow passes, in every repo. vite reads
# it under the app's own name, so the arg is standard and the env var stays
# what the code expects.
ARG VERSION=""
ENV LIBRARIUM_VERSION=$VERSION
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# Both configs ship. The entrypoint picks one: the default serves at the root,
# and LIBRARIUM_BASE_PATH swaps in the other so several apps can share a
# hostname without each needing its own port.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx.base-path.conf /etc/nginx/librarium-base-path.conf
COPY docker/30-librarium-base-path.sh /docker-entrypoint.d/30-librarium-base-path.sh
RUN chmod +x /docker-entrypoint.d/30-librarium-base-path.sh
ENV LIBRARIUM_BASE_PATH=""
EXPOSE 3000
