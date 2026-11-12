# Build the static site, then serve it with nginx.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_GITLAB_URL
ARG VITE_GITLAB_ROOT_GROUP
ENV VITE_GITLAB_URL=$VITE_GITLAB_URL VITE_GITLAB_ROOT_GROUP=$VITE_GITLAB_ROOT_GROUP
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
