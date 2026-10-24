#!/usr/bin/env bash
# ============================================================
#  TowerForge — a recovery code for a player who's locked out
#  Prints a new recovery code for one account (it replaces any code
#  the account had). The player then uses it on the site: Player →
#  Account → Sign In → Forgot your password? Accounts have no email,
#  so check the account is theirs first (docs/accounts.md).
#
#  From the repo root on this PC:
#      ssh ubuntu@towerforge.net "bash -s -- <username>" < ops/accounts/recovery-code.sh
#  or on the VPS itself:
#      bash recovery-code.sh <username>
# ============================================================
set -euo pipefail

if [ $# -ne 1 ]; then
    echo "Usage: recovery-code.sh <username>" >&2
    exit 2
fi

# The server's own settings (appsettings.Production.json → /var/lib/towerforge),
# as the service user, so the database stays owned by it.
cd /var/www/towerforge/server
sudo -u towerforge env ASPNETCORE_ENVIRONMENT=Production ./TowerForge.Server --recovery-code "$1"
