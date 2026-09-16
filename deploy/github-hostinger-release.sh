#!/usr/bin/env bash
# Deploy an approved GitHub artifact without touching persistent production data.
set -Eeuo pipefail

app_root=${HOSTINGER_DEPLOY_PATH:-/var/www/realty-pandit}
command=${1:-}
archive=${2:-}
release_id=${3:-}
run_migrations=${4:-0}

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
require() { command -v "$1" >/dev/null || die "required command unavailable: $1"; }

[[ "$app_root" == /* && "$app_root" != / ]] || die 'HOSTINGER_DEPLOY_PATH must be an absolute non-root path'
[[ "$release_id" =~ ^[A-Za-z0-9._-]+$ ]] || die 'invalid release id'
[[ "$run_migrations" == 0 || "$run_migrations" == 1 ]] || die 'run_migrations must be 0 or 1'

for tool in tar npm pm2 curl sudo; do require "$tool"; done
for component in backend frontend website; do
  [[ -d "$app_root/$component" ]] || die "missing live component: $app_root/$component"
done

backup_dir="$app_root/.github-deploy-backups"
mkdir -p "$backup_dir"

backup() {
  backup_file="$backup_dir/pre-${release_id}-$(date +%Y%m%d%H%M%S).tgz"
  tar -C "$app_root" -czf "$backup_file" \
    --exclude='backend/node_modules' --exclude='backend/.env' --exclude='backend/uploads' --exclude='backend/logs' \
    --exclude='frontend/node_modules' --exclude='frontend/dist' --exclude='frontend/.env' \
    --exclude='website/node_modules' --exclude='website/.next' --exclude='website/.env' --exclude='website/.env.local' \
    backend frontend website
  printf '%s\n' "$backup_file"
}

reload_services() {
  pm2 reload realty-backend --update-env
  sudo -u realty -H pm2 restart realty-website
  sudo -u realty -H pm2 restart realty-admin
}

verify() {
  for _ in {1..8}; do
    curl --fail --silent --show-error http://127.0.0.1:7071/health >/dev/null && break
    sleep 5
  done
  curl --fail --silent --show-error http://127.0.0.1:7071/health >/dev/null
  curl --fail --silent --show-error --head http://127.0.0.1:3000/ >/dev/null
  curl --fail --silent --show-error --head -H 'Host: admin.realtypandit.in' http://127.0.0.1/ >/dev/null
}

restore() {
  local backup_file=$1
  [[ -f "$backup_file" ]] || die "backup does not exist: $backup_file"
  tar -C "$app_root" -xzf "$backup_file"
  (cd "$app_root/backend" && npm ci && npx prisma generate)
  (cd "$app_root/frontend" && npm ci && npm run build)
  (cd "$app_root/website" && npm ci && npm run build && chown -R realty:realty .next)
  reload_services
  verify
}

case "$command" in
  rollback)
    [[ -n "$archive" ]] || die 'usage: rollback <backup-file> <release-id> <0|1>'
    restore "$archive"
    printf 'Rollback verified: %s\n' "$archive"
    ;;
  deploy)
    [[ -f "$archive" ]] || die "release archive does not exist: $archive"
    stage=$(mktemp -d "$app_root/.github-deploy-stage.XXXXXX")
    trap 'rm -rf "$stage"' EXIT
    tar -xzf "$archive" -C "$stage"
    for component in backend frontend website; do
      [[ -f "$stage/agents/$component/package.json" ]] || die "artifact missing agents/$component"
    done

    backup_file=$(backup)
    printf 'Backup created: %s\n' "$backup_file"

    # The archive excludes .env, uploads, logs, .next, dist, and node_modules.
    # Do not add --delete: server-bootstrap.js is currently production-only.
    tar -C "$stage/agents/backend" -cf - . | tar -C "$app_root/backend" -xf -
    tar -C "$stage/agents/frontend" -cf - . | tar -C "$app_root/frontend" -xf -
    tar -C "$stage/agents/website" -cf - . | tar -C "$app_root/website" -xf -

    (cd "$app_root/backend" && npm ci && npx prisma generate)
    if [[ "$run_migrations" == 1 ]]; then
      (cd "$app_root/backend" && npx prisma migrate deploy)
    fi
    (cd "$app_root/frontend" && npm ci && npm run build)
    (cd "$app_root/website" && npm ci && npm run build && chown -R realty:realty .next)
    reload_services

    if ! verify; then
      if [[ "$run_migrations" == 0 ]]; then
        printf 'Verification failed; restoring pre-deploy code backup.\n' >&2
        restore "$backup_file"
      else
        printf 'Verification failed after a migration; source backup retained at %s. Database rollback is manual.\n' "$backup_file" >&2
      fi
      exit 1
    fi
    printf 'Deployment verified: %s\n' "$release_id"
    ;;
  *)
    die 'usage: deploy <archive> <release-id> <0|1> | rollback <backup-file> <release-id> <0|1>'
    ;;
esac
