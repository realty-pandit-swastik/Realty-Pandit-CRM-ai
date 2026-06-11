# FreeSWITCH SIP Bridge for WhatsApp Calling

## What this does
- Runs on port 5061 (TLS) — receives SIP calls from WhatsApp
- Authenticates with Meta's SIP password
- Bridges audio to the Pipecat service on :8765

## SIP Credentials (from Meta)
- SIP server: api.realtypandit.in:5061
- SIP password: qM5OkVgMRpda2fzQFXLGFnG0BzsmtNku

## Deploy on server
```bash
cd agents/pipecat/freeswitch
docker-compose up -d
```

## SSL/TLS Certificate
Port 5061 requires TLS. Point FreeSWITCH at your existing Let's Encrypt certs:
```
/etc/letsencrypt/live/api.realtypandit.in/fullchain.pem
/etc/letsencrypt/live/api.realtypandit.in/privkey.pem
```

## Verify it's running
```bash
docker logs panditji-freeswitch
# Should show: FreeSWITCH ready, listening on :5061
```
