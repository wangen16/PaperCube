#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SSH_TARGET=${SSH_TARGET:-ubuntu@106.54.60.136}
PUBLIC_HOST=${PUBLIC_HOST:-$(printf '%s' "$SSH_TARGET" | awk -F@ '{print $NF}')}
REMOTE_ROOT=${REMOTE_ROOT:-/srv/ruoyi-admin}
INSTANCE_1_SERVICE=${INSTANCE_1_SERVICE:-ruoyi-api@1}
INSTANCE_2_SERVICE=${INSTANCE_2_SERVICE:-ruoyi-api@2}
INSTANCE_1_PORT=${INSTANCE_1_PORT:-6039}
INSTANCE_2_PORT=${INSTANCE_2_PORT:-6040}
PROBE_URL=${PROBE_URL:-http://127.0.0.1/api/auth/code}
SKIP_FRONTEND_BUILD=${SKIP_FRONTEND_BUILD:-false}
SKIP_BACKEND_INSTALL=${SKIP_BACKEND_INSTALL:-false}

if [[ -z "${DEPLOY_PASSWORD:-}" ]]; then
  read -r -s -p "SSH password for ${SSH_TARGET}: " DEPLOY_PASSWORD
  echo
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少命令: $1" >&2
    exit 1
  fi
}

require_cmd expect
require_cmd pnpm
require_cmd ssh
require_cmd scp
require_cmd tar
require_cmd shasum

SSH_OPTS=(
  -o
  StrictHostKeyChecking=no
  -o
  UserKnownHostsFile=/dev/null
)

run_with_password() {
  expect -c '
    set timeout -1
    set password [lindex $argv 0]
    set cmd [lrange $argv 1 end]
    spawn {*}$cmd
    expect {
      -re ".*yes/no.*" {
        send "yes\r"
        exp_continue
      }
      -re ".*password:.*" {
        send "$password\r"
        exp_continue
      }
      eof
    }
    catch wait result
    set exit_status [lindex $result 3]
    exit $exit_status
  ' "$DEPLOY_PASSWORD" "$@"
}

remote_ssh() {
  run_with_password ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "$@"
}

remote_scp() {
  run_with_password scp "${SSH_OPTS[@]}" "$@"
}

TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/ruoyi-release.XXXXXX")
BACKEND_ARCHIVE="${TMP_DIR}/backend.tgz"
FRONTEND_ARCHIVE="${TMP_DIR}/frontend-dist.tgz"
REMOTE_SCRIPT="${TMP_DIR}/remote-release.sh"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "==> 构建前端"
if [[ "$SKIP_FRONTEND_BUILD" != "true" ]]; then
  pnpm --dir "${ROOT_DIR}/frontend" build
else
  echo "跳过前端构建"
fi

echo "==> 打包发布文件"
COPYFILE_DISABLE=1 COPY_EXTENDED_ATTRIBUTES_DISABLE=1 \
  tar -czf "$BACKEND_ARCHIVE" \
  -C "$ROOT_DIR" \
  backend/package.json \
  backend/pnpm-lock.yaml \
  backend/README.md \
  backend/.env.example \
  backend/minio \
  backend/scripts \
  backend/src \
  backend/sql

COPYFILE_DISABLE=1 COPY_EXTENDED_ATTRIBUTES_DISABLE=1 \
  tar -czf "$FRONTEND_ARCHIVE" \
  -C "${ROOT_DIR}/frontend" \
  dist

BACKEND_SHA=$(shasum -a 256 "$BACKEND_ARCHIVE" | awk "{print \$1}")
FRONTEND_SHA=$(shasum -a 256 "$FRONTEND_ARCHIVE" | awk "{print \$1}")

cat >"$REMOTE_SCRIPT" <<EOF
set -euo pipefail

REMOTE_ROOT='${REMOTE_ROOT}'
INSTANCE_1_SERVICE='${INSTANCE_1_SERVICE}'
INSTANCE_2_SERVICE='${INSTANCE_2_SERVICE}'
INSTANCE_1_PORT='${INSTANCE_1_PORT}'
INSTANCE_2_PORT='${INSTANCE_2_PORT}'
PROBE_URL='${PROBE_URL}'
SKIP_BACKEND_INSTALL='${SKIP_BACKEND_INSTALL}'
BACKEND_SHA='${BACKEND_SHA}'
FRONTEND_SHA='${FRONTEND_SHA}'

check_health() {
  local port="\$1"
  for _ in \$(seq 1 60); do
    if curl -fsS "http://127.0.0.1:\${port}/healthz" >/dev/null 2>/dev/null; then
      echo "health \${port} ok"
      return 0
    fi
    sleep 0.5
  done
  echo "health \${port} failed" >&2
  return 1
}

cd "\$REMOTE_ROOT"

echo "==> 校验上传包"
echo "\${BACKEND_SHA}  /tmp/ruoyi-backend-deploy.tgz" | sha256sum -c
echo "\${FRONTEND_SHA}  /tmp/ruoyi-frontend-dist.tgz" | sha256sum -c

echo "==> 解包后端"
tar -xzf /tmp/ruoyi-backend-deploy.tgz -C "\$REMOTE_ROOT"

if [[ "\$SKIP_BACKEND_INSTALL" != "true" ]]; then
  echo "==> 安装后端依赖"
  cd "\$REMOTE_ROOT/backend"
  npm install --omit=dev --no-package-lock
  cd "\$REMOTE_ROOT"
else
  echo "跳过后端依赖安装"
fi

echo "==> 原子替换前端静态资源"
rm -rf frontend/dist.new
mkdir -p frontend/dist.new
tar -xzf /tmp/ruoyi-frontend-dist.tgz -C frontend/dist.new
test -f frontend/dist.new/dist/index.html
backup_dir="frontend/dist.prev.\$(date +%Y%m%d%H%M%S)"
if [[ -d frontend/dist ]]; then
  mv frontend/dist "\$backup_dir"
fi
mv frontend/dist.new/dist frontend/dist
rmdir frontend/dist.new
cp shared/maintenance.html frontend/dist/maintenance.html || true

echo "==> 滚动重启后端"
sudo systemctl restart "\$INSTANCE_1_SERVICE"
check_health "\$INSTANCE_1_PORT"
sudo systemctl restart "\$INSTANCE_2_SERVICE"
check_health "\$INSTANCE_2_PORT"

echo "==> 验证网关接口"
curl -fsS "\$PROBE_URL" >/dev/null

rm -f /tmp/ruoyi-backend-deploy.tgz /tmp/ruoyi-frontend-dist.tgz /tmp/ruoyi-remote-release.sh
echo "发布完成"
echo "前端备份目录: \${backup_dir}"
EOF

echo "==> 上传发布包"
remote_scp \
  "$BACKEND_ARCHIVE" \
  "$FRONTEND_ARCHIVE" \
  "$REMOTE_SCRIPT" \
  "${SSH_TARGET}:/tmp/"

echo "==> 执行远端发布"
remote_ssh \
  "mv /tmp/backend.tgz /tmp/ruoyi-backend-deploy.tgz && \
   mv /tmp/frontend-dist.tgz /tmp/ruoyi-frontend-dist.tgz && \
   mv /tmp/remote-release.sh /tmp/ruoyi-remote-release.sh && \
   bash /tmp/ruoyi-remote-release.sh"

echo "==> 发布校验"
curl -fsS "http://${PUBLIC_HOST}/api/auth/code" | head -c 300
echo
echo "本地发布流程完成"
