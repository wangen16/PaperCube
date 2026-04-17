#!/usr/bin/env bash
set -euo pipefail

SSH_TARGET=${SSH_TARGET:-ubuntu@106.54.60.136}
INSTANCE_1_SERVICE=${INSTANCE_1_SERVICE:-ruoyi-api@1}
INSTANCE_2_SERVICE=${INSTANCE_2_SERVICE:-ruoyi-api@2}
INSTANCE_1_PORT=${INSTANCE_1_PORT:-6039}
INSTANCE_2_PORT=${INSTANCE_2_PORT:-6040}
PROBE_URL=${PROBE_URL:-http://127.0.0.1/api/auth/code}

ssh -tt "$SSH_TARGET" "sudo bash -s" <<REMOTE
set -euo pipefail

check_health() {
  local port="\$1"
  for _ in \$(seq 1 60); do
    if curl -fsS "http://127.0.0.1:\${port}/healthz" >/dev/null 2>/dev/null; then
      return 0
    fi
    sleep 0.5
  done
  echo "实例端口 \${port} 健康检查失败" >&2
  return 1
}

restart_instance() {
  local service_name="\$1"
  local port="\$2"
  echo "==> 重启 \${service_name}"
  systemctl restart "\${service_name}"
  check_health "\${port}"
  systemctl is-active --quiet "\${service_name}"
}

restart_instance "${INSTANCE_1_SERVICE}" "${INSTANCE_1_PORT}"
restart_instance "${INSTANCE_2_SERVICE}" "${INSTANCE_2_PORT}"

echo "==> 验证网关探活"
curl -fsS "${PROBE_URL}" >/dev/null 2>/dev/null
echo "滚动发布完成"
REMOTE
