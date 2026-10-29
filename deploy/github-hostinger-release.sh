#!/usr/bin/env bash
# Guarded application delivery. Database changes are a separate reviewed operation.
set -Eeuo pipefail
umask 022
app_root=${HOSTINGER_DEPLOY_PATH:-/var/www/realty-pandit}
command=${1:-}
archive=${2:-}
release_id=${3:-}
run_migrations=${4:-0}
archive_sha=${5:-}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
release=''
previous=''
activation_started=0
worker_set=''

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
require() { command -v "$1" >/dev/null || die "required command unavailable: $1"; }
[[ "$app_root" == /* && "$app_root" != / ]] || die 'application root must be an absolute non-root path'
[[ "$run_migrations" == 0 ]] || die 'automatic migrations are blocked; use separately reviewed migration checks and SQL'
for tool in curl df flock ln mv node npm pm2 python3 realpath stat sudo tar; do require "$tool"; done
app_root=$(realpath "$app_root")
releases="$app_root/releases"
shared="$app_root/shared"
current="$app_root/current"

preflight() {
  local target mode component revision
  [[ -d "$releases" && ! -L "$releases" && -d "$shared/uploads" && -d "$shared/logs" ]] || die 'release/shared layout is not prepared'
  [[ -L "$current" ]] || die 'current must be a symlink'
  target=$(realpath "$current")
  [[ "$(dirname "$target")" == "$releases" && -d "$target" ]] || die 'current must target a direct release directory'
  [[ -f "$target/REVISION" ]] || die 'current revision marker is missing'
  revision=$(<"$target/REVISION")
  [[ "$revision" =~ ^[a-f0-9]{40}$ ]] || die 'current revision is not a full Git SHA'
  for component in backend frontend website; do
    [[ -f "$shared/$component.env" ]] || die 'shared environment file is missing'
    mode=$(stat -c '%a' "$shared/$component.env")
    [[ "$mode" == 600 || "$mode" == 640 ]] || die 'environment files must be mode 0600 or 0640'
  done
  grep -Eq '^VITE_API_BASE_URL=.+$' "$shared/frontend.env" || die 'frontend API URL is missing'
}
lock_changes() {
  [[ ! -L "$app_root/.production-change.lock" ]] || die 'change lock must not be a symlink'
  umask 077
  exec 9>>"$app_root/.production-change.lock"
  umask 022
  flock -n 9 || die 'another production change is running'
}
reload_services() {
  sudo -n pm2 reload realty-backend --update-env || return
  sudo -n -u realty -H pm2 restart realty-website
}
backend_workers() {
  sudo -n pm2 jlist | node -e '
    let text="";process.stdin.on("data",c=>{text+=c;if(text.length>1048576)process.exit(1)});process.stdin.on("end",()=>{try{
      const rows=JSON.parse(text).filter(p=>p.name==="realty-backend");
      if(!rows.length||rows.length>8||rows.some(p=>p.pm2_env?.status!=="online"||!(p.pid>0)))process.exit(1);
      const ids=rows.map(p=>String(p.pm2_env.NODE_APP_INSTANCE??"single"));
      if(new Set(ids).size!==ids.length||ids.some(id=>!/^[A-Za-z0-9_-]{1,32}$/.test(id)))process.exit(1);
      console.log(ids.sort().join(","));
    }catch{process.exit(1);}});'
}
capacity() {
  local available
  available=$(df -B1 --output=avail "$releases" | tail -n1 | tr -d ' ') || return 1
  [[ "$available" =~ ^[0-9]+$ ]] && (( available > $1 ))
}
atomic_switch() {
  local target=$1 temporary="$app_root/.current-$$"
  [[ "$(dirname "$target")" == "$releases" && -d "$target" ]] || return 1
  [[ ! -e "$temporary" && ! -L "$temporary" ]] || return 1
  ln -s -- "$target" "$temporary" || return
  if ! mv -Tf -- "$temporary" "$current"; then rm -f -- "$temporary"; return 1; fi
}
verify() {
  local expected=${1:-} fingerprint=${2:-} attempt health status instance successes=0 needed probe protected
  local -A seen=()
  [[ -n "$worker_set" ]] || return 1
  needed=$(awk -F, '{print NF*2}' <<<"$worker_set")
  for attempt in {1..24}; do
    health=$(curl --connect-timeout 3 --max-time 10 --max-filesize 65536 --fail --silent http://127.0.0.1:7071/health) || { successes=0; seen=(); sleep 2; continue; }
    instance=$(EXPECTED_RELEASE="$expected" EXPECTED_DATABASE_FINGERPRINT="$fingerprint" node -e '
      let text="";process.stdin.on("data",c=>text+=c);process.stdin.on("end",()=>{try{
        const h=JSON.parse(text),rev=process.env.EXPECTED_RELEASE,db=process.env.EXPECTED_DATABASE_FINGERPRINT;
        if(h.status!=="ok"||h.db?.status!=="connected"||h.redis?.status!=="connected"||(rev&&h.release!==rev)||(db&&h.db?.fingerprint!==db)||!/^[A-Za-z0-9_-]{1,32}$/.test(h.instance||""))process.exit(1);
        console.log(h.instance);
      }catch{process.exitCode=1;}});' <<<"$health") || { successes=0; seen=(); sleep 2; continue; }
    [[ ",$worker_set," == *",$instance,"* ]] || { successes=0; seen=(); sleep 2; continue; }
    seen["$instance"]=1; successes=$((successes+1))
    # Probe health separately from auth so round-robin workers cannot be skipped by an
    # even number of backend connections in each loop.
    if (( successes < needed )) || [[ "$(printf '%s\n' "${!seen[@]}" | sort | paste -sd, -)" != "$worker_set" ]]; then sleep 2; continue; fi
    protected=1
    for ((probe=0;probe<needed;probe++)); do
      status=$(curl --connect-timeout 3 --max-time 10 --silent -o /dev/null -w '%{http_code}' http://127.0.0.1:7071/api/inventory) || { protected=0; break; }
      [[ "$status" == 401 ]] || { protected=0; break; }
    done
    if [[ "$protected" != 1 ]]; then successes=0; seen=(); sleep 2; continue; fi
    if curl --connect-timeout 3 --max-time 10 --fail --silent --head http://127.0.0.1:3000/ >/dev/null &&
       curl --connect-timeout 3 --max-time 10 --fail --silent --head -H 'Host: admin.realtypandit.in' http://127.0.0.1/ >/dev/null; then
      [[ "$(backend_workers)" == "$worker_set" ]] && return 0
    else successes=0; seen=(); fi
    sleep 2
  done
  return 1
}
recover() {
  local code=$1 live=''
  trap - ERR INT TERM
  set +e
  if [[ "$activation_started" == 1 && -n "$previous" ]]; then
    printf 'Activation failed; retaining both releases and switching back.\n' >&2
    if atomic_switch "$previous"; then
      if reload_services && verify; then printf 'Previous application health restored; confirm its revision manually if it predates revision health metadata.\n' >&2;
      else printf 'RECOVERY INCOMPLETE: manual process/revision verification required.\n' >&2; fi
    else printf 'RECOVERY INCOMPLETE: could not restore previous symlink.\n' >&2; fi
  fi
  # Never remove anything after activation was attempted: a worker can still use its files.
  # Interruptions also retain the candidate so a child build cannot write into a deleted tree.
  if [[ "$activation_started" == 0 && "$code" != 130 && "$code" != 143 && -n "$release" && -d "$release" ]]; then
    live=$(realpath "$current" 2>/dev/null) || live=''
    if [[ -n "$live" && "$(dirname "$release")" == "$releases" && "$live" != "$release" && "$release" != "$previous" ]]; then rm -rf -- "$release"; fi
  fi
  printf 'Release failed (code %s); database/schema rollback was not attempted.\n' "$code" >&2
  exit "$code"
}
prepare_release() {
  local candidate=$1
  ln -s "$shared/backend.env" "$candidate/backend/.env"
  ln -s "$shared/frontend.env" "$candidate/frontend/.env.production"
  ln -s "$shared/website.env" "$candidate/website/.env"
  ln -s "$shared/uploads" "$candidate/backend/uploads"
  ln -s "$shared/logs" "$candidate/backend/logs"
  # Server-only bootstrap must be reviewed/packaged, never silently discarded or copied.
  [[ ! -f "$previous/backend/server-bootstrap.js" || -f "$candidate/backend/server-bootstrap.js" ]] || die 'artifact is missing the reviewed production bootstrap'
  (trap - ERR; cd "$candidate/backend"; npm ci --include=dev && npx --no-install prisma generate) 9>&-
  capacity 3221225472 || return 1
  (trap - ERR; cd "$candidate/frontend"; npm ci --include=dev && npm run build) 9>&-
  capacity 2147483648 || return 1
  (trap - ERR; cd "$candidate/website"; npm ci --include=dev && npm run build) 9>&-
  capacity 1073741824 || return 1
  printf '%s\n' "$release_id" > "$candidate/REVISION"
  (umask 077; node "$candidate/contact-change.cjs" schema --backend "$candidate/backend" > "$candidate/.database-target.json")
}

case "$command" in
  preflight) preflight; printf 'Deployment filesystem preflight passed.\n' ;;
  deploy)
    [[ "$EUID" != 0 ]] || die 'build/deploy must use the approved least-privilege deployment account'
    [[ "$release_id" =~ ^[a-f0-9]{40}$ && "$archive_sha" =~ ^[a-f0-9]{64}$ ]] || die 'full Git SHA and approved artifact SHA-256 are required'
    preflight; lock_changes
    previous=$(realpath "$current")
    worker_set=$(backend_workers) || die 'cannot prove healthy backend worker identities'
    verify || die 'existing application/dependencies are not healthy; inspect before deployment'
    [[ -f "$script_dir/release-safety.py" ]] || die 'archive guard is missing'
    unpacked=$(python3 "$script_dir/release-safety.py" "$archive" "$archive_sha")
    free=$(df -B1 --output=avail "$releases" | tail -n 1 | tr -d ' ')
    [[ "$free" =~ ^[0-9]+$ && "$unpacked" =~ ^[0-9]+$ ]] || die 'cannot prove filesystem capacity'
    (( free > unpacked * 4 + 5368709120 )) || die 'insufficient build/recovery disk capacity'
    release="$releases/$release_id"
    [[ ! -e "$release" && ! -L "$release" ]] || die 'candidate release already exists; inspect it rather than overwriting it'
    mkdir "$release"
    trap 'recover $?' ERR
    trap 'recover 130' INT
    trap 'recover 143' TERM
    tar -xzf "$archive" -C "$release" --strip-components=1 --no-same-owner --no-same-permissions
    prepare_release "$release"
    fingerprint=$(node -e 'const x=require(process.argv[1]);if(x.result!=="SCHEMA_READY"||!/^[a-f0-9]{64}$/.test(x.database_fingerprint||""))process.exit(1);console.log(x.database_fingerprint)' "$release/.database-target.json")
    activation_started=1
    atomic_switch "$release"
    reload_services
    verify "$release_id" "$fingerprint"
    RELEASE_ID="$release_id" ARTIFACT_SHA="$archive_sha" DATABASE_FINGERPRINT="$fingerprint" WORKERS="$worker_set" node -e 'console.log(JSON.stringify({revision:process.env.RELEASE_ID,artifact_sha256:process.env.ARTIFACT_SHA,database_fingerprint:process.env.DATABASE_FINGERPRINT,instances:process.env.WORKERS.split(","),verified_at:new Date().toISOString()}))' > "$release/.verified.json"
    printf '%s %s\n' "$release_id" "$archive_sha" > "$release/.verified"
    trap - ERR INT TERM
    # No automatic pruning: current, previous and failed releases are recovery evidence.
    printf 'Deployment verified: %s. Previous and failed releases are retained.\n' "$release_id"
    ;;
  rollback)
    [[ "$EUID" != 0 ]] || die 'rollback must use the approved deployment account'
    [[ "$release_id" =~ ^[a-f0-9]{40}$ && "${APPROVED_APPLICATION_ROLLBACK:-}" == "$release_id" ]] || die 'an explicitly approved full rollback revision is required'
    preflight; lock_changes
    release="$releases/$release_id"
    [[ -d "$release" && ! -L "$release" && -f "$release/.verified" && -f "$release/.verified.json" && "$(<"$release/REVISION")" == "$release_id" ]] || die 'rollback target lacks verified release evidence'
    node -e 'const fs=require("fs"),p=process.argv[1],sha=process.argv[2],m=JSON.parse(fs.readFileSync(p+"/.verified.json")),s=fs.readFileSync(p+"/.verified","utf8").trim().split(/\s+/);if(s.length!==2||s[0]!==sha||m.revision!==sha||m.artifact_sha256!==s[1]||!/^[a-f0-9]{64}$/.test(s[1]))process.exit(1)' "$release" "$release_id" || die 'rollback verification receipt is inconsistent'
    previous=$(realpath "$current")
    [[ "$release" != "$previous" ]] || die 'rollback target is already current'
    worker_set=$(backend_workers) || die 'cannot prove backend worker identities'
    target_check=$(node "$release/contact-change.cjs" schema --backend "$release/backend")
    fingerprint=$(node -e 'const x=JSON.parse(process.argv[1]);if(!x.database_fingerprint)process.exit(1);console.log(x.database_fingerprint)' "$target_check")
    trap 'recover $?' ERR
    trap 'recover 130' INT
    trap 'recover 143' TERM
    activation_started=1
    atomic_switch "$release"; reload_services; verify "$release_id" "$fingerprint"
    trap - ERR INT TERM
    printf 'Application rollback verified. Nullable database columns were retained.\n'
    ;;
  *) die 'usage: preflight | deploy <archive> <40-char-sha> 0 <artifact-sha256> | rollback _ <40-char-sha> 0' ;;
esac
