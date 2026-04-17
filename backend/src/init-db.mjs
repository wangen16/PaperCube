import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import './env.mjs';

import mysql from 'mysql2/promise';

const SQL_PATHS = [
  fileURLToPath(new URL('../sql/init.sql', import.meta.url)),
  fileURLToPath(new URL('../sql/school.sql', import.meta.url)),
  fileURLToPath(new URL('../sql/exam.sql', import.meta.url)),
];

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
  const sql = SQL_PATHS.map((filePath) => fs.readFileSync(filePath, 'utf8')).join('\n\n');

  const adminConnection = await mysql.createConnection({
    ...createConnectionConfig(false),
    multipleStatements: true,
  });

  try {
    await adminConnection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    await adminConnection.query(`USE \`${database}\`; SET FOREIGN_KEY_CHECKS = 0; ${sql} SET FOREIGN_KEY_CHECKS = 1;`);
  } finally {
    await adminConnection.end();
  }

  const verifyConnection = await mysql.createConnection(createConnectionConfig(true));

  try {
    const [tables] = await verifyConnection.query(
      `SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = ?`,
      [database],
    );
    console.log(`database initialized: ${database}, tables=${tables[0].total}`);
  } finally {
    await verifyConnection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
