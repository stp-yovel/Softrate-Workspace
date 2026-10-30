# Standalone PeopleSoft Frontend Build
FROM node:20-bookworm-slim AS hrms-build
WORKDIR "/workspace/apps/peoplespft-multi terent"
COPY ["apps/peoplespft-multi terent/package*.json", "./"]
RUN npm ci --legacy-peer-deps --no-audit --no-fund || npm install --legacy-peer-deps --no-audit --no-fund
COPY ["apps/peoplespft-multi terent/", "./"]
RUN npm run build -- --base-href /

# Nginx Web Server & Reverse Proxy
FROM nginx:1.27-alpine
COPY deploy/docker/peoplesoft/nginx-peoplesoft.conf /etc/nginx/conf.d/default.conf
RUN mkdir -p /usr/share/nginx/html/hrms
COPY --from=hrms-build ["/workspace/apps/peoplespft-multi terent/dist/admin-page/browser/", "/usr/share/nginx/html/"]
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
