import fs from 'node:fs';

function toCamelCase(value) {
  return value.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

function splitSqlValues(input) {
  const values = [];
  let current = '';
  let inQuote = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const nextChar = input[index + 1];

    if (char === "'") {
      if (inQuote && nextChar === "'") {
        current += "''";
        index += 1;
        continue;
      }
      inQuote = !inQuote;
      current += char;
      continue;
    }

    if (char === ',' && !inQuote) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim() !== '') {
    values.push(current.trim());
  }

  return values;
}

function normalizeValue(token) {
  const value = token.trim();

  if (/^null$/i.test(value)) {
    return null;
  }

  if (/^sysdate\(\)$/i.test(value)) {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }

  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return Number(value);
  }

  return value;
}

function parseCreateTableColumns(sql) {
  const columnsByTable = {};
  const rawColumnsByTable = {};
  const jsonColumnsByTable = {};
  const regex = /create table\s+(\w+)\s*\(([\s\S]*?)\)\s*engine=/gi;

  let match = regex.exec(sql);
  while (match) {
    const [, tableName, body] = match;
    const columns = [];
    const rawColumns = [];
    const jsonColumns = [];

    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (
        !trimmed ||
        /^(primary|unique|key|constraint)\s+/i.test(trimmed)
      ) {
        continue;
      }

      const columnMatch = trimmed.match(/^`?([a-zA-Z0-9_]+)`?\s+/);
      if (columnMatch) {
        const rawColumn = columnMatch[1];
        rawColumns.push(rawColumn);
        columns.push(toCamelCase(rawColumn));
        if (/\sjson\b/i.test(trimmed)) {
          jsonColumns.push(rawColumn);
        }
      }
    }

    columnsByTable[tableName] = columns;
    rawColumnsByTable[tableName] = rawColumns;
    jsonColumnsByTable[tableName] = jsonColumns;
    match = regex.exec(sql);
  }

  return { columnsByTable, rawColumnsByTable, jsonColumnsByTable };
}

function parseInsertRows(sql, columnsByTable) {
  const tables = Object.fromEntries(
    Object.keys(columnsByTable).map((tableName) => [tableName, []]),
  );

  const regex = /insert into\s+(\w+)\s+values\s*\(([\s\S]*?)\);/gi;
  let match = regex.exec(sql);

  while (match) {
    const [, tableName, rowString] = match;
    const columns = columnsByTable[tableName];
    if (!columns) {
      match = regex.exec(sql);
      continue;
    }

    const values = splitSqlValues(rowString).map(normalizeValue);
    const row = {};
    columns.forEach((column, index) => {
      row[column] = values[index] ?? null;
    });
    tables[tableName].push(row);

    match = regex.exec(sql);
  }

  return tables;
}

export function loadSqlData(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  const { columnsByTable, rawColumnsByTable, jsonColumnsByTable } = parseCreateTableColumns(sql);
  const tables = parseInsertRows(sql, columnsByTable);
  return { columnsByTable, rawColumnsByTable, jsonColumnsByTable, tables };
}
