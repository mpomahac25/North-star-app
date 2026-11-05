# Using Node.js v24 (LTS) for the app
# Step 1: Install production dependencies (ignore devDependencies)
FROM node:24-bookworm-slim AS dependencies

WORKDIR /app

RUN npm install -g pnpm@12.16.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --prod --frozen-lockfile



# ===============================================
# Step 2: Create runtime image using only the dependencies from step 1
FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOME=/tmp

WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules

COPY . .

RUN chgrp -R 0 /app && chmod -R g=u /app

USER 10001:0

EXPOSE 3004

# Configure periodic liveness check
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3004/api/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
    
# Start microservice
CMD ["node", "paymentService.js"]