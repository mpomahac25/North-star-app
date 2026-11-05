# Using Node.js v24 (LTS) for the app
# Step 1: Install dependencies for building the app
FROM node:24-bookworm-slim AS build

WORKDIR /app

RUN npm install -g pnpm@12.16.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Run pnpm install inside the container to get build dependencies (--frozen-lockfile used to prevent silent updates to library versions potentially breaking the system after CI/CD clears it)
RUN pnpm install --frozen-lockfile

COPY . .

# Builds the frontend into /app/dist
RUN pnpm build



# ===============================================
# Step 2: Install only dependencies required by production server (skips testing frameworks/libraries)
FROM node:24-bookworm-slim AS production-dependencies

WORKDIR /app

RUN npm install -g pnpm@12.16.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install only dependencies which are needed for production; ignores devDependencies from pnpm-lock.yaml
RUN pnpm install --prod --frozen-lockfile



# ===============================================
# Step 3: Assemble full image
FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOME=/tmp

WORKDIR /app

# Copy production-dependencies step
COPY --from=production-dependencies /app/node_modules ./node_modules

# Copy compiled frontend and express app files from build step
COPY --from=build /app/dist ./dist
COPY --from=build /app/app.js /app/server.js /app/package.json /app/VERSION ./

RUN chgrp -R 0 /app && chmod -R g=u /app

USER 10001:0

EXPOSE 3000

# Configure periodic liveness check
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Start the Express server
CMD ["node", "server.js"]