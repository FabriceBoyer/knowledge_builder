FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_POCKETBASE_URL=https://pocketbase.knowledge.ovh
ENV VITE_POCKETBASE_URL=$VITE_POCKETBASE_URL
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=20s --timeout=3s --start-period=5s --retries=3 CMD wget -q --spider http://127.0.0.1/ || exit 1
