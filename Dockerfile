FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# nginx:alpine auto-envsubsts any *.template in /etc/nginx/templates/ on
# boot. API_UPSTREAM defaults to the docker-compose service name, so the
# existing full-stack compose deployment works unchanged; PaaS users
# (Railway, Fly, etc.) override it to point at their api service's
# internal DNS name.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV API_UPSTREAM=librarium-api
ENV API_UPSTREAM_PORT=8080
EXPOSE 3000
