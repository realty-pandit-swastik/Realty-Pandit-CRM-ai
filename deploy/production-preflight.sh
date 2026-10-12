#!/usr/bin/env bash
# Read-only operational evidence; never print environment values or PM2 env dumps.
set -Eeuo pipefail
app_root=${HOSTINGER_DEPLOY_PATH:?HOSTINGER_DEPLOY_PATH is required}
[[ "$app_root" == /* && "$app_root" != / ]]
current=$(realpath "$app_root/current")
[[ "$current" == "$app_root/releases/"* ]]
printf 'Identity: '; id
printf 'Current release: %s\n' "$current"
cat "$current/REVISION"
df -h "$app_root"
free -m
sha256sum "$current"/{backend,frontend,website}/package-lock.json
if [[ -f "$current/backend/server-bootstrap.js" ]]; then sha256sum "$current/backend/server-bootstrap.js"; fi
umask 077
report=$(mktemp)
trap 'rm -f "$report"' EXIT
incomplete=0
for owner in root realty; do
  printf 'PM2 owner: %s\n' "$owner"
  if [[ "$owner" == root ]]; then
    sudo -n pm2 jlist > "$report" || incomplete=1
  else
    sudo -n -u "$owner" -H pm2 jlist > "$report" || incomplete=1
  fi
  if [[ ! -s "$report" ]]; then printf 'PM2 inspection unavailable for %s\n' "$owner"; continue; fi
  node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>console.log(JSON.stringify(JSON.parse(s).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,cwd:p.pm2_env.pm_cwd,script:p.pm2_env.pm_exec_path})))));' < "$report"
done
if sudo -n nginx -T > "$report" 2>&1; then
  awk '/syntax is ok|test is successful|server_name |root |proxy_pass / {print}' "$report"
else
  printf 'Nginx inspection unavailable\n'; incomplete=1
fi
curl -fsS http://127.0.0.1:7071/health
printf '\nBackup metadata (no backup contents):\n'
for folder in /var/backups/realty-pandit "$app_root/backups"; do
  if [[ -d "$folder" && -r "$folder" && -x "$folder" ]]; then find "$folder" -maxdepth 2 -type f -printf '%TY-%Tm-%Td %TH:%TM %s %f\n' | sort | tail -20; else printf 'Backup metadata unavailable: %s\n' "$folder"; fi
done
cd "$current/backend"
node <<'NODE'
require('dotenv').config({quiet:true});
const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient({log:[]});
(async()=>{
  const migrations=await db.$queryRawUnsafe('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at');
  const columns=await db.$queryRawUnsafe("SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND ((table_name='contacts' AND column_name IN ('recycled_at','cycle_start_at','lead_cycle','client_role')) OR (table_name='transactions' AND column_name='client_role_override')) ORDER BY table_name,column_name");
  const privileges=await db.$queryRawUnsafe('SELECT current_user AS role, rolcreatedb, rolsuper FROM pg_roles WHERE rolname=current_user');
  console.log(JSON.stringify({migrations,releaseColumns:columns,databasePrivileges:privileges}));
})().catch(e=>{console.error('Database preflight failed',e.code||e.name);process.exitCode=1;}).finally(()=>db.$disconnect());
NODE

[[ "$incomplete" == 0 ]] || { printf 'Preflight incomplete: privileged inspection unavailable\n'; exit 1; }
