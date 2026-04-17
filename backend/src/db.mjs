import './env.mjs';

import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  connectionLimit: 10,
  database: process.env.DB_NAME || 'papercube_node',
  dateStrings: true,
  host: process.env.DB_HOST || '127.0.0.1',
  password: process.env.DB_PASSWORD || 'R1234567',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
});

function toCamelCase(value) {
  return value.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

function mapRowKeys(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [toCamelCase(key), value]),
  );
}

export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows.map(mapRowKeys);
}

export async function execute(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

export async function withTransaction(handler) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await handler(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function toJsonColumnValue(value) {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value === 'string') {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(value);
    }
  }
  return JSON.stringify(value);
}

export async function loadTables(tableNames) {
  const entries = await Promise.all(
    tableNames.map(async (tableName) => {
      const rows = await query(`SELECT * FROM \`${tableName}\``);
      return [tableName, rows];
    }),
  );
  return Object.fromEntries(entries);
}

function isRetryableMysqlError(error) {
  return ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error?.code);
}

export async function replaceTables(tableNames, tables, rawColumnsByTable, jsonColumnsByTable = {}) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await withTransaction(async (connection) => {
        try {
          await connection.query('SET FOREIGN_KEY_CHECKS = 0');

          for (const tableName of tableNames) {
            await connection.query(`DELETE FROM \`${tableName}\``);

            const rows = tables[tableName] ?? [];
            const rawColumns = rawColumnsByTable[tableName] ?? [];
            const jsonColumns = new Set(jsonColumnsByTable[tableName] ?? []);

            if (rows.length === 0 || rawColumns.length === 0) {
              continue;
            }

            const placeholders = `(${rawColumns.map(() => '?').join(', ')})`;
            const sql = `INSERT INTO \`${tableName}\` (${rawColumns
              .map((column) => `\`${column}\``)
              .join(', ')}) VALUES ${rows.map(() => placeholders).join(', ')}`;

            const values = rows.flatMap((row) =>
              rawColumns.map((column) => {
                const value = row[toCamelCase(column)];
                if (jsonColumns.has(column)) {
                  return toJsonColumnValue(value);
                }
                if (
                  value === '' &&
                  (column.endsWith('_time') || column.endsWith('_date'))
                ) {
                  return null;
                }
                if (value != null && typeof value === 'object') {
                  return JSON.stringify(value);
                }
                return value ?? null;
              }),
            );

            await connection.query(sql, values);
          }
        } finally {
          await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        }
      });
      return;
    } catch (error) {
      if (!isRetryableMysqlError(error) || attempt === 3) {
        throw error;
      }
    }
  }
}

export async function closePool() {
  await pool.end();
}
