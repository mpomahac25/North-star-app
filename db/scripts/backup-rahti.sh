#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${RAHTI_NAMESPACE:?RAHTI_NAMESPACE is required}"
: "${ALLAS_BACKUP_BUCKET:?ALLAS_BACKUP_BUCKET is required}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID is required}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"

if [[ "$RAHTI_NAMESPACE" != 'rio-theaters-dev' ]]; then
    echo 'Unexpected Rahti namespace' >&2
    exit 1
fi

if [[ ! "$ALLAS_BACKUP_BUCKET" =~ ^[a-z0-9][a-z0-9.-]{2,62}$ ]]; then
    echo 'Invalid Allas bucket name' >&2
    exit 1
fi

for tool in oc aws gpg sha256sum cmp; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "Missing required command: $tool" >&2
        exit 1
    fi
done

workdir=$(mktemp -d)
pod=''
remote_file=''

cleanup() {
    if [[ -n "$pod" && -n "$remote_file" ]]; then
        oc -n "$RAHTI_NAMESPACE" exec "$pod" \
            -- rm -f "$remote_file" >/dev/null 2>&1 || true
    fi

    rm -rf "$workdir"
}

trap cleanup EXIT

pod=$(oc -n "$RAHTI_NAMESPACE" get pods \
    -l app=postgres \
    -o jsonpath='{.items[0].metadata.name}')

if [[ -z "$pod" ]]; then
    echo 'PostgreSQL pod not found' >&2
    exit 1
fi

oc -n "$RAHTI_NAMESPACE" wait \
    --for=condition=Ready \
    "pod/$pod" \
    --timeout=120s

timestamp=$(date -u +%Y%m%dT%H%M%S%NZ)
run_id=${GITHUB_RUN_ID:-manual}
revision=${GITHUB_SHA:-local}

remote_file="/tmp/rio-pre-migration-${timestamp}.dump"

archive="$workdir/database.dump"
encrypted="$workdir/database.dump.gpg"
downloaded="$workdir/downloaded.dump.gpg"
decrypted="$workdir/verified.dump"

object_key="pre-migration/${timestamp}-${run_id}-${revision:0:12}.dump.gpg"
object_uri="s3://${ALLAS_BACKUP_BUCKET}/${object_key}"

oc -n "$RAHTI_NAMESPACE" exec "$pod" \
    -- env BACKUP_FILE="$remote_file" sh -ec '
        [ "$POSTGRES_DB" = "rio_theaters" ] || {
            echo "Unexpected PostgreSQL database" >&2
            exit 1
        }

        export PGPASSWORD="$POSTGRES_PASSWORD"

        pg_dump \
            -h 127.0.0.1 \
            -U "$POSTGRES_USER" \
            -d "$POSTGRES_DB" \
            -Fc \
            -f "$BACKUP_FILE"

        test -s "$BACKUP_FILE"

        pg_restore --list "$BACKUP_FILE" > /dev/null
    '

oc -n "$RAHTI_NAMESPACE" cp \
    "$pod:$remote_file" \
    "$archive"

test -s "$archive"

remote_sha=$(oc -n "$RAHTI_NAMESPACE" exec "$pod" \
    -- sha256sum "$remote_file" | awk '{print $1}')

local_sha=$(sha256sum "$archive" | awk '{print $1}')

if [[ "$remote_sha" != "$local_sha" ]]; then
    echo 'Backup copy checksum mismatch' >&2
    exit 1
fi

printf '%s\n' "$BACKUP_PASSPHRASE" |
    gpg \
        --quiet \
        --batch \
        --yes \
        --pinentry-mode loopback \
        --passphrase-fd 0 \
        --cipher-algo AES256 \
        --compress-algo none \
        --symmetric \
        --output "$encrypted" \
        "$archive"

test -s "$encrypted"

aws configure set default.s3.addressing_style path

aws \
    --endpoint-url https://a3s.fi \
    s3 cp \
    "$encrypted" \
    "$object_uri" \
    --only-show-errors

aws \
    --endpoint-url https://a3s.fi \
    s3 cp \
    "$object_uri" \
    "$downloaded" \
    --only-show-errors

cmp -s "$encrypted" "$downloaded" || {
    echo 'Downloaded backup does not match uploaded backup' >&2
    exit 1
}

printf '%s\n' "$BACKUP_PASSPHRASE" |
    gpg \
        --quiet \
        --batch \
        --yes \
        --pinentry-mode loopback \
        --passphrase-fd 0 \
        --decrypt \
        --output "$decrypted" \
        "$downloaded"

cmp -s "$archive" "$decrypted" || {
    echo 'Decrypted backup does not match source dump' >&2
    exit 1
}

encrypted_sha=$(sha256sum "$downloaded" | awk '{print $1}')

echo "Verified encrypted off-cluster backup: $object_uri"
echo "Encrypted archive SHA-256: $encrypted_sha"

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    {
        echo '### Verified PostgreSQL backup'
        echo "- Object: \`$object_uri\`"
        echo "- Encrypted SHA-256: \`$encrypted_sha\`"
    } >> "$GITHUB_STEP_SUMMARY"
fi