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
for owner in root realty; do
  printf 'PM2 owner: %s\n' "$owner"
  sudo -n -u "$owner" -H pm2 jlist | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>console.log(JSON.stringify(JSON.parse(s).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,cwd:p.pm2_env.pm_cwd,script:p.pm2_env.pm_exec_path})))));'
done
sudo -n nginx -T 2>&1 | awk '/syntax is ok|test is successful|server_name |root |proxy_pass / {print}'
curl -fsS http://127.0.0.1:7071/health
printf '\nBackup metadata (no backup contents):\n'
for folder in /var/backups/realty-pandit "$app_root/backups"; do
  if [[ -d "$folder" ]]; then find "$folder" -maxdepth 2 -type f -printf '%TY-%Tm-%Td %TH:%TM %s %f\n' | sort | tail -20; fi
done
cd "$current/backend"
node <<'NODE'
require('dotenv').config({quiet:true});
const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient({log:[]});
(async()=>{
  const migrations=await db.$queryRawUnsafe('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at');
  const columns=await db.$queryRawUnsafe("SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND ((table_name='contacts' AND column_name IN ('recycled_at','cycle_start_at','lead_cycle','client_role')) OR (table_name='transactions' AND column_name='client_role_override')) ORDER BY table_name,column_name");
  console.log(JSON.stringify({migrations,releaseColumns:columns}));
})().catch(e=>{console.error('Database preflight failed',e.code||e.name);process.exitCode=1;}).finally(()=>db.$disconnect());
NODE
