#!/usr/bin/env bash
set -euo pipefail

ssh ubuntu@106.54.60.136 'sudo touch /srv/ruoyi-admin/.maintenance && sudo systemctl reload nginx'
