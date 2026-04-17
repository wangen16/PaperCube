FROM node:20-bullseye AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable

WORKDIR /app

COPY frontend/package.json frontend/pnpm-lock.yaml ./
COPY frontend/internal ./internal
COPY frontend/packages ./packages

RUN pnpm install --frozen-lockfile

COPY frontend ./

ENV VITE_GLOB_API_URL=/api
ENV NODE_OPTIONS=--max-old-space-size=2048

RUN pnpm exec vite build --mode production

FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
