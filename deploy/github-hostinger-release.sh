#!/usr/bin/env bash
# Build an immutable release, atomically activate it, and retain a fast rollback.
set -Eeuo pipefail

app_root=${HOSTINGER_DEPLOY_PATH:-/var/www/realty-pandit}
command=${1:-}
archive=${2:-}
release_id=${3:-}
run_migrations=${4:-0}
keep_releases=${KEEP_RELEASES:-3}

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
require() { command -v "$1" >/dev/null || die "required command unavailable: $1"; }

[[ "$app_root" == /* && "$app_root" != / ]] || die 'HOSTINGER_DEPLOY_PATH must be an absolute non-root path'
[[ "$run_migrations" == 0 || "$run_migrations" == 1 ]] || die 'run_migrations must be 0 or 1'
[[ "$keep_releases" =~ ^[3-9][0-9]*$ ]] || die 'KEEP_RELEASES must be an integer of at least 3'

for tool in curl ln npm pm2 realpath stat sudo tar; do require "$tool"; done

app_root=$(realpath "$app_root")
releases="$app_root/releases"
shared="$app_root/shared"
current="$app_root/current"

preflight() {
  local target backend_mode website_mode
  [[ -d "$releases" && -d "$shared/uploads" && -d "$shared/logs" ]] || die 'release/shared directory layout is not prepared'
  [[ -f "$shared/backend.env" && -f "$shared/website.env" ]] || die 'shared environment files are missing'
  [[ -L "$current" ]] || die "$current must be a symlink"
  target=$(realpath "$current")
  [[ "$target" == "$releases/"* && -d "$target" ]] || die 'current must target an existing release directory'
  backend_mode=$(stat -c '%a' "$shared/backend.env" 2>/dev/null || stat -f '%Lp' "$shared/backend.env")
  website_mode=$(stat -c '%a' "$shared/website.env" 2>/dev/null || stat -f '%Lp' "$shared/website.env")
  [[ "$backend_mode" == *0 && "$website_mode" == *0 ]] || die 'shared environment files must not be world-accessible'
}

reload_services() {
  pm2 reload realty-backend --update-env
  sudo -u realty -H pm2 restart realty-website
}

verify() {
  local attempt
  for attempt in {1..8}; do
    if curl --fail --silent --show-error http://127.0.0.1:7071/health >/dev/null &&
       curl --fail --silent --show-error --head http://127.0.0.1:3000/ >/dev/null &&
       curl --fail --silent --show-error --head -H 'Host: admin.realtypandit.in' http://127.0.0.1/ >/dev/null; then
      return 0
    fi
    sleep 5
  done
  return 1
}

activate() {
  local release=$1
  ln -sfn "$release" "$current"
  reload_services
}

prepare_release() {
  local release=$1
  [[ -f "$shared/backend.env" ]] || die "missing $shared/backend.env"
  [[ -f "$shared/website.env" ]] || die "missing $shared/website.env"
  [[ -d "$shared/uploads" && -d "$shared/logs" ]] || die 'missing shared uploads or logs directory'

  ln -s "$shared/backend.env" "$release/backend/.env"
  ln -s "$shared/website.env" "$release/website/.env"
  ln -s "$shared/uploads" "$release/backend/uploads"
  ln -s "$shared/logs" "$release/backend/logs"

  (cd "$release/backend" && npm ci && npx prisma generate)
  (cd "$release/frontend" && npm ci && npm run build)
  (cd "$release/website" && npm ci && npm run build)
  printf '%s\n' "$release_id" > "$release/REVISION"
}

case "$command" in
  preflight)
    preflight
    printf 'Deployment filesystem preflight passed: %s\n' "$app_root"
    ;;
  deploy)
    [[ "$release_id" =~ ^[A-Za-z0-9._-]+$ ]] || die 'invalid release id'
    preflight
    [[ -f "$archive" ]] || die "release archive does not exist: $archive"
    release="$releases/$release_id"
    [[ ! -e "$release" ]] || die "release already exists: $release"
    mkdir -p "$releases"
    mkdir "$release"
    trap 'rm -rf "$release"' EXIT
    tar -xzf "$archive" -C "$release" --strip-components=1
    for component in backend frontend website; do
      [[ -f "$release/$component/package.json" ]] || die "artifact missing $component/package.json"
    done
    prepare_release "$release"

    previous=$(realpath "$current" 2>/dev/null || true)
    if [[ "$run_migrations" == 1 ]]; then
      (cd "$release/backend" && npx prisma migrate deploy)
    fi

    activate "$release"
    trap - EXIT
    if ! verify; then
      if [[ -n "$previous" && "$run_migrations" == 0 ]]; then
        printf 'Verification failed; reactivating %s.\n' "$previous" >&2
        activate "$previous"
        verify || die 'rollback verification failed'
      fi
      [[ "$run_migrations" == 0 ]] || printf 'Database rollback is manual after a migration.\n' >&2
      die 'deployment verification failed'
    fi
    find "$releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | tail -n "+$((keep_releases + 1))" | cut -d' ' -f2- | while IFS= read -r old; do
      [[ "$old" == "$previous" ]] || rm -rf "$old"
    done
    printf 'Deployment verified: %s\n' "$release_id"
    ;;
  rollback)
    [[ "$release_id" =~ ^[A-Za-z0-9._-]+$ ]] || die 'invalid release id'
    preflight
    release="$releases/$release_id"
    [[ -d "$release" ]] || die "release does not exist: $release"
    activate "$release"
    verify || die 'rollback verification failed'
    printf 'Rollback verified: %s\n' "$release_id"
    ;;
  *) die 'usage: preflight | deploy <archive> <release-id> <0|1> | rollback _ <release-id> 0' ;;
esac
