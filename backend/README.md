# system-api

Node.js 后端，覆盖 `init.sql` 能支持的系统模块，并直接连接 MySQL。

## 环境变量

参考 `.env.example`：

```bash
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=R1234567
DB_NAME=papercube_node
PORT=6039
DEFAULT_LOGIN_PASSWORD=admin123
MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=papercube-oss
MINIO_PUBLIC_URL=http://127.0.0.1:9000/papercube-oss
```

## 初始化数据库

```bash
pnpm --dir backend db:init
```

这个命令会：

- 自动创建 `DB_NAME`
- 执行仓库根目录的 `init.sql`
- 覆盖导入表结构和初始化数据

## 启动后端

```bash
pnpm --dir backend dev
```

前端开发环境默认通过 `frontend/vite.config.mts` 代理到 `http://127.0.0.1:6039`。

## 启动 MinIO

仓库已内置 `backend/minio` 可执行文件，并在 `backend/package.json` 中提供了脚本：

```bash
pnpm --dir backend minio
```

默认行为：

- API 端口：`9000`
- MinIO Console：`http://127.0.0.1:9001`
- 数据目录：`backend/.minio/data`
- 默认账号：`minioadmin`
- 默认密码：`minioadmin`

如果要和后端接口保持一致，优先通过 `.env` 中的 `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / `MINIO_BUCKET` 等变量统一配置。
