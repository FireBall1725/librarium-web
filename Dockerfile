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
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
