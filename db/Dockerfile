# Use PostgreSQL 17 as the base image
FROM postgres:17-bookworm

# Install support for dynamically assigned user IDs
RUN apt-get update && \
    apt-get install -y --no-install-recommends libnss-wrapper && \
    rm -rf /var/lib/apt/lists/*

# Store database files in a subdirectory of the mounted persistent volume
ENV PGDATA=/var/lib/postgresql/data/pgdata

# Prepare application directories for non-root execution
RUN mkdir -p /var/lib/postgresql/data /var/run/postgresql && \
    chgrp -R 0 /var/lib/postgresql && \
    chmod -R g=u /var/lib/postgresql && \
    chmod 3777 /var/run/postgresql

# Use a non-root user by default
# Rahti can override this UID with its own assigned UID
USER 10001:0

EXPOSE 5432