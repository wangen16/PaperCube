import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import './env.mjs';

import mysql from 'mysql2/promise';

const EXAM_SQL_PATH = fileURLToPath(new URL('../sql/exam.sql', import.meta.url));

function createConnectionConfig(includeDatabase = false) {
  const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    password: process.env.DB_PASSWORD || 'R1234567',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
  };

  if (includeDatabase) {
    config.database = process.env.DB_NAME || 'papercube_node';
  }

  return config;
}

async function main() {
  const database = process.env.DB_NAME || 'papercube_node';
  const sql = fs.readFileSync(EXAM_SQL_PATH, 'utf8');

  const adminConnection = await mysql.createConnection({
    ...createConnectionConfig(false),
    multipleStatements: true,
  });

  try {
    await adminConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`,
    );
    await adminConnection.query(
      `USE \`${database}\`; SET FOREIGN_KEY_CHECKS = 0; ${sql} SET FOREIGN_KEY_CHECKS = 1;`,
    );
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      console.error(
        '当前数据库缺少系统基础表，不能单独初始化考试模块。请先执行 npm run db:init 完整初始化，再按需执行 npm run db:init:exam。',
      );
    }
    throw error;
  } finally {
    await adminConnection.end();
  }

  console.log(`exam tables initialized: ${database}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
