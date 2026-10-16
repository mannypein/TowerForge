#!/usr/bin/env bash
# Installs Umami analytics on the TowerForge VPS (run as ubuntu, uses sudo).
# - PostgreSQL 16 from Ubuntu
# - Node 22 (official, checksum-verified) in /opt/node22, used only by Umami
# - Umami $UMAMI_VERSION in /opt/umami/app as system user "umami"
# - systemd service on 127.0.0.1:3000, served by nginx under /analytics
set -euo pipefail

UMAMI_VERSION=v3.4.0
PNPM_VERSION=12.3.4
NODE_DIR=/opt/node22
HOME_DIR=/opt/umami
APP_DIR=$HOME_DIR/app

log() { echo "==> $*"; }

log "PostgreSQL"
sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql >/dev/null
sudo systemctl enable --now postgresql >/dev/null 2>&1

log "Node 22 for Umami"
if [ ! -x "$NODE_DIR/bin/node" ]; then
    tmp=$(mktemp -d)
    base=https://nodejs.org/dist/latest-v22.x
    curl -fsSL "$base/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
    file=$(awk '/linux-x64\.tar\.xz$/ {print $2}' "$tmp/SHASUMS256.txt")
    curl -fsSL "$base/$file" -o "$tmp/$file"
    (cd "$tmp" && grep " $file\$" SHASUMS256.txt | sha256sum -c -)
    sudo mkdir -p "$NODE_DIR"
    sudo tar -xJf "$tmp/$file" -C "$NODE_DIR" --strip-components=1
    rm -rf "$tmp"
fi
"$NODE_DIR/bin/node" -v
sudo env PATH="$NODE_DIR/bin:$PATH" "$NODE_DIR/bin/npm" install -g --prefix "$NODE_DIR" "pnpm@$PNPM_VERSION" --silent
"$NODE_DIR/bin/pnpm" -v

log "User and database"
id umami >/dev/null 2>&1 || sudo useradd --system --create-home --home-dir "$HOME_DIR" --shell /usr/sbin/nologin umami
if ! sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='umami'" | grep -q 1; then
    dbpass=$(openssl rand -hex 24)
    sudo -u postgres psql -q -c "create user umami with password '$dbpass'"
    sudo -u postgres psql -q -c "create database umami owner umami"
    printf 'DATABASE_URL=postgresql://umami:%s@localhost:5432/umami\n' "$dbpass" | sudo tee "$HOME_DIR/.db.env" >/dev/null
    sudo chown umami:umami "$HOME_DIR/.db.env"
    sudo chmod 600 "$HOME_DIR/.db.env"
fi

log "Umami $UMAMI_VERSION source"
if [ ! -d "$APP_DIR/.git" ]; then
    sudo -u umami git clone -q --depth 1 --branch "$UMAMI_VERSION" https://github.com/umami-software/umami.git "$APP_DIR"
fi

log "Umami settings"
if [ ! -f "$APP_DIR/.env" ]; then
    {
        sudo cat "$HOME_DIR/.db.env"
        echo "BASE_PATH=/analytics"
        echo "DISABLE_TELEMETRY=1"
        echo "APP_SECRET=$(openssl rand -hex 32)"
    } | sudo tee "$APP_DIR/.env" >/dev/null
    sudo chown umami:umami "$APP_DIR/.env"
    sudo chmod 600 "$APP_DIR/.env"
fi

log "Install and build (several minutes)"
sudo -u umami env HOME="$HOME_DIR" PATH="$NODE_DIR/bin:/usr/bin:/bin" bash -c "
    set -euo pipefail
    cd '$APP_DIR'
    set -a; . ./.env; set +a
    pnpm install --frozen-lockfile --reporter=silent
    pnpm build
"

log "systemd service"
sudo tee /etc/systemd/system/umami.service >/dev/null <<UNIT
[Unit]
Description=Umami analytics (towerforge.net/analytics)
After=network.target postgresql.service
Requires=postgresql.service

[Service]
User=umami
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
Environment=NODE_ENV=production
Environment=PATH=$NODE_DIR/bin:/usr/bin:/bin
ExecStart=$NODE_DIR/bin/node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now umami >/dev/null 2>&1
sleep 8
sudo systemctl is-active umami
curl -s -o /dev/null -w "heartbeat %{http_code}\n" http://127.0.0.1:3000/analytics/api/heartbeat
log "done"
