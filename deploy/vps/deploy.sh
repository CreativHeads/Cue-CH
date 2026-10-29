#!/usr/bin/env bash
# Deploy the committed app to the VPS and serve it at cue.creativheads.com, next to the other
# projects. Run from this folder's repo root in Git Bash:
#   CUE_VPS=root@<vps-ip> bash deploy/vps/deploy.sh
# Safe to re-run for updates: it replaces the code, keeps the database, backups and .env.
# The server address is passed in (not stored here) because the repository is public.
set -euo pipefail

HOST=${CUE_VPS:?Set CUE_VPS, e.g. CUE_VPS=root@1.2.3.4}
KEY=${CUE_SSH_KEY:-~/.ssh/creativheads_vps}
DOMAIN=${CUE_DOMAIN:-cue.creativheads.com}
DIR=/opt/cue
CADDYFILE=/opt/casting-manager/deploy/vps/Caddyfile
CADDY=casting-manager-caddy-1
SSH="ssh -i $KEY -o BatchMode=yes $HOST"

cd "$(dirname "$0")/../.."
[ -z "$(git status --porcelain)" ] || echo "note: uncommitted changes are NOT deployed (only the last commit is)"

echo "==> Uploading committed code ($(git rev-parse --short HEAD))"
$SSH "mkdir -p $DIR && find $DIR -mindepth 1 -maxdepth 1 ! -name deploy -exec rm -rf {} + && rm -rf $DIR/deploy/vps/Dockerfile $DIR/deploy/vps/*.mjs"
git archive --format=tar HEAD | $SSH "tar xf - -C $DIR"

echo "==> Server settings (.env): created once with random secrets, never overwritten"
$SSH "set -e
F=$DIR/deploy/vps/.env
if [ ! -f \$F ]; then
  umask 077
  rnd() { head -c 32 /dev/urandom | base64 | tr -dc A-Za-z0-9 | head -c \$1; }
  cat > \$F <<EOF
# Cue on the VPS. Fill in the empty values, then: cd $DIR/deploy/vps && docker compose up -d
APP_URL=https://$DOMAIN
APP_TIMEZONE=Asia/Kolkata
POSTGRES_PASSWORD=\$(rnd 32)
CRON_SECRET=\$(rnd 40)
# Instagram data (Windsor.ai)
WINDSOR_API_KEY=
# Telegram: send-only works with any bot token; set WEBHOOK_ENABLED=true only for a bot used by nothing else
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_ENABLED=false
TELEGRAM_WEBHOOK_SECRET=\$(rnd 40)
EOF
  echo 'created .env'
else
  echo '.env kept'
fi"

echo "==> Building and starting the containers (first build takes a few minutes)"
$SSH "cd $DIR/deploy/vps && docker compose up -d --build 2>&1 | tail -6 && docker compose ps --format '{{.Service}}: {{.Status}}'"

echo "==> Running database migrations"
$SSH "cd $DIR/deploy/vps && for i in \$(seq 1 30); do docker compose exec -T app node scripts/migrate.mjs && break; sleep 3; done"
$SSH "cd $DIR/deploy/vps && if [ ! -f .seeded ]; then docker compose exec -T app node scripts/migrate.mjs --seed && touch .seeded; else echo 'already seeded'; fi"

echo "==> Adding $DOMAIN to Caddy (only if missing)"
$SSH "set -e
if ! grep -q '^$DOMAIN ' $CADDYFILE; then
  cp $CADDYFILE $CADDYFILE.bak-cue
  printf '\n# Cue content tracker (deployed from /opt/cue, joined to this network as \"cue-tracker\").\n$DOMAIN {\n\tencode gzip\n\treverse_proxy cue-tracker:3000\n}\n' >> $CADDYFILE
  if ! docker exec $CADDY caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    cat $CADDYFILE.bak-cue > $CADDYFILE   # same file, so the container bind mount keeps working
    echo 'Caddy config invalid, change reverted' >&2
    exit 1
  fi
fi
# A casting-manager redeploy can replace the Caddyfile; the running container may hold an old copy.
if docker exec $CADDY grep -q '^$DOMAIN ' /etc/caddy/Caddyfile; then
  docker exec $CADDY caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
else
  echo 'Caddy is reading an old copy of its Caddyfile; restarting it (a few seconds)'
  docker restart $CADDY >/dev/null
  sleep 3
fi"

echo "==> Checking the app from inside Caddy"
$SSH "for i in \$(seq 1 30); do docker exec $CADDY wget -qO /dev/null http://cue-tracker:3000/signin && echo 'app answers (sign-in page)' && exit 0; sleep 3; done; echo 'app did not answer yet: cd $DIR/deploy/vps && docker compose logs app' >&2; exit 1"

echo "==> Waiting for the HTTPS certificate"
for i in $(seq 1 24); do
  if curl -fsS -o /dev/null "https://$DOMAIN/signin"; then echo "HTTPS ok"; break; fi
  sleep 5
done

echo "Done: https://$DOMAIN"
echo "First time? Set the admin password:"
echo "  $SSH \"cd $DIR/deploy/vps && docker compose exec app node scripts/set-password.mjs <admin-email> '<password>'\""
