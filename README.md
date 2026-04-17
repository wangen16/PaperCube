# PaperCube

该仓库包含两个独立运行的应用：

- `frontend/`：前端应用
- `backend/`：后端应用

## Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

构建：

```bash
cd frontend
pnpm build
```

## Backend

```bash
cd backend
pnpm install
pnpm dev
```

初始化数据库：

```bash
cd backend
pnpm db:init
```

默认端口：

- 前端：`5666`
- 后端：`6039`

## 一键发版

默认发布到 `ubuntu@106.54.60.136:/srv/ruoyi-admin`，并自动完成：

- 前端构建
- 上传后端源码和前端静态资源
- 线上安装后端依赖
- 原子替换前端 `dist`
- 滚动重启 `ruoyi-api@1` 和 `ruoyi-api@2`

执行方式：

```bash
DEPLOY_PASSWORD='你的服务器密码' ./deploy/release.sh
```

也可以不传 `DEPLOY_PASSWORD`，脚本会在执行时提示输入。

常用可选变量：

```bash
SSH_TARGET=ubuntu@106.54.60.136 REMOTE_ROOT=/srv/ruoyi-admin ./deploy/release.sh
SKIP_FRONTEND_BUILD=true ./deploy/release.sh
SKIP_BACKEND_INSTALL=true ./deploy/release.sh
```
