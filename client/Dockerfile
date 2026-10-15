# Onyx | Author: differentiatorX <madhur.m2006@gmail.com>
FROM node:20-alpine AS build
LABEL org.opencontainers.image.authors="differentiatorX <madhur.m2006@gmail.com>" \
      org.opencontainers.image.source="https://github.com/differentiatorX/onyx" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
