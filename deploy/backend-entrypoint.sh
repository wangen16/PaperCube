#!/bin/sh
set -eu

cd /app

echo "Waiting for MySQL at ${DB_HOST}:${DB_PORT}..."
node <<'NODE'
const mysql = require('mysql2/promise');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      });
      await connection.end();
      return;
    } catch (error) {
      console.log(`MySQL not ready yet (${attempt}/60): ${error.message}`);
      await delay(2000);
    }
  }
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE

echo "Checking database schema..."
TABLE_COUNT="$(node <<'NODE'
const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  try {
    const [rows] = await connection.query(
      'SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = ?',
      [process.env.DB_NAME],
    );
    process.stdout.write(String(rows[0].total || 0));
  } finally {
    await connection.end();
  }
}

main().catch(() => {
  process.stdout.write('0');
});
NODE
)"

if [ "${TABLE_COUNT}" = "0" ]; then
  echo "Initializing database ${DB_NAME}..."
  pnpm run db:init
else
  echo "Database ${DB_NAME} already initialized, tables=${TABLE_COUNT}"
fi

exec pnpm run start
