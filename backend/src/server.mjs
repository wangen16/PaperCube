import './env.mjs';

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import bcrypt from 'bcryptjs';
import busboy from 'busboy';
import * as Minio from 'minio';
import { pinyin } from 'pinyin-pro';

import { closePool, execute, loadTables, query as dbQuery, replaceTables } from './db.mjs';
import { handleExamModule } from './exam-module.mjs';
import { loadSqlData } from './sql-loader.mjs';

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || '127.0.0.1';
const MINIO_PORT = Number(process.env.MINIO_PORT || 9000);
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === 'true';
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'minioadmin';
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'minioadmin';
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'papercube-oss';
const MINIO_PUBLIC_URL = process.env.MINIO_PUBLIC_URL || `http://${MINIO_ENDPOINT}:${MINIO_PORT}/${MINIO_BUCKET}`;
const STORAGE_DRIVER = process.env.STORAGE_DRIVER === 'local' ? 'local' : 'minio';
const LOCAL_STORAGE_DIR = process.env.LOCAL_STORAGE_DIR || fileURLToPath(new URL('../storage', import.meta.url));
const STORAGE_PUBLIC_URL = process.env.LOCAL_PUBLIC_URL || MINIO_PUBLIC_URL;
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 7200 * 1000);
const SESSION_TABLE = process.env.SESSION_TABLE || 'app_session';

const minioClient = new Minio.Client({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: MINIO_USE_SSL,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

function getLocalObjectPath(objectName) {
  return path.join(LOCAL_STORAGE_DIR, ...objectName.split('/'));
}

async function saveObject(objectName, buffer, mimeType) {
  if (STORAGE_DRIVER === 'local') {
    const targetPath = getLocalObjectPath(objectName);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, buffer);
    return;
  }

  await minioClient.putObject(MINIO_BUCKET, objectName, buffer, buffer.length, {
    'Content-Type': mimeType,
  });
}

async function removeObject(objectName) {
  if (STORAGE_DRIVER === 'local') {
    await fs.rm(getLocalObjectPath(objectName), { force: true });
    return;
  }

  await minioClient.removeObject(MINIO_BUCKET, objectName);
}

async function initStorage() {
  if (STORAGE_DRIVER === 'local') {
    await fs.mkdir(LOCAL_STORAGE_DIR, { recursive: true });
    console.log(`Local storage ready at ${LOCAL_STORAGE_DIR}`);
    return;
  }

  try {
    const exists = await minioClient.bucketExists(MINIO_BUCKET);
    if (!exists) {
      await minioClient.makeBucket(MINIO_BUCKET);
    }
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Action: ['s3:GetObject'],
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Resource: [`arn:aws:s3:::${MINIO_BUCKET}/*`],
        },
      ],
    };
    await minioClient.setBucketPolicy(MINIO_BUCKET, JSON.stringify(policy));
    console.log(`MinIO bucket "${MINIO_BUCKET}" ready with public read policy.`);
  } catch (err) {
    if (err.code !== 'BucketAlreadyOwnedByYou') {
      console.error('Failed to initialize MinIO bucket:', err);
    }
  }
}
initStorage().catch((err) => {
  console.error('Failed to initialize storage:', err);
});

const PORT = Number(process.env.PORT || 6039);
const DEFAULT_TENANT_ID = '000000';
const DEFAULT_LOGIN_PASSWORD = process.env.DEFAULT_LOGIN_PASSWORD || 'admin123';
const DEFAULT_SCHOOL_DEPT_ID = 100;
const SCHOOL_SQL_PATHS = [
  fileURLToPath(new URL('../sql/init.sql', import.meta.url)),
  fileURLToPath(new URL('../sql/school.sql', import.meta.url)),
  fileURLToPath(new URL('../sql/exam.sql', import.meta.url)),
];
const SCHOOL_ROLE_CONFIG = {
  student: {
    roleKey: 'school_student',
    roleName: '学生角色',
    roleSort: 102,
  },
  teacher: {
    roleKey: 'school_teacher',
    roleName: '老师角色',
    roleSort: 101,
  },
};

const rawColumnsByTable = Object.assign(
  {},
  ...SCHOOL_SQL_PATHS.map((filePath) => loadSqlData(filePath).rawColumnsByTable),
);
const jsonColumnsByTable = Object.assign(
  {},
  ...SCHOOL_SQL_PATHS.map((filePath) => loadSqlData(filePath).jsonColumnsByTable),
);
const ALL_TABLES = Object.keys(rawColumnsByTable);
const DEFAULT_POST_DEPT_BY_CODE = {
  ceo: 100,
  hr: 101,
  se: 103,
  user: 105,
};
const state = {
  sessions: new Map(),
  tables: {},
};
let requestQueue = Promise.resolve();

function normalizeSession(token, session) {
  if (!session || typeof session !== 'object') {
    return null;
  }

  const tokenId = String(session.tokenId || token || '');
  const userId = Number(session.userId);
  const loginTime = Number(session.loginTime);

  if (!tokenId || !Number.isFinite(userId) || !Number.isFinite(loginTime)) {
    return null;
  }

  return {
    browser: session.browser || 'Unknown',
    ipaddr: session.ipaddr || '127.0.0.1',
    loginLocation: session.loginLocation || '本地',
    loginTime,
    os: session.os || 'Unknown',
    tokenId,
    userId,
  };
}

function isSessionExpired(session) {
  const loginTime = Number(session?.loginTime);
  if (!Number.isFinite(loginTime)) {
    return true;
  }
  return Date.now() - loginTime >= SESSION_TTL_MS;
}

function removeSessionsByUserIds(userIds) {
  const userIdSet = new Set(userIds.map((item) => Number(item)));
  const removedTokens = [];

  for (const [token, currentSession] of state.sessions.entries()) {
    if (userIdSet.has(Number(currentSession.userId))) {
      state.sessions.delete(token);
      removedTokens.push(token);
    }
  }

  return removedTokens;
}

function pruneExpiredSessionsFromMemory() {
  const removedTokens = [];

  for (const [token, currentSession] of state.sessions.entries()) {
    if (isSessionExpired(currentSession)) {
      state.sessions.delete(token);
      removedTokens.push(token);
    }
  }

  return removedTokens;
}

async function ensureSessionSchema() {
  await execute(`
    CREATE TABLE IF NOT EXISTS \`${SESSION_TABLE}\` (
      \`token_id\` varchar(80) NOT NULL,
      \`user_id\` bigint NOT NULL,
      \`login_time\` bigint NOT NULL,
      \`browser\` varchar(255) DEFAULT '',
      \`ipaddr\` varchar(128) DEFAULT '',
      \`login_location\` varchar(255) DEFAULT '',
      \`os\` varchar(255) DEFAULT '',
      PRIMARY KEY (\`token_id\`),
      KEY \`idx_${SESSION_TABLE}_user_id\` (\`user_id\`),
      KEY \`idx_${SESSION_TABLE}_login_time\` (\`login_time\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);
}

async function deleteSessionsByTokens(tokens) {
  const uniqueTokens = [...new Set(tokens.map((item) => String(item)).filter(Boolean))];
  if (uniqueTokens.length === 0) {
    return;
  }
  const placeholders = uniqueTokens.map(() => '?').join(', ');
  await execute(
    `DELETE FROM \`${SESSION_TABLE}\` WHERE \`token_id\` IN (${placeholders})`,
    uniqueTokens,
  );
}

async function deleteSessionsByUserIdsFromStore(userIds) {
  const uniqueUserIds = [...new Set(userIds.map((item) => Number(item)).filter(Number.isFinite))];
  if (uniqueUserIds.length === 0) {
    return;
  }
  const placeholders = uniqueUserIds.map(() => '?').join(', ');
  await execute(
    `DELETE FROM \`${SESSION_TABLE}\` WHERE \`user_id\` IN (${placeholders})`,
    uniqueUserIds,
  );
}

async function upsertSession(session) {
  const normalized = normalizeSession(session?.tokenId, session);
  if (!normalized) {
    return;
  }
  await execute(
    `
      INSERT INTO \`${SESSION_TABLE}\`
        (\`token_id\`, \`user_id\`, \`login_time\`, \`browser\`, \`ipaddr\`, \`login_location\`, \`os\`)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        \`user_id\` = VALUES(\`user_id\`),
        \`login_time\` = VALUES(\`login_time\`),
        \`browser\` = VALUES(\`browser\`),
        \`ipaddr\` = VALUES(\`ipaddr\`),
        \`login_location\` = VALUES(\`login_location\`),
        \`os\` = VALUES(\`os\`)
    `,
    [
      normalized.tokenId,
      normalized.userId,
      normalized.loginTime,
      normalized.browser,
      normalized.ipaddr,
      normalized.loginLocation,
      normalized.os,
    ],
  );
}

async function refreshSessions() {
  const rows = await dbQuery(
    `SELECT \`token_id\`, \`user_id\`, \`login_time\`, \`browser\`, \`ipaddr\`, \`login_location\`, \`os\` FROM \`${SESSION_TABLE}\``,
  );
  const expiredTokens = [];
  state.sessions.clear();

  for (const row of rows) {
    const session = normalizeSession(row.tokenId, row);
    if (!session || isSessionExpired(session)) {
      if (row.tokenId) {
        expiredTokens.push(String(row.tokenId));
      }
      continue;
    }
    state.sessions.set(session.tokenId, session);
  }

  if (expiredTokens.length > 0) {
    await deleteSessionsByTokens(expiredTokens);
  }
}

async function ensurePostDeptSchema() {
  try {
    await execute(
      "ALTER TABLE `sys_post` ADD COLUMN `dept_id` bigint(20) DEFAULT NULL COMMENT '部门ID' AFTER `post_id`",
    );
  } catch (error) {
    if (error?.code !== 'ER_DUP_FIELDNAME') {
      throw error;
    }
  }

  const posts = await dbQuery('SELECT post_id, post_code, dept_id FROM `sys_post`');
  for (const post of posts) {
    if (post.deptId != null) {
      continue;
    }

    const deptId = DEFAULT_POST_DEPT_BY_CODE[post.postCode] ?? 100;
    await execute('UPDATE `sys_post` SET `dept_id` = ? WHERE `post_id` = ?', [
      deptId,
      post.postId,
    ]);
  }
}

async function refreshTables(tableNames = ALL_TABLES) {
  try {
    const tables = await loadTables(tableNames);
    Object.assign(state.tables, tables);
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      const matched = String(error.sqlMessage || '').match(/Table '.*\.(.+)' doesn't exist/);
      const missingTable = matched?.[1] || 'unknown';
      throw new Error(
        `数据库缺少表 ${missingTable}。如果是刚接入考试模块，请先执行 \`npm run db:init:exam\`；如果当前库还没做完整初始化，请执行 \`npm run db:init\`。`,
      );
    }
    throw error;
  }
}

async function persistTables(tableNames) {
  await replaceTables(tableNames, state.tables, rawColumnsByTable, jsonColumnsByTable);
}

await ensureSessionSchema();
await ensurePostDeptSchema();
await refreshTables();
await refreshSessions();

function now() {
  // 使用北京时间（UTC+8），避免时区差异导致考试时间计算偏差
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function randomId(prefix = '') {
  return `${prefix}${crypto.randomUUID().replaceAll('-', '')}`;
}

function booleanValue(value) {
  return value === true || value === 1 || value === '1';
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanObject(value) {
  if (Array.isArray(value)) {
    return value.map(cleanObject);
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('utf8');
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value).toString('utf8');
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !key.startsWith('_'))
      .map(([key, item]) => [key, cleanObject(item)]),
  );
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(cleanObject(payload)));
}

function sendSuccess(response, data = null, msg = '操作成功') {
  sendJson(response, 200, { code: 200, data, msg });
}

function sendPage(response, rows, total, msg = '查询成功') {
  sendJson(response, 200, { code: 200, msg, rows, total });
}

function sendError(response, code, msg) {
  sendJson(response, 200, { code, data: null, msg });
}

function sendFile(response, filename, content) {
  response.writeHead(200, {
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Content-Type': 'text/csv; charset=utf-8',
  });
  response.end(`\uFEFF${content}`);
}

function normalizeEntries(entries) {
  const result = {};

  for (const [key, value] of entries) {
    const paramsMatch = key.match(/^params\[(.+)\]$/);
    if (paramsMatch) {
      result.params ??= {};
      result.params[paramsMatch[1]] = value;
      continue;
    }

    if (Reflect.has(result, key)) {
      const current = result[key];
      result[key] = Array.isArray(current) ? [...current, value] : [current, value];
      continue;
    }

    result[key] = value;
  }

  return result;
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);
  if (buffer.length === 0) {
    return {};
  }

  const contentType = request.headers['content-type'] || '';
  if (contentType.includes('application/json')) {
    return JSON.parse(buffer.toString('utf8'));
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(buffer.toString('utf8'));
    return normalizeEntries(params.entries());
  }

  if (contentType.includes('multipart/form-data')) {
    return { _raw: buffer };
  }

  return { value: buffer.toString('utf8') };
}

function parseQuery(requestUrl) {
  return normalizeEntries(requestUrl.searchParams.entries());
}

function getToken(request) {
  const authorization = request.headers.authorization || '';
  if (authorization.startsWith('Bearer ')) {
    return authorization.slice(7);
  }
  return '';
}

function getClientIp(request) {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.socket.remoteAddress || '127.0.0.1';
}

function getBrowser(request) {
  const userAgent = request.headers['user-agent'] || 'Node';
  if (typeof userAgent !== 'string') {
    return 'Node';
  }
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Firefox')) return 'Firefox';
  return 'Unknown';
}

function getOperatingSystem(request) {
  const userAgent = request.headers['user-agent'] || 'Node';
  if (typeof userAgent !== 'string') {
    return 'Node';
  }
  if (userAgent.includes('Mac OS')) return 'macOS';
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Linux')) return 'Linux';
  return 'Unknown';
}

function getCurrentSession(request, response) {
  const token = getToken(request);
  const session = state.sessions.get(token);
  if (!session || isSessionExpired(session)) {
    if (session) {
      state.sessions.delete(token);
      deleteSessionsByTokens([token]).catch(console.error);
    }
    sendError(response, 401, '登录状态已失效，请重新登录');
    return null;
  }
  return session;
}

function getTable(name) {
  return state.tables[name];
}

function nextId(tableName, fieldName) {
  const table = getTable(tableName);
  return table.reduce((max, row) => Math.max(max, Number(row[fieldName]) || 0), 0) + 1;
}

function getDeptById(deptId) {
  return getTable('sys_dept').find((item) => Number(item.deptId) === Number(deptId));
}

function getRoleById(roleId) {
  return getTable('sys_role').find((item) => Number(item.roleId) === Number(roleId));
}

function getRoleByKey(roleKey) {
  return getTable('sys_role').find((item) => item.roleKey === roleKey);
}

function getMenuById(menuId) {
  return getTable('sys_menu').find((item) => Number(item.menuId) === Number(menuId));
}

function getUserById(userId) {
  return getTable('sys_user').find((item) => Number(item.userId) === Number(userId));
}

function getUserByName(userName) {
  return getTable('sys_user').find((item) => item.userName === userName);
}

function getPostById(postId) {
  return getTable('sys_post').find((item) => Number(item.postId) === Number(postId));
}

function getTeacherById(teacherId) {
  return getTable('teacher').find((item) => Number(item.teacherId) === Number(teacherId));
}

function getClassRoomById(classId) {
  return getTable('class_room').find((item) => Number(item.classId) === Number(classId));
}

function getStudentById(studentId) {
  return getTable('student').find((item) => Number(item.studentId) === Number(studentId));
}

function getUserRoleIds(userId) {
  return getTable('sys_user_role')
    .filter((item) => Number(item.userId) === Number(userId))
    .map((item) => Number(item.roleId));
}

function getUserPostIds(userId) {
  return getTable('sys_user_post')
    .filter((item) => Number(item.userId) === Number(userId))
    .map((item) => Number(item.postId));
}

function getRoleMenuIds(roleIds) {
  if (roleIds.some((item) => Number(item) === 1)) {
    return getSortedMenus().map((item) => Number(item.menuId));
  }
  const idSet = new Set(roleIds.map((item) => Number(item)));
  return getTable('sys_role_menu')
    .filter((item) => idSet.has(Number(item.roleId)))
    .map((item) => Number(item.menuId));
}

function getRoleDeptIds(roleId) {
  return getTable('sys_role_dept')
    .filter((item) => Number(item.roleId) === Number(roleId))
    .map((item) => Number(item.deptId));
}

function buildAncestors(parentId) {
  if (!parentId || Number(parentId) === 0) {
    return '0';
  }
  const parent = getDeptById(parentId);
  if (!parent) {
    return '0';
  }
  return `${parent.ancestors},${parent.deptId}`;
}

function attachDeptInfo(user) {
  const dept = getDeptById(user.deptId);
  return {
    ...user,
    dept: dept ? mapDept(dept) : undefined,
    deptName: dept?.deptName ?? '',
    tenantId: DEFAULT_TENANT_ID,
  };
}

function mapRole(role, userRoleIds = []) {
  return {
    ...role,
    createTime: role.createTime || now(),
    deptCheckStrictly: booleanValue(role.deptCheckStrictly),
    flag: userRoleIds.includes(Number(role.roleId)),
    menuCheckStrictly: booleanValue(role.menuCheckStrictly),
    superAdmin: Number(role.roleId) === 1,
  };
}

function mapDept(dept) {
  return {
    ...dept,
    children: undefined,
    createTime: dept.createTime || now(),
    parentName: getDeptById(dept.parentId)?.deptName,
  };
}

function mapPost(post) {
  const dept = getDeptById(post.deptId);
  return {
    ...post,
    createTime: post.createTime || now(),
    deptName: dept?.deptName ?? '',
  };
}

function mapTeacher(teacher) {
  const user = getUserById(teacher.userId);
  return {
    ...teacher,
    createTime: teacher.createTime || now(),
    email: user?.email || '',
    phonenumber: user?.phonenumber || '',
    sex: user?.sex || '0',
    userId: Number(teacher.userId),
    userName: user?.userName || '',
  };
}

function mapClassRoom(classRoom) {
  const teacher = getTeacherById(classRoom.teacherId);
  return {
    ...classRoom,
    createTime: classRoom.createTime || now(),
    teacherName: teacher?.teacherName || '',
  };
}

function mapStudent(student) {
  const user = getUserById(student.userId);
  const classRoom = student.classId ? getClassRoomById(student.classId) : null;
  return {
    ...student,
    birthday: student.birthday || '',
    classId: student.classId == null ? null : Number(student.classId),
    className: classRoom?.className || '',
    createTime: student.createTime || now(),
    email: user?.email || '',
    phonenumber: user?.phonenumber || '',
    sex: user?.sex || '0',
    userId: Number(student.userId),
    userName: user?.userName || '',
  };
}

function mapUser(user) {
  const { _plainPassword, password, ...rest } = user;
  const roleIds = getUserRoleIds(user.userId);
  const postIds = getUserPostIds(user.userId);
  const roles = getTable('sys_role')
    .filter((item) => roleIds.includes(Number(item.roleId)))
    .map((item) => mapRole(item, roleIds));

  return {
    ...attachDeptInfo(rest),
    avatar: user.avatar || '',
    createTime: user.createTime || now(),
    kroleGroupIds: '',
    kroleGroupType: 'role',
    loginDate: user.loginDate || '',
    loginIp: user.loginIp || '',
    postIds,
    roleId: roleIds[0] ? String(roleIds[0]) : '',
    roleIds: roleIds.map(String),
    roles,
  };
}

function mapMenu(menu) {
  return {
    ...menu,
    children: undefined,
    createTime: menu.createTime || now(),
    parentName: getMenuById(menu.parentId)?.menuName,
  };
}

function mapDictType(dictType) {
  return {
    ...dictType,
    createTime: dictType.createTime || now(),
  };
}

function mapDictData(dictData) {
  return {
    ...dictData,
    createTime: dictData.createTime || now(),
    cssClass: dictData.cssClass || '',
    default: dictData.isDefault === 'Y',
    updateTime: dictData.updateTime || '',
  };
}

function mapConfig(config) {
  return {
    ...config,
    createTime: config.createTime || now(),
  };
}

function mapNotice(notice) {
  let noticeContent = '';
  if (typeof notice.noticeContent === 'string') {
    noticeContent = notice.noticeContent;
  } else if (Buffer.isBuffer(notice.noticeContent)) {
    noticeContent = notice.noticeContent.toString('utf8');
  } else if (notice.noticeContent instanceof Uint8Array) {
    noticeContent = Buffer.from(notice.noticeContent).toString('utf8');
  } else if (
    notice.noticeContent &&
    typeof notice.noticeContent === 'object' &&
    Array.isArray(notice.noticeContent.data)
  ) {
    noticeContent = Buffer.from(notice.noticeContent.data).toString('utf8');
  }

  return {
    ...notice,
    createByName: notice.createBy,
    createTime: notice.createTime || now(),
    noticeContent,
  };
}

function mapOperLog(log) {
  return {
    ...log,
    operTime: log.operTime || log.createTime || now(),
    tenantId: DEFAULT_TENANT_ID,
  };
}

function mapLoginInfo(log) {
  return {
    ...log,
    loginTime: log.loginTime || now(),
    tenantId: DEFAULT_TENANT_ID,
  };
}

function mapJob(job) {
  return {
    ...job,
    createTime: job.createTime || now(),
    updateTime: job.updateTime || '',
  };
}

function isSupportedMenu(menu) {
  const component = menu.component || '';
  const supportedComponents = new Set([
    'exam/knowledge-category/index',
    'exam/question/index',
    'exam/paper/index',
    'exam/manage/index',
    'exam/grading/index',
    'exam/score/index',
    'exam/my-paper/index',
    'school/teacher/index',
    'school/class-room/index',
    'school/student/index',
    'system/user/index',
    'system/role/index',
    'system/menu/index',
    'system/dept/index',
    'system/post/index',
    'system/dict/index',
    'system/config/index',
    'system/notice/index',
    'system/operlog/index',
    'system/logininfor/index',
    'monitor/online/index',
    'monitor/job/index',
  ]);

  const supportedPermPrefixes = [
    'exam:knowledgeCategory:',
    'exam:question:',
    'exam:paper:',
    'exam:manage:',
    'exam:grading:',
    'exam:score:',
    'exam:myPaper:',
    'school:teacher:',
    'school:classRoom:',
    'school:student:',
    'system:user:',
    'system:role:',
    'system:menu:',
    'system:dept:',
    'system:post:',
    'system:dict:',
    'system:config:',
    'system:notice:',
    'system:operlog:',
    'system:logininfor:',
    'monitor:online:',
    'monitor:job:',
  ];

  if (supportedComponents.has(component)) {
    return true;
  }

  if (menu.menuType === 'F') {
    return supportedPermPrefixes.some((prefix) => String(menu.perms || '').startsWith(prefix));
  }

  return [1, 2, 108].includes(Number(menu.menuId)) || ['exam', 'school'].includes(String(menu.path || ''));
}

function getSupportedMenus() {
  return getTable('sys_menu')
    .filter((item) => isSupportedMenu(item))
    .sort((left, right) => Number(left.orderNum) - Number(right.orderNum));
}

function getSortedMenus() {
  return getTable('sys_menu').sort(
    (left, right) => Number(left.orderNum || 0) - Number(right.orderNum || 0),
  );
}

function buildTree(list, idField, parentField, rootValue = 0) {
  const map = new Map(list.map((item) => [Number(item[idField]), { ...item, children: [] }]));
  const roots = [];

  for (const item of map.values()) {
    const parentId = Number(item[parentField] || 0);
    if (parentId === Number(rootValue) || !map.has(parentId)) {
      roots.push(item);
      continue;
    }
    map.get(parentId).children.push(item);
  }

  for (const item of map.values()) {
    item.children.sort((left, right) => Number(left.orderNum || 0) - Number(right.orderNum || 0));
  }

  roots.sort((left, right) => Number(left.orderNum || 0) - Number(right.orderNum || 0));
  return roots;
}

function makeMenuOption(menu) {
  return {
    children: [],
    icon: menu.icon,
    id: Number(menu.menuId),
    key: String(menu.menuId),
    label: menu.menuName,
    menuType: menu.menuType,
    parentId: Number(menu.parentId),
    weight: Number(menu.orderNum || 0),
  };
}

function buildMenuTreeOptions() {
  return buildTree(getSortedMenus().map(makeMenuOption), 'id', 'parentId', 0);
}

function buildDeptTreeOptions() {
  const items = getTable('sys_dept').map((dept) => ({
    children: [],
    id: Number(dept.deptId),
    key: String(dept.deptId),
    label: dept.deptName,
    parentId: Number(dept.parentId),
    weight: Number(dept.orderNum || 0),
  }));
  return buildTree(items, 'id', 'parentId', 0);
}

function makeRouterMenu(menu, children) {
  const hasChildren = children.length > 0;
  const component =
    menu.menuType === 'M'
      ? menu.parentId === 0
        ? 'Layout'
        : 'ParentView'
      : menu.component || 'ParentView';

  const routePath = menu.isFrame === 0 ? menu.path : menu.path;
  return {
    alwaysShow: hasChildren,
    children,
    component,
    hidden: menu.visible === '1',
    meta: {
      icon: menu.icon,
      link: menu.isFrame === 0 ? menu.path : undefined,
      noCache: menu.isCache === 1,
      title: menu.menuName,
    },
    name:
      menu.routeName ||
      String(menu.path || menu.menuName)
        .replaceAll('/', '-')
        .replaceAll(':', '-')
        .replaceAll('.', '-'),
    path: routePath,
    query: menu.query || '',
    redirect: hasChildren ? children[0]?.path : undefined,
  };
}

function buildRoutersForMenus(menuIds) {
  const allowedIds = new Set(menuIds.map(Number));
  
  // 1. 获取所有支持的、正常状态的、非按钮的目录/菜单
  const candidateMenus = getSupportedMenus()
    .filter((item) => item.menuType !== 'F')
    .filter((item) => item.status === '0');

  // 2. 组装完整树形结构
  const tree = buildTree(candidateMenus, 'menuId', 'parentId', 0);
  
  // 3. 自底向上剔除无权限的节点（不包含任何保留子树的父节点一并剔除）
  const walk = (menuNodes) =>
    menuNodes
      .map((menu) => {
        const children = walk(menu.children || []);
        
        // 如果当前节点本身不在授权列表，且没有任何被授权的子代，则安全剪枝
        if (!allowedIds.has(Number(menu.menuId)) && children.length === 0) {
          return null;
        }
        
        return makeRouterMenu(menu, children);
      })
      .filter(Boolean);

  return walk(tree);
}

function getUserPermissions(userId) {
  const roleIds = getUserRoleIds(userId);
  const menuIds = getRoleMenuIds(roleIds);
  const permissionSet = new Set();

  for (const menu of getSupportedMenus()) {
    if (!menu.perms || !menuIds.includes(Number(menu.menuId))) {
      continue;
    }
    permissionSet.add(menu.perms);

    if (menu.perms.startsWith('system:operlog:')) {
      permissionSet.add(menu.perms.replace('system:', 'monitor:'));
    }
    if (menu.perms.startsWith('system:logininfor:')) {
      permissionSet.add(menu.perms.replace('system:', 'monitor:'));
    }
  }

  return [...permissionSet];
}

function getUserRoleKeys(userId) {
  const roles = getTable('sys_role').filter((item) => getUserRoleIds(userId).includes(Number(item.roleId)));
  const keys = roles.map((item) => item.roleKey);
  if (roles.some((item) => Number(item.roleId) === 1)) {
    keys.push('superadmin');
  }
  return [...new Set(keys)];
}

async function verifyPassword(user, password) {
  if (!user?.password) {
    return false;
  }
  return bcrypt.compare(String(password || ''), user.password);
}

function addLoginLog({
  browser,
  ipaddr,
  loginLocation = '本地',
  msg,
  os,
  status,
  userName,
}) {
  getTable('sys_logininfor').unshift({
    browser,
    infoId: nextId('sys_logininfor', 'infoId'),
    ipaddr,
    loginLocation,
    loginTime: now(),
    msg,
    os,
    status,
    userName,
  });
}

function addOperLog({
  businessType = 0,
  errorMsg = '',
  method = '',
  operName = 'admin',
  operParam = '',
  operUrl = '',
  requestMethod = 'GET',
  session,
  status = 0,
  title,
}) {
  const user = session ? getUserById(session.userId) : null;
  const dept = user ? getDeptById(user.deptId) : null;
  getTable('sys_oper_log').unshift({
    businessType,
    costTime: 0,
    deptName: dept?.deptName || '',
    errorMsg,
    jsonResult: '',
    method,
    operId: nextId('sys_oper_log', 'operId'),
    operIp: session?.ipaddr || '127.0.0.1',
    operLocation: '本地',
    operName,
    operParam,
    operTime: now(),
    operUrl,
    operatorType: 1,
    requestMethod,
    status,
    title,
  });
}

function paginate(rows, query = {}) {
  const pageNum = Math.max(toInt(query.pageNum, 1), 1);
  const pageSize = Math.max(toInt(query.pageSize, rows.length || 10), 1);
  const start = (pageNum - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    total: rows.length,
  };
}

function includesText(source, target) {
  if (!target) {
    return true;
  }
  return String(source ?? '').toLowerCase().includes(String(target).toLowerCase());
}

function applyDateRange(rows, field, params = {}) {
  const beginTime = params.beginTime;
  const endTime = params.endTime;
  if (!beginTime && !endTime) {
    return rows;
  }

  return rows.filter((item) => {
    const value = new Date(item[field] || 0).getTime();
    if (beginTime && value < new Date(beginTime).getTime()) {
      return false;
    }
    if (endTime && value > new Date(endTime).getTime()) {
      return false;
    }
    return true;
  });
}

function applySort(rows, query) {
  const orderFields = String(query.orderByColumn || '')
    .split(',')
    .filter(Boolean);
  const orderValues = String(query.isAsc || '')
    .split(',')
    .filter(Boolean);

  if (orderFields.length === 0) {
    return rows;
  }

  return [...rows].sort((left, right) => {
    for (let index = 0; index < orderFields.length; index += 1) {
      const field = orderFields[index];
      const direction = orderValues[index] === 'desc' ? -1 : 1;
      const leftValue = left[field];
      const rightValue = right[field];
      if (leftValue === rightValue) {
        continue;
      }
      return leftValue > rightValue ? direction : -direction;
    }
    return 0;
  });
}

function csvFromRows(rows) {
  if (rows.length === 0) {
    return 'empty\n';
  }

  const headers = [...new Set(rows.flatMap((row) => Object.keys(cleanObject(row))))];
  const escapeCell = (value) => {
    const text = String(value ?? '');
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
  };

  const body = rows.map((row) => headers.map((header) => escapeCell(row[header])).join(','));
  return [headers.join(','), ...body].join('\n');
}

function defaultSchoolStatus(query) {
  if (!Reflect.has(query, 'status')) {
    return '0';
  }

  if (query.status === '' || query.status == null) {
    return null;
  }

  return String(query.status);
}

function defaultPassword() {
  const config = getTable('sys_config').find(
    (item) => item.configKey === 'sys.user.initPassword',
  );
  return config?.configValue || DEFAULT_LOGIN_PASSWORD;
}

function normalizeAccountBase(name) {
  const base = pinyin(String(name || ''), {
    toneType: 'none',
    type: 'array',
  })
    .join('')
    .replaceAll(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

  if (base) {
    return base;
  }

  const fallback = String(name || '')
    .replaceAll(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
  return fallback || 'user';
}

function generateSchoolUserName(name) {
  const baseName = normalizeAccountBase(name);
  let candidate = baseName;
  let suffix = 1;

  while (getUserByName(candidate)) {
    candidate = `${baseName}${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function ensureSchoolRole(type) {
  const roleConfig = SCHOOL_ROLE_CONFIG[type];
  let role = getRoleByKey(roleConfig.roleKey);
  let created = false;

  if (!role) {
    role = {
      createBy: 'admin',
      createTime: now(),
      dataScope: '1',
      delFlag: '0',
      deptCheckStrictly: 1,
      menuCheckStrictly: 1,
      remark: `${roleConfig.roleName}自动创建`,
      roleId: nextId('sys_role', 'roleId'),
      roleKey: roleConfig.roleKey,
      roleName: roleConfig.roleName,
      roleSort: roleConfig.roleSort,
      status: '0',
      updateBy: '',
      updateTime: '',
    };
    getTable('sys_role').push(role);
    created = true;
  }

  return {
    created,
    roleId: Number(role.roleId),
  };
}

async function createSchoolUser({ email, name, phonenumber, sex, status, type, userName }) {
  const { created, roleId } = ensureSchoolRole(type);
  const userId = nextId('sys_user', 'userId');

  getTable('sys_user').push({
    avatar: '',
    createBy: 'admin',
    createTime: now(),
    delFlag: '0',
    deptId: DEFAULT_SCHOOL_DEPT_ID,
    email: email || '',
    loginDate: '',
    loginIp: '',
    nickName: name,
    password: await bcrypt.hash(defaultPassword(), 10),
    phonenumber: phonenumber || '',
    pwdUpdateDate: now(),
    remark: '',
    sex: sex || '0',
    status: status || '0',
    updateBy: '',
    updateTime: '',
    userId,
    userName: userName || generateSchoolUserName(name),
    userType: '00',
  });
  getTable('sys_user_role').push({ roleId, userId });

  return {
    createdRole: created,
    roleId,
    userId,
  };
}

function syncSchoolUser(userId, updates) {
  const user = getUserById(userId);
  if (!user) {
    return;
  }

  Object.assign(user, {
    email: updates.email ?? user.email,
    nickName: updates.nickName ?? user.nickName,
    phonenumber: updates.phonenumber ?? user.phonenumber,
    sex: updates.sex ?? user.sex,
    status: updates.status ?? user.status,
    userName: updates.userName ?? user.userName,
    updateBy: 'admin',
    updateTime: now(),
  });
}

function removeUserCascade(userId) {
  removeIds('sys_user', 'userId', [userId]);
  state.tables.sys_user_role = getTable('sys_user_role').filter(
    (item) => Number(item.userId) !== Number(userId),
  );
  state.tables.sys_user_post = getTable('sys_user_post').filter(
    (item) => Number(item.userId) !== Number(userId),
  );
  return removeSessionsByUserIds([userId]);
}

function removeIds(tableName, fieldName, ids) {
  const table = getTable(tableName);
  const idSet = new Set(ids.map((item) => Number(item)));
  state.tables[tableName] = table.filter((item) => !idSet.has(Number(item[fieldName])));
}

function getRequestPayload(requestUrl, body) {
  return {
    ...parseQuery(requestUrl),
    ...body,
  };
}

async function runSerial(handler) {
  const task = requestQueue.then(handler, handler);
  requestQueue = task.catch(() => {});
  return task;
}

const server = http.createServer(async (request, response) => {
  await runSerial(async () => {
    try {
      const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
      const pathname = requestUrl.pathname;
      const method = request.method || 'GET';

      if (method === 'OPTIONS') {
        response.writeHead(204);
        response.end();
        return;
      }

      if (pathname === '/healthz' && method === 'GET') {
        sendSuccess(response, { status: 'ok' });
        return;
      }

      if (pathname === '/resource/oss/upload' && method === 'POST') {
        const bb = busboy({ headers: request.headers });
        const uploadPromises = [];
        const session = state.sessions.get(getToken(request));
        const uploaderId = session ? session.userId : null;

        bb.on('file', (name, file, info) => {
          const { filename, mimeType } = info;
          const ext = filename.includes('.') ? filename.substring(filename.lastIndexOf('.')) : '';
          const newFilename = `${crypto.randomUUID().replace(/-/g, '')}${ext}`;
          const current = new Date();
          const year = current.getFullYear();
          const month = String(current.getMonth() + 1).padStart(2, '0');
          const day = String(current.getDate()).padStart(2, '0');
          const objectName = `upload/${year}/${month}/${day}/${newFilename}`;
          
          const uploadPromise = new Promise((resolve, reject) => {
            const fileChunks = [];
            file.on('data', data => fileChunks.push(data));
            file.on('end', async () => {
              const buffer = Buffer.concat(fileChunks);
              try {
                await saveObject(objectName, buffer, mimeType);
                
                const ossId = nextId('attachment', 'attachmentId');
                const fileUrl = `${STORAGE_PUBLIC_URL}/${objectName}`;
                getTable('attachment').push({
                  attachmentId: ossId,
                  bucketName: MINIO_BUCKET,
                  createBy: uploaderId || 'admin',
                  createTime: now(),
                  delFlag: '0',
                  fileName: filename,
                  fileType: ext.substring(1) || 'unknown',
                  fileUrl: fileUrl,
                  objectName: objectName,
                  remark: '',
                  updateBy: '',
                  updateTime: '',
                  uploaderId: uploaderId,
                });
                
                resolve({
                  ossId: ossId,
                  url: fileUrl,
                  fileName: filename,
                  originalName: filename,
                  objectName: objectName,
                });
              } catch (err) {
                console.error('MinIO upload error:', err);
                reject(err);
              }
            });
          });
          uploadPromises.push(uploadPromise);
        });

        bb.on('close', async () => {
          try {
            const results = await Promise.all(uploadPromises);
            if (results.length > 0) {
              persistTables(['attachment']).catch(console.error);
              sendSuccess(response, results[0]);
            } else {
              sendError(response, 400, 'No file uploaded');
            }
          } catch (err) {
            sendError(response, 500, 'Upload Failed');
          }
        });

        request.pipe(bb);
        return;
      }

      if (pathname === '/system/user/profile/avatar' && method === 'POST') {
        const session = getCurrentSession(request, response);
        if (!session) return;

        return new Promise((resolve) => {
          const bb = busboy({ headers: request.headers });
          let avatarUrl = '';

          bb.on('file', (name, file, info) => {
            if (name !== 'avatarfile') {
              file.resume();
              return;
            }
            const { filename, mimeType } = info;
            const ext = path.extname(filename) || '.png';
            const objectName = `avatar/${session.userId}_${Date.now()}${ext}`;

            const chunks = [];
            file.on('data', (d) => chunks.push(d));
            file.on('end', async () => {
              const buffer = Buffer.concat(chunks);
              try {
                await saveObject(objectName, buffer, mimeType);
                avatarUrl = `${STORAGE_PUBLIC_URL}/${objectName}`;
              } catch (err) {
                console.error('Failed to save avatar:', err);
              }
            });
          });

          bb.on('close', async () => {
             if (avatarUrl) {
              const table = getTable('sys_user');
              const idx = table.findIndex((u) => Number(u.userId) === Number(session.userId));
              if (idx >= 0) {
                table[idx].avatar = avatarUrl;
                await persistTables(['sys_user']);
              }
              sendSuccess(response, { imgUrl: avatarUrl }, '头像上传成功');
            } else {
              sendError(response, 500, '头像上传失败');
            }
            resolve();
          });

          request.pipe(bb);
        });
      }

      const body = ['POST', 'PUT', 'PATCH'].includes(method) ? await readBody(request) : {};
      const query = parseQuery(requestUrl);

      await refreshTables();
      await refreshSessions();
      const expiredTokens = pruneExpiredSessionsFromMemory();
      if (expiredTokens.length > 0) {
        await deleteSessionsByTokens(expiredTokens);
      }

      if (pathname === '/auth/code' && method === 'GET') {
        sendSuccess(response, {
          captchaEnabled: false,
          img: '',
          uuid: randomId('captcha_'),
        });
        return;
      }

      if (pathname === '/auth/tenant/list' && method === 'GET') {
        sendSuccess(response, { tenantEnabled: false, voList: [] });
        return;
      }

      if (pathname === '/auth/login' && method === 'POST') {
        const user = getUserByName(body.username);
        const ipaddr = getClientIp(request);
        const browser = getBrowser(request);
        const os = getOperatingSystem(request);

        if (!user || !(await verifyPassword(user, body.password))) {
          addLoginLog({
            browser,
            ipaddr,
            msg: '用户名或密码错误',
            os,
            status: '1',
            userName: body.username || 'unknown',
          });
          await persistTables(['sys_logininfor']);
          sendError(response, 500, '用户名或密码错误');
          return;
        }

        if (user.status !== '0') {
          addLoginLog({
            browser,
            ipaddr,
            msg: '账号已停用',
            os,
            status: '1',
            userName: user.userName,
          });
          await persistTables(['sys_logininfor']);
          sendError(response, 500, '账号已停用');
          return;
        }

        const token = randomId('token_');
        state.sessions.set(token, {
          browser,
          ipaddr,
          loginLocation: '本地',
          loginTime: Date.now(),
          os,
          tokenId: token,
          userId: Number(user.userId),
        });
        await upsertSession(state.sessions.get(token));

        user.loginDate = now();
        user.loginIp = ipaddr;

        addLoginLog({
          browser,
          ipaddr,
          msg: '登录成功',
          os,
          status: '0',
          userName: user.userName,
        });
        await persistTables(['sys_logininfor', 'sys_user']);

        sendSuccess(response, {
          access_token: token,
          client_id: request.headers.clientid || 'papercube-admin',
          expire_in: 7200,
        }, '登录成功');
        return;
      }

      if (pathname === '/auth/logout' && method === 'POST') {
        const token = getToken(request);
        const session = state.sessions.get(token);
        if (session) {
          state.sessions.delete(token);
          await deleteSessionsByTokens([token]);
        }
        sendSuccess(response, null, '退出成功');
        return;
      }

      if (pathname === '/auth/codes' && method === 'GET') {
        const session = getCurrentSession(request, response);
        if (!session) return;
        sendSuccess(response, getUserPermissions(session.userId));
        return;
      }

      if (pathname === '/resource/sse/close' && method === 'GET') {
        sendSuccess(response);
        return;
      }

      const session = getCurrentSession(request, response);
      if (!session) {
        return;
      }

      if (
        await handleExamModule({
          body,
          buildTree,
          getClassRoomById,
          getTable,
          getUserById,
          includesText,
          method,
          nextId,
          now,
          paginate,
          pathname,
          persistTables,
          query,
          response,
          sendError,
          sendFile,
          sendPage,
          sendSuccess,
          session,
          state,
        })
      ) {
        return;
      }

      if (pathname === '/system/user/getInfo' && method === 'GET') {
        sendSuccess(response, {
          permissions: getUserPermissions(session.userId),
          roles: getUserRoleKeys(session.userId),
          user: mapUser(getUserById(session.userId)),
        });
        return;
      }

      if (pathname === '/system/user/profile' && method === 'GET') {
        const user = mapUser(getUserById(session.userId));
        const roleGroup = user.roles.map((item) => item.roleName).join(',');
        const postGroup = user.postIds.map((id) => getPostById(id)?.postName).filter(Boolean).join(',');

        sendSuccess(response, {
          postGroup,
          roleGroup,
          user,
        });
        return;
      }

      if (pathname === '/system/user/profile' && method === 'PUT') {
        const { email, phonenumber, sex, nickName } = body;
        
        const table = getTable('sys_user');
        const userCodeIndex = table.findIndex(u => Number(u.userId) === Number(session.userId));
        if (userCodeIndex >= 0) {
          if (email !== undefined) table[userCodeIndex].email = String(email);
          if (phonenumber !== undefined) table[userCodeIndex].phonenumber = String(phonenumber);
          if (sex !== undefined) table[userCodeIndex].sex = String(sex);
          if (nickName !== undefined) table[userCodeIndex].nickName = String(nickName);
          await persistTables(['sys_user']);
        }
        sendSuccess(response, null, '个人信息修改成功');
        return;
      }

      if (pathname === '/system/user/profile/updatePwd' && method === 'PUT') {
        const { oldPassword, newPassword } = body;
        const table = getTable('sys_user');
        const userCodeIndex = table.findIndex(u => Number(u.userId) === Number(session.userId));
        if (userCodeIndex >= 0) {
          const user = table[userCodeIndex];
          const isValid = await bcrypt.compare(oldPassword, user.password);
          if (!isValid) {
            sendError(response, 500, '修改密码失败，旧密码错误');
            return;
          }
          table[userCodeIndex].password = await bcrypt.hash(newPassword, 10);
          await persistTables(['sys_user']);
        }
        sendSuccess(response, null, '密码修改成功');
        return;
      }



      if (pathname === '/dashboard/stats' && method === 'GET') {
        const users = getTable('sys_user').filter(u => u.delFlag !== '2').length;
        const questions = getTable('question').filter(q => q.delFlag !== '2').length;
        const papers = getTable('exam_paper').filter(p => p.delFlag !== '2').length;
        const records = getTable('exam_paper_snapshot').filter(s => s.delFlag !== '2').length;
        
        // 模拟趋势数据 (近7天)，基于真实数量的波动
        const trends = Array.from({length: 7}).map((_, i) => {
           const date = new Date(Date.now() - (6 - i) * 86400000).toISOString().split('T')[0];
           return {
             date,
             activeUsers: Math.floor(users * (0.1 + Math.random() * 0.2)),
             examsTaken: Math.floor(records * (0.05 + Math.random() * 0.1)) || (Math.floor(Math.random() * 5)),
           };
        });

        // 题型分布
        const typeMap = {};
        getTable('question').filter(q => q.delFlag !== '2').forEach(q => {
          typeMap[q.questionType] = (typeMap[q.questionType] || 0) + 1;
        });

        sendSuccess(response, {
          overview: { users, questions, papers, records },
          trends,
          typeDistribution: typeMap
        });
        return;
      }

      if (pathname === '/system/menu/getRouters' && method === 'GET') {
        const roleMenuIds = getRoleMenuIds(getUserRoleIds(session.userId));
        sendSuccess(response, buildRoutersForMenus(roleMenuIds));
        return;
      }

      if (pathname === '/system/user/list' && method === 'GET') {
        let rows = getTable('sys_user').map(mapUser);
        rows = rows.filter((item) => includesText(item.userName, query.userName));
        rows = rows.filter((item) => includesText(item.phonenumber, query.phonenumber));
        rows = rows.filter((item) => includesText(item.nickName, query.nickName));
        if (query.status) {
          rows = rows.filter((item) => item.status === query.status);
        }
        if (query.deptId) {
          rows = rows.filter((item) => Number(item.deptId) === Number(query.deptId));
        }
        rows = applyDateRange(rows, 'createTime', query.params);
        const result = paginate(rows, query);
        sendPage(response, result.rows, result.total);
        return;
      }

      if (pathname === '/system/user/export' && method === 'POST') {
        const rows = getTable('sys_user').map(mapUser);
        sendFile(response, 'users.csv', csvFromRows(rows));
        return;
      }

      if (pathname === '/system/user/importTemplate' && method === 'POST') {
        sendFile(response, 'user-import-template.csv', 'userName,nickName,deptId,phonenumber,email,status\n');
        return;
      }

      if (pathname === '/system/user/importData' && method === 'POST') {
        sendJson(response, 200, {
          code: 200,
          msg: '已接收导入请求，当前 Node 后端未解析 Excel 内容。',
        });
        return;
      }

      if (pathname === '/system/user/deptTree' && method === 'GET') {
        sendSuccess(response, buildDeptTreeOptions());
        return;
      }

      let matched = pathname.match(/^\/system\/user\/list\/dept\/(\d+)$/);
      if (matched && method === 'GET') {
        const deptId = Number(matched[1]);
        const rows = getTable('sys_user')
          .filter((item) => Number(item.deptId) === deptId)
          .map(mapUser);
        sendSuccess(response, rows);
        return;
      }

      if (pathname === '/system/user/' && method === 'GET') {
        sendSuccess(response, {
          posts: getTable('sys_post').map(mapPost),
          roles: getTable('sys_role').map((item) => mapRole(item)),
        });
        return;
      }

      matched = pathname.match(/^\/system\/user\/authRole\/(\d+)$/);
      if (matched && method === 'GET') {
        const userId = Number(matched[1]);
        sendSuccess(response, {
          roleIds: getUserRoleIds(userId),
          roles: getTable('sys_role').map((item) => mapRole(item, getUserRoleIds(userId))),
          user: mapUser(getUserById(userId)),
        });
        return;
      }

    if (pathname === '/system/user/authRole' && method === 'PUT') {
      const userId = Number(body.userId);
      const roleIds = (body.roleIds || []).map(Number);
      state.tables.sys_user_role = getTable('sys_user_role').filter((item) => Number(item.userId) !== userId);
      for (const roleId of roleIds) {
        state.tables.sys_user_role.push({ roleId, userId });
      }
      addOperLog({
        method: 'userAuthRoleUpdate',
        operParam: JSON.stringify(body),
        operUrl: pathname,
        requestMethod: method,
        session,
        title: '用户角色授权',
      });
      await persistTables(['sys_user_role', 'sys_oper_log']);
      sendSuccess(response);
      return;
    }

    matched = pathname.match(/^\/system\/user\/(\d+)$/);
    if (matched && method === 'GET') {
      const userId = Number(matched[1]);
      const user = getUserById(userId);
      if (!user) {
        sendError(response, 404, '用户不存在');
        return;
      }
      sendSuccess(response, {
        postIds: getUserPostIds(userId),
        posts: getTable('sys_post').map(mapPost),
        roleIds: getUserRoleIds(userId).map(String),
        roles: getTable('sys_role').map((item) => mapRole(item, getUserRoleIds(userId))),
        user: mapUser(user),
      });
      return;
    }

    if (pathname === '/system/user' && method === 'POST') {
      const userId = nextId('sys_user', 'userId');
      const rawPassword = body.password || DEFAULT_LOGIN_PASSWORD;
      const user = {
        avatar: '',
        createBy: 'admin',
        createTime: now(),
        delFlag: '0',
        deptId: Number(body.deptId || 100),
        email: body.email || '',
        loginDate: '',
        loginIp: '',
        nickName: body.nickName || body.userName,
        password: await bcrypt.hash(rawPassword, 10),
        phonenumber: body.phonenumber || '',
        pwdUpdateDate: now(),
        remark: body.remark || '',
        sex: body.sex || '0',
        status: body.status || '0',
        updateBy: '',
        updateTime: '',
        userId,
        userName: body.userName,
        userType: body.userType || '00',
      };
      getTable('sys_user').push(user);
      for (const roleId of body.roleIds || []) {
        getTable('sys_user_role').push({ roleId: Number(roleId), userId });
      }
      for (const postId of body.postIds || []) {
        getTable('sys_user_post').push({ postId: Number(postId), userId });
      }
      addOperLog({
        businessType: 1,
        method: 'userAdd',
        operParam: JSON.stringify(body),
        operUrl: pathname,
        requestMethod: method,
        session,
        title: '用户管理',
      });
      await persistTables(['sys_user', 'sys_user_role', 'sys_user_post', 'sys_oper_log']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/system/user' && method === 'PUT') {
      const user = getUserById(body.userId);
      if (!user) {
        sendError(response, 404, '用户不存在');
        return;
      }
      Object.assign(user, {
        deptId: Number(body.deptId ?? user.deptId),
        email: body.email ?? user.email,
        nickName: body.nickName ?? user.nickName,
        phonenumber: body.phonenumber ?? user.phonenumber,
        remark: body.remark ?? user.remark,
        sex: body.sex ?? user.sex,
        status: body.status ?? user.status,
        updateBy: 'admin',
        updateTime: now(),
      });
      if (body.password) {
        user.password = await bcrypt.hash(body.password, 10);
        user.pwdUpdateDate = now();
      }
      state.tables.sys_user_role = getTable('sys_user_role').filter((item) => Number(item.userId) !== Number(user.userId));
      for (const roleId of body.roleIds || []) {
        getTable('sys_user_role').push({ roleId: Number(roleId), userId: Number(user.userId) });
      }
      state.tables.sys_user_post = getTable('sys_user_post').filter((item) => Number(item.userId) !== Number(user.userId));
      for (const postId of body.postIds || []) {
        getTable('sys_user_post').push({ postId: Number(postId), userId: Number(user.userId) });
      }
      addOperLog({
        businessType: 2,
        method: 'userUpdate',
        operParam: JSON.stringify(body),
        operUrl: pathname,
        requestMethod: method,
        session,
        title: '用户管理',
      });
      await persistTables(['sys_user', 'sys_user_role', 'sys_user_post', 'sys_oper_log']);
      sendSuccess(response);
      return;
    }

    matched = pathname.match(/^\/system\/user\/([\d,]+)$/);
    if (matched && method === 'DELETE') {
      const ids = matched[1].split(',').map(Number);
      removeIds('sys_user', 'userId', ids);
      state.tables.sys_user_role = getTable('sys_user_role').filter((item) => !ids.includes(Number(item.userId)));
      state.tables.sys_user_post = getTable('sys_user_post').filter((item) => !ids.includes(Number(item.userId)));
      const removedTokens = removeSessionsByUserIds(ids);
      if (removedTokens.length > 0) {
        await deleteSessionsByUserIdsFromStore(ids);
      }
      addOperLog({
        businessType: 3,
        method: 'userRemove',
        operParam: matched[1],
        operUrl: pathname,
        requestMethod: method,
        session,
        title: '用户管理',
      });
      await persistTables(['sys_user', 'sys_user_role', 'sys_user_post', 'sys_oper_log']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/system/user/changeStatus' && method === 'PUT') {
      const user = getUserById(body.userId);
      if (!user) {
        sendError(response, 404, '用户不存在');
        return;
      }
      user.status = body.status ?? user.status;
      user.updateTime = now();
      addOperLog({
        businessType: 2,
        method: 'userChangeStatus',
        operParam: JSON.stringify(body),
        operUrl: pathname,
        requestMethod: method,
        session,
        title: '用户管理',
      });
      await persistTables(['sys_user', 'sys_oper_log']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/system/user/resetPwd' && method === 'PUT') {
      const user = getUserById(body.userId);
      if (!user) {
        sendError(response, 404, '用户不存在');
        return;
      }
      user.password = await bcrypt.hash(body.password || DEFAULT_LOGIN_PASSWORD, 10);
      user.pwdUpdateDate = now();
      addOperLog({
        businessType: 2,
        method: 'userResetPwd',
        operParam: JSON.stringify({ userId: body.userId }),
        operUrl: pathname,
        requestMethod: method,
        session,
        title: '用户管理',
      });
      await persistTables(['sys_user', 'sys_oper_log']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/system/role/list' && method === 'GET') {
      let rows = getTable('sys_role').map((item) => mapRole(item));
      rows = rows.filter((item) => includesText(item.roleName, query.roleName));
      rows = rows.filter((item) => includesText(item.roleKey, query.roleKey));
      if (query.status) {
        rows = rows.filter((item) => item.status === query.status);
      }
      rows = applyDateRange(rows, 'createTime', query.params);
      const result = paginate(rows, query);
      sendPage(response, result.rows, result.total);
      return;
    }

    if (pathname === '/system/role/export' && method === 'POST') {
      sendFile(response, 'roles.csv', csvFromRows(getTable('sys_role').map((item) => mapRole(item))));
      return;
    }

    if (pathname === '/system/role/optionselect' && method === 'GET') {
      sendSuccess(response, getTable('sys_role').map((item) => mapRole(item)));
      return;
    }

    matched = pathname.match(/^\/system\/role\/deptTree\/(\d+)$/);
    if (matched && method === 'GET') {
      const roleId = Number(matched[1]);
      sendSuccess(response, {
        checkedKeys: getRoleDeptIds(roleId),
        depts: buildDeptTreeOptions(),
      });
      return;
    }

    if (pathname === '/system/role/authUser/allocatedList' && method === 'GET') {
      const roleId = Number(query.roleId);
      let rows = getTable('sys_user')
        .filter((item) => getUserRoleIds(item.userId).includes(roleId))
        .map(mapUser);
      rows = rows.filter((item) => includesText(item.userName, query.userName));
      rows = rows.filter((item) => includesText(item.phonenumber, query.phonenumber));
      const result = paginate(rows, query);
      sendPage(response, result.rows, result.total);
      return;
    }

    if (pathname === '/system/role/authUser/unallocatedList' && method === 'GET') {
      const roleId = Number(query.roleId);
      let rows = getTable('sys_user')
        .filter((item) => !getUserRoleIds(item.userId).includes(roleId))
        .map(mapUser);
      rows = rows.filter((item) => includesText(item.userName, query.userName));
      rows = rows.filter((item) => includesText(item.phonenumber, query.phonenumber));
      const result = paginate(rows, query);
      sendPage(response, result.rows, result.total);
      return;
    }

    if (pathname === '/system/role/authUser/cancel' && method === 'PUT') {
      state.tables.sys_user_role = getTable('sys_user_role').filter(
        (item) =>
          !(
            Number(item.roleId) === Number(body.roleId) &&
            Number(item.userId) === Number(body.userId)
          ),
      );
      await persistTables(['sys_user_role']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/system/role/authUser/cancelAll' && method === 'PUT') {
      const roleId = Number(query.roleId);
      const userIds = String(query.userIds || '')
        .split(',')
        .filter(Boolean)
        .map(Number);
      state.tables.sys_user_role = getTable('sys_user_role').filter(
        (item) =>
          Number(item.roleId) !== roleId || !userIds.includes(Number(item.userId)),
      );
      await persistTables(['sys_user_role']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/system/role/authUser/selectAll' && method === 'PUT') {
      const roleId = Number(query.roleId);
      const userIds = String(query.userIds || '')
        .split(',')
        .filter(Boolean)
        .map(Number);
      const currentPairs = new Set(
        getTable('sys_user_role').map((item) => `${item.userId}:${item.roleId}`),
      );
      for (const userId of userIds) {
        const key = `${userId}:${roleId}`;
        if (!currentPairs.has(key)) {
          getTable('sys_user_role').push({ roleId, userId });
        }
      }
      await persistTables(['sys_user_role']);
      sendSuccess(response);
      return;
    }

    matched = pathname.match(/^\/system\/role\/(\d+)$/);
    if (matched && method === 'GET') {
      const role = getRoleById(matched[1]);
      if (!role) {
        sendError(response, 404, '角色不存在');
        return;
      }
      sendSuccess(response, mapRole(role));
      return;
    }

    if (pathname === '/system/role' && method === 'POST') {
      const roleId = nextId('sys_role', 'roleId');
      getTable('sys_role').push({
        createBy: 'admin',
        createTime: now(),
        dataScope: body.dataScope || '1',
        delFlag: '0',
        deptCheckStrictly: body.deptCheckStrictly ? 1 : 0,
        menuCheckStrictly: body.menuCheckStrictly ? 1 : 0,
        remark: body.remark || '',
        roleId,
        roleKey: body.roleKey,
        roleName: body.roleName,
        roleSort: Number(body.roleSort || 0),
        status: body.status || '0',
        updateBy: '',
        updateTime: '',
      });
      state.tables.sys_role_menu = getTable('sys_role_menu').filter((item) => Number(item.roleId) !== roleId);
      for (const menuId of body.menuIds || []) {
        getTable('sys_role_menu').push({ menuId: Number(menuId), roleId });
      }
      for (const deptId of body.deptIds || []) {
        getTable('sys_role_dept').push({ deptId: Number(deptId), roleId });
      }
      addOperLog({
        businessType: 1,
        method: 'roleAdd',
        operParam: JSON.stringify(body),
        operUrl: pathname,
        requestMethod: method,
        session,
        title: '角色管理',
      });
      await persistTables(['sys_role', 'sys_role_menu', 'sys_role_dept', 'sys_oper_log']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/system/role' && method === 'PUT') {
      const role = getRoleById(body.roleId);
      if (!role) {
        sendError(response, 404, '角色不存在');
        return;
      }
      Object.assign(role, {
        dataScope: body.dataScope ?? role.dataScope,
        deptCheckStrictly: body.deptCheckStrictly ? 1 : 0,
        menuCheckStrictly: body.menuCheckStrictly ? 1 : 0,
        remark: body.remark ?? role.remark,
        roleKey: body.roleKey ?? role.roleKey,
        roleName: body.roleName ?? role.roleName,
        roleSort: Number(body.roleSort ?? role.roleSort),
        status: body.status ?? role.status,
        updateBy: 'admin',
        updateTime: now(),
      });
      state.tables.sys_role_menu = getTable('sys_role_menu').filter((item) => Number(item.roleId) !== Number(role.roleId));
      for (const menuId of body.menuIds || []) {
        getTable('sys_role_menu').push({ menuId: Number(menuId), roleId: Number(role.roleId) });
      }
      state.tables.sys_role_dept = getTable('sys_role_dept').filter((item) => Number(item.roleId) !== Number(role.roleId));
      for (const deptId of body.deptIds || []) {
        getTable('sys_role_dept').push({ deptId: Number(deptId), roleId: Number(role.roleId) });
      }
      addOperLog({
        businessType: 2,
        method: 'roleUpdate',
        operParam: JSON.stringify(body),
        operUrl: pathname,
        requestMethod: method,
        session,
        title: '角色管理',
      });
      await persistTables(['sys_role', 'sys_role_menu', 'sys_role_dept', 'sys_oper_log']);
      sendSuccess(response);
      return;
    }

    matched = pathname.match(/^\/system\/role\/([\d,]+)$/);
    if (matched && method === 'DELETE') {
      const ids = matched[1].split(',').map(Number);
      removeIds('sys_role', 'roleId', ids);
      state.tables.sys_role_menu = getTable('sys_role_menu').filter((item) => !ids.includes(Number(item.roleId)));
      state.tables.sys_role_dept = getTable('sys_role_dept').filter((item) => !ids.includes(Number(item.roleId)));
      state.tables.sys_user_role = getTable('sys_user_role').filter((item) => !ids.includes(Number(item.roleId)));
      await persistTables(['sys_role', 'sys_role_menu', 'sys_role_dept', 'sys_user_role']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/system/role/changeStatus' && method === 'PUT') {
      const role = getRoleById(body.roleId);
      if (!role) {
        sendError(response, 404, '角色不存在');
        return;
      }
      role.status = body.status ?? role.status;
      role.updateTime = now();
      await persistTables(['sys_role']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/system/role/dataScope' && method === 'PUT') {
      const role = getRoleById(body.roleId);
      if (!role) {
        sendError(response, 404, '角色不存在');
        return;
      }
      role.dataScope = body.dataScope ?? role.dataScope;
      role.deptCheckStrictly = body.deptCheckStrictly ? 1 : 0;
      state.tables.sys_role_dept = getTable('sys_role_dept').filter((item) => Number(item.roleId) !== Number(role.roleId));
      for (const deptId of body.deptIds || []) {
        getTable('sys_role_dept').push({ deptId: Number(deptId), roleId: Number(role.roleId) });
      }
      await persistTables(['sys_role', 'sys_role_dept']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/system/dept/list' && method === 'GET') {
      let rows = getTable('sys_dept').map(mapDept);
      rows = rows.filter((item) => includesText(item.deptName, query.deptName));
      if (query.status) {
        rows = rows.filter((item) => item.status === query.status);
      }
      sendSuccess(response, rows);
      return;
    }

    matched = pathname.match(/^\/system\/dept\/list\/exclude\/(\d+)$/);
    if (matched && method === 'GET') {
      const deptId = Number(matched[1]);
      const rows = getTable('sys_dept')
        .filter((item) => Number(item.deptId) !== deptId)
        .filter((item) => !String(item.ancestors || '').split(',').includes(String(deptId)))
        .map(mapDept);
      sendSuccess(response, rows);
      return;
    }

    matched = pathname.match(/^\/system\/dept\/(\d+)$/);
    if (matched && method === 'GET') {
      const dept = getDeptById(matched[1]);
      if (!dept) {
        sendError(response, 404, '部门不存在');
        return;
      }
      sendSuccess(response, mapDept(dept));
      return;
    }

    if (pathname === '/system/dept' && method === 'POST') {
      const deptId = nextId('sys_dept', 'deptId');
      getTable('sys_dept').push({
        ancestors: buildAncestors(body.parentId),
        createBy: 'admin',
        createTime: now(),
        delFlag: '0',
        deptId,
        deptName: body.deptName,
        email: body.email || '',
        leader: body.leader || '',
        orderNum: Number(body.orderNum || 0),
        parentId: Number(body.parentId || 0),
        phone: body.phone || '',
        status: body.status || '0',
        updateBy: '',
        updateTime: '',
      });
      await persistTables(['sys_dept']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/system/dept' && method === 'PUT') {
      const dept = getDeptById(body.deptId);
      if (!dept) {
        sendError(response, 404, '部门不存在');
        return;
      }
      Object.assign(dept, {
        ancestors: buildAncestors(body.parentId ?? dept.parentId),
        deptName: body.deptName ?? dept.deptName,
        email: body.email ?? dept.email,
        leader: body.leader ?? dept.leader,
        orderNum: Number(body.orderNum ?? dept.orderNum),
        parentId: Number(body.parentId ?? dept.parentId),
        phone: body.phone ?? dept.phone,
        status: body.status ?? dept.status,
        updateBy: 'admin',
        updateTime: now(),
      });
      await persistTables(['sys_dept']);
      sendSuccess(response);
      return;
    }

    matched = pathname.match(/^\/system\/dept\/(\d+)$/);
    if (matched && method === 'DELETE') {
      const deptId = Number(matched[1]);
      const hasChildren = getTable('sys_dept').some((item) => Number(item.parentId) === deptId);
      if (hasChildren) {
        sendError(response, 500, '存在下级部门，无法删除');
        return;
      }
      state.tables.sys_dept = getTable('sys_dept').filter((item) => Number(item.deptId) !== deptId);
      await persistTables(['sys_dept']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/system/post/list' && method === 'GET') {
      let rows = getTable('sys_post').map(mapPost);
      rows = rows.filter((item) => includesText(item.postName, query.postName));
      rows = rows.filter((item) => includesText(item.postCode, query.postCode));
      if (query.deptId) {
        rows = rows.filter((item) => Number(item.deptId) === Number(query.deptId));
      }
      if (query.status) {
        rows = rows.filter((item) => item.status === query.status);
      }
      const result = paginate(rows, query);
      sendPage(response, result.rows, result.total);
      return;
    }

    if (pathname === '/system/post/export' && method === 'POST') {
      sendFile(response, 'posts.csv', csvFromRows(getTable('sys_post').map(mapPost)));
      return;
    }

    if (pathname === '/system/post/deptTree' && method === 'GET') {
      sendSuccess(response, buildDeptTreeOptions());
      return;
    }

    if (pathname === '/system/post/optionselect' && method === 'GET') {
      let rows = getTable('sys_post').map(mapPost);
      if (query.deptId) {
        rows = rows.filter((item) => Number(item.deptId) === Number(query.deptId));
      }
      sendSuccess(response, rows);
      return;
    }

    matched = pathname.match(/^\/system\/post\/(\d+)$/);
    if (matched && method === 'GET') {
      const post = getPostById(matched[1]);
      if (!post) {
        sendError(response, 404, '岗位不存在');
        return;
      }
      sendSuccess(response, mapPost(post));
      return;
    }

    if (pathname === '/system/post' && method === 'POST') {
      getTable('sys_post').push({
        createBy: 'admin',
        createTime: now(),
        deptId: body.deptId == null || body.deptId === '' ? null : Number(body.deptId),
        postCode: body.postCode,
        postId: nextId('sys_post', 'postId'),
        postName: body.postName,
        postSort: Number(body.postSort || 0),
        remark: body.remark || '',
        status: body.status || '0',
        updateBy: '',
        updateTime: '',
      });
      await persistTables(['sys_post']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/system/post' && method === 'PUT') {
      const post = getPostById(body.postId);
      if (!post) {
        sendError(response, 404, '岗位不存在');
        return;
      }
      Object.assign(post, {
        deptId:
          body.deptId == null || body.deptId === '' ? post.deptId : Number(body.deptId),
        postCode: body.postCode ?? post.postCode,
        postName: body.postName ?? post.postName,
        postSort: Number(body.postSort ?? post.postSort),
        remark: body.remark ?? post.remark,
        status: body.status ?? post.status,
        updateBy: 'admin',
        updateTime: now(),
      });
      await persistTables(['sys_post']);
      sendSuccess(response);
      return;
    }

    matched = pathname.match(/^\/system\/post\/([\d,]+)$/);
    if (matched && method === 'DELETE') {
      const ids = matched[1].split(',').map(Number);
      removeIds('sys_post', 'postId', ids);
      state.tables.sys_user_post = getTable('sys_user_post').filter((item) => !ids.includes(Number(item.postId)));
      await persistTables(['sys_post', 'sys_user_post']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/school/teacher/list' && method === 'GET') {
      let rows = getTable('teacher').map(mapTeacher);
      rows = rows.filter((item) => includesText(item.teacherNo, query.teacherNo));
      rows = rows.filter((item) => includesText(item.teacherName, query.teacherName));
      const status = defaultSchoolStatus(query);
      if (status) {
        rows = rows.filter((item) => item.status === status);
      }
      const result = paginate(rows, query);
      sendPage(response, result.rows, result.total);
      return;
    }

    if (pathname === '/school/teacher/options' && method === 'GET') {
      const rows = getTable('teacher')
        .filter((item) => item.status === '0')
        .map(mapTeacher);
      sendSuccess(response, rows);
      return;
    }

    matched = pathname.match(/^\/school\/teacher\/(\d+)$/);
    if (matched && method === 'GET') {
      const teacher = getTeacherById(matched[1]);
      if (!teacher) {
        sendError(response, 404, '教师不存在');
        return;
      }
      sendSuccess(response, mapTeacher(teacher));
      return;
    }

    if (pathname === '/school/teacher' && method === 'POST') {
      const duplicatedTeacherNo = getTable('teacher').some(
        (item) => item.teacherNo === body.teacherNo,
      );
      if (duplicatedTeacherNo) {
        sendError(response, 500, '教师编号已存在');
        return;
      }

      const { createdRole, userId } = await createSchoolUser({
        email: body.email,
        name: body.teacherName,
        phonenumber: body.phonenumber,
        sex: body.sex,
        status: body.status,
        type: 'teacher',
      });

      getTable('teacher').push({
        createBy: 'admin',
        createTime: now(),
        delFlag: '0',
        status: body.status || '0',
        teacherId: nextId('teacher', 'teacherId'),
        teacherName: body.teacherName,
        teacherNo: body.teacherNo,
        updateBy: '',
        updateTime: '',
        userId,
      });
      await persistTables(
        createdRole
          ? ['sys_role', 'sys_user', 'sys_user_role', 'teacher']
          : ['sys_user', 'sys_user_role', 'teacher'],
      );
      sendSuccess(response);
      return;
    }

    if (pathname === '/school/teacher' && method === 'PUT') {
      const teacher = getTeacherById(body.teacherId);
      if (!teacher) {
        sendError(response, 404, '教师不存在');
        return;
      }

      const duplicatedTeacherNo = getTable('teacher').some(
        (item) =>
          Number(item.teacherId) !== Number(body.teacherId) &&
          item.teacherNo === body.teacherNo,
      );
      if (duplicatedTeacherNo) {
        sendError(response, 500, '教师编号已存在');
        return;
      }

      Object.assign(teacher, {
        status: body.status ?? teacher.status,
        teacherName: body.teacherName ?? teacher.teacherName,
        teacherNo: body.teacherNo ?? teacher.teacherNo,
        updateBy: 'admin',
        updateTime: now(),
      });
      syncSchoolUser(teacher.userId, {
        email: body.email,
        nickName: body.teacherName,
        phonenumber: body.phonenumber,
        sex: body.sex,
        status: body.status,
      });
      await persistTables(['sys_user', 'teacher']);
      sendSuccess(response);
      return;
    }

    matched = pathname.match(/^\/school\/teacher\/([\d,]+)$/);
    if (matched && method === 'DELETE') {
      const ids = matched[1].split(',').map(Number);
      const referenced = getTable('class_room').find((item) =>
        ids.includes(Number(item.teacherId)),
      );
      if (referenced) {
        sendError(response, 500, '教师已绑定班级，无法删除');
        return;
      }

      const userIds = getTable('teacher')
        .filter((item) => ids.includes(Number(item.teacherId)))
        .map((item) => Number(item.userId));
      removeIds('teacher', 'teacherId', ids);
      const removedTokens = [];
      for (const userId of userIds) {
        removedTokens.push(...removeUserCascade(userId));
      }
      await persistTables(['teacher', 'sys_user', 'sys_user_role', 'sys_user_post']);
      if (removedTokens.length > 0) {
        await deleteSessionsByUserIdsFromStore(userIds);
      }
      sendSuccess(response);
      return;
    }

    if (pathname === '/school/class-room/list' && method === 'GET') {
      let rows = getTable('class_room').map(mapClassRoom);
      rows = rows.filter((item) => includesText(item.classNo, query.classNo));
      rows = rows.filter((item) => includesText(item.className, query.className));
      rows = rows.filter((item) => includesText(item.gradeName, query.gradeName));
      rows = rows.filter((item) => includesText(item.teacherName, query.teacherName));
      const status = defaultSchoolStatus(query);
      if (status) {
        rows = rows.filter((item) => item.status === status);
      }
      const result = paginate(rows, query);
      sendPage(response, result.rows, result.total);
      return;
    }

    if (pathname === '/school/class-room/options' && method === 'GET') {
      const rows = getTable('class_room')
        .filter((item) => item.status === '0')
        .map(mapClassRoom);
      sendSuccess(response, rows);
      return;
    }

    matched = pathname.match(/^\/school\/class-room\/(\d+)$/);
    if (matched && method === 'GET') {
      const classRoom = getClassRoomById(matched[1]);
      if (!classRoom) {
        sendError(response, 404, '班级不存在');
        return;
      }
      sendSuccess(response, mapClassRoom(classRoom));
      return;
    }

    if (pathname === '/school/class-room' && method === 'POST') {
      const duplicatedClassNo = getTable('class_room').some(
        (item) => item.classNo === body.classNo,
      );
      if (duplicatedClassNo) {
        sendError(response, 500, '班级编号已存在');
        return;
      }

      const teacher = getTeacherById(body.teacherId);
      if (!teacher || teacher.status !== '0') {
        sendError(response, 500, '只能绑定正常状态的教师');
        return;
      }

      getTable('class_room').push({
        classId: nextId('class_room', 'classId'),
        className: body.className,
        classNo: body.classNo,
        createBy: 'admin',
        createTime: now(),
        delFlag: '0',
        gradeName: body.gradeName || '',
        status: body.status || '0',
        teacherId: Number(body.teacherId),
        updateBy: '',
        updateTime: '',
      });
      await persistTables(['class_room']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/school/class-room' && method === 'PUT') {
      const classRoom = getClassRoomById(body.classId);
      if (!classRoom) {
        sendError(response, 404, '班级不存在');
        return;
      }

      const duplicatedClassNo = getTable('class_room').some(
        (item) =>
          Number(item.classId) !== Number(body.classId) && item.classNo === body.classNo,
      );
      if (duplicatedClassNo) {
        sendError(response, 500, '班级编号已存在');
        return;
      }

      if (
        body.teacherId != null &&
        Number(body.teacherId) !== Number(classRoom.teacherId)
      ) {
        const teacher = getTeacherById(body.teacherId);
        if (!teacher || teacher.status !== '0') {
          sendError(response, 500, '只能绑定正常状态的教师');
          return;
        }
      }

      Object.assign(classRoom, {
        className: body.className ?? classRoom.className,
        classNo: body.classNo ?? classRoom.classNo,
        gradeName: body.gradeName ?? classRoom.gradeName,
        status: body.status ?? classRoom.status,
        teacherId: Number(body.teacherId ?? classRoom.teacherId),
        updateBy: 'admin',
        updateTime: now(),
      });
      await persistTables(['class_room']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/school/class-room/student/allocatedList' && method === 'GET') {
      const classId = Number(query.classId);
      let rows = getTable('student')
        .filter((item) => Number(item.classId) === classId)
        .map(mapStudent);
      rows = rows.filter((item) => includesText(item.studentNo, query.studentNo));
      rows = rows.filter((item) => includesText(item.studentName, query.studentName));
      rows = rows.filter((item) => includesText(item.phonenumber, query.phonenumber));
      const result = paginate(rows, query);
      sendPage(response, result.rows, result.total);
      return;
    }

    if (pathname === '/school/class-room/student/unallocatedList' && method === 'GET') {
      let rows = getTable('student')
        .filter((item) => item.classId == null)
        .filter((item) => item.status === '0')
        .map(mapStudent);
      rows = rows.filter((item) => includesText(item.studentNo, query.studentNo));
      rows = rows.filter((item) => includesText(item.studentName, query.studentName));
      rows = rows.filter((item) => includesText(item.phonenumber, query.phonenumber));
      const result = paginate(rows, query);
      sendPage(response, result.rows, result.total);
      return;
    }

    if (pathname === '/school/class-room/student/cancel' && method === 'PUT') {
      const classId = Number(body.classId);
      const studentId = Number(body.studentId);
      const student = getStudentById(studentId);
      if (!student || Number(student.classId) !== classId) {
        sendError(response, 404, '学生不存在或未分配到该班级');
        return;
      }
      student.classId = null;
      student.updateBy = 'admin';
      student.updateTime = now();
      await persistTables(['student']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/school/class-room/student/cancelAll' && method === 'PUT') {
      const classId = Number(query.classId);
      const studentIds = String(query.studentIds || '')
        .split(',')
        .filter(Boolean)
        .map(Number);
      for (const student of getTable('student')) {
        if (
          studentIds.includes(Number(student.studentId)) &&
          Number(student.classId) === classId
        ) {
          student.classId = null;
          student.updateBy = 'admin';
          student.updateTime = now();
        }
      }
      await persistTables(['student']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/school/class-room/student/selectAll' && method === 'PUT') {
      const classId = Number(query.classId);
      const classRoom = getClassRoomById(classId);
      if (!classRoom || classRoom.status !== '0') {
        sendError(response, 404, '班级不存在或状态异常');
        return;
      }
      const studentIds = String(query.studentIds || '')
        .split(',')
        .filter(Boolean)
        .map(Number);

      for (const studentId of studentIds) {
        const student = getStudentById(studentId);
        if (!student) {
          sendError(response, 404, '学生不存在');
          return;
        }
        if (student.status !== '0' || student.classId != null) {
          sendError(response, 500, '只能分配未分班且在读的学生');
          return;
        }
      }

      for (const studentId of studentIds) {
        const student = getStudentById(studentId);
        if (student) {
          student.classId = classId;
          student.updateBy = 'admin';
          student.updateTime = now();
        }
      }

      await persistTables(['student']);
      sendSuccess(response);
      return;
    }

    matched = pathname.match(/^\/school\/class-room\/([\d,]+)$/);
    if (matched && method === 'DELETE') {
      const ids = matched[1].split(',').map(Number);
      const referenced = getTable('student').find((item) =>
        ids.includes(Number(item.classId)),
      );
      if (referenced) {
        sendError(response, 500, '班级下存在学生，无法删除');
        return;
      }

      removeIds('class_room', 'classId', ids);
      await persistTables(['class_room']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/school/student/list' && method === 'GET') {
      let rows = getTable('student').map(mapStudent);
      rows = rows.filter((item) => includesText(item.studentNo, query.studentNo));
      rows = rows.filter((item) => includesText(item.studentName, query.studentName));
      rows = rows.filter((item) => includesText(item.className, query.className));
      const status = defaultSchoolStatus(query);
      if (status) {
        rows = rows.filter((item) => item.status === status);
      }
      const result = paginate(rows, query);
      sendPage(response, result.rows, result.total);
      return;
    }

    matched = pathname.match(/^\/school\/student\/(\d+)$/);
    if (matched && method === 'GET') {
      const student = getStudentById(matched[1]);
      if (!student) {
        sendError(response, 404, '学生不存在');
        return;
      }
      sendSuccess(response, mapStudent(student));
      return;
    }

    if (pathname === '/school/student' && method === 'POST') {
      const duplicatedStudentNo = getTable('student').some(
        (item) => item.studentNo === body.studentNo,
      );
      if (duplicatedStudentNo) {
        sendError(response, 500, '学号已存在');
        return;
      }

      if (body.classId != null && body.classId !== '') {
        const classRoom = getClassRoomById(body.classId);
        if (!classRoom || classRoom.status !== '0') {
          sendError(response, 500, '只能绑定正常状态的班级');
          return;
        }
      }

      const { createdRole, userId } = await createSchoolUser({
        email: body.email,
        name: body.studentName,
        phonenumber: body.phonenumber,
        sex: body.sex,
        status: body.status,
        type: 'student',
        userName: body.studentNo,
      });

      getTable('student').push({
        birthday: body.birthday || null,
        classId:
          body.classId == null || body.classId === '' ? null : Number(body.classId),
        createBy: 'admin',
        createTime: now(),
        delFlag: '0',
        status: body.status || '0',
        studentId: nextId('student', 'studentId'),
        studentName: body.studentName,
        studentNo: body.studentNo,
        updateBy: '',
        updateTime: '',
        userId,
      });
      await persistTables(
        createdRole
          ? ['sys_role', 'sys_user', 'sys_user_role', 'student']
          : ['sys_user', 'sys_user_role', 'student'],
      );
      sendSuccess(response);
      return;
    }

    if (pathname === '/school/student' && method === 'PUT') {
      const student = getStudentById(body.studentId);
      if (!student) {
        sendError(response, 404, '学生不存在');
        return;
      }

      const duplicatedStudentNo = getTable('student').some(
        (item) =>
          Number(item.studentId) !== Number(body.studentId) &&
          item.studentNo === body.studentNo,
      );
      if (duplicatedStudentNo) {
        sendError(response, 500, '学号已存在');
        return;
      }

      if (body.classId != null && body.classId !== '' && Number(body.classId) !== Number(student.classId)) {
        const classRoom = getClassRoomById(body.classId);
        if (!classRoom || classRoom.status !== '0') {
          sendError(response, 500, '只能绑定正常状态的班级');
          return;
        }
      }

      Object.assign(student, {
        birthday: body.birthday === '' ? null : (body.birthday !== undefined ? body.birthday : student.birthday),
        classId:
          body.classId == null || body.classId === ''
            ? null
            : Number(body.classId),
        status: body.status ?? student.status,
        studentName: body.studentName ?? student.studentName,
        studentNo: body.studentNo ?? student.studentNo,
        updateBy: 'admin',
        updateTime: now(),
      });
      syncSchoolUser(student.userId, {
        email: body.email,
        nickName: body.studentName,
        phonenumber: body.phonenumber,
        sex: body.sex,
        status: body.status,
        userName: body.studentNo,
      });
      await persistTables(['sys_user', 'student']);
      sendSuccess(response);
      return;
    }

    matched = pathname.match(/^\/school\/student\/([\d,]+)$/);
    if (matched && method === 'DELETE') {
      const ids = matched[1].split(',').map(Number);
      const userIds = getTable('student')
        .filter((item) => ids.includes(Number(item.studentId)))
        .map((item) => Number(item.userId));
      removeIds('student', 'studentId', ids);
      const removedTokens = [];
      for (const userId of userIds) {
        removedTokens.push(...removeUserCascade(userId));
      }
      await persistTables(['student', 'sys_user', 'sys_user_role', 'sys_user_post']);
      if (removedTokens.length > 0) {
        await deleteSessionsByUserIdsFromStore(userIds);
      }
      sendSuccess(response);
      return;
    }

    if (pathname === '/system/menu/list' && method === 'GET') {
      let rows = getSortedMenus().map(mapMenu);
      rows = rows.filter((item) => includesText(item.menuName, query.menuName));
      if (query.status) {
        rows = rows.filter((item) => item.status === query.status);
      }
      if (query.visible) {
        rows = rows.filter((item) => item.visible === query.visible);
      }
      sendSuccess(response, rows);
      return;
    }

    if (pathname === '/system/menu/treeselect' && method === 'GET') {
      sendSuccess(response, {
        checkedKeys: [],
        menus: buildMenuTreeOptions(),
      });
      return;
    }

    matched = pathname.match(/^\/system\/menu\/roleMenuTreeselect\/(\d+)$/);
    if (matched && method === 'GET') {
      const roleId = Number(matched[1]);
      sendSuccess(response, {
        checkedKeys: getRoleMenuIds([roleId]).filter((item) =>
          getSortedMenus().some((menu) => Number(menu.menuId) === item),
        ),
        menus: buildMenuTreeOptions(),
      });
      return;
    }

    matched = pathname.match(/^\/system\/menu\/tenantPackageMenuTreeselect\/(.+)$/);
    if (matched && method === 'GET') {
      sendSuccess(response, {
        checkedKeys: [],
        menus: buildMenuTreeOptions(),
      });
      return;
    }

    matched = pathname.match(/^\/system\/menu\/(\d+)$/);
    if (matched && method === 'GET') {
      const menu = getMenuById(matched[1]);
      if (!menu) {
        sendError(response, 404, '菜单不存在');
        return;
      }
      sendSuccess(response, mapMenu(menu));
      return;
    }

    if (pathname === '/system/menu' && method === 'POST') {
      getTable('sys_menu').push({
        component: body.component || '',
        createBy: 'admin',
        createTime: now(),
        icon: body.icon || '#',
        isCache: body.isCache ?? 0,
        isFrame: body.isFrame ?? 1,
        menuId: nextId('sys_menu', 'menuId'),
        menuName: body.menuName,
        menuType: body.menuType || 'C',
        orderNum: Number(body.orderNum || 0),
        parentId: Number(body.parentId || 0),
        path: body.path || '',
        perms: body.perms || '',
        query: body.query || '',
        remark: body.remark || '',
        routeName: body.routeName || '',
        status: body.status || '0',
        updateBy: '',
        updateTime: '',
        visible: body.visible || '0',
      });
      await persistTables(['sys_menu']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/system/menu' && method === 'PUT') {
      const menu = getMenuById(body.menuId);
      if (!menu) {
        sendError(response, 404, '菜单不存在');
        return;
      }
      Object.assign(menu, {
        component: body.component ?? menu.component,
        icon: body.icon ?? menu.icon,
        isCache: body.isCache ?? menu.isCache,
        isFrame: body.isFrame ?? menu.isFrame,
        menuName: body.menuName ?? menu.menuName,
        menuType: body.menuType ?? menu.menuType,
        orderNum: Number(body.orderNum ?? menu.orderNum),
        parentId: Number(body.parentId ?? menu.parentId),
        path: body.path ?? menu.path,
        perms: body.perms ?? menu.perms,
        query: body.query ?? menu.query,
        routeName: body.routeName ?? menu.routeName,
        status: body.status ?? menu.status,
        updateBy: 'admin',
        updateTime: now(),
        visible: body.visible ?? menu.visible,
      });
      await persistTables(['sys_menu']);
      sendSuccess(response);
      return;
    }

    matched = pathname.match(/^\/system\/menu\/([\d,]+)$/);
    if (matched && method === 'DELETE') {
      const ids = matched[1].split(',').map(Number);
      const hasChildren = getTable('sys_menu').some((item) => ids.includes(Number(item.parentId)));
      if (hasChildren) {
        sendError(response, 500, '存在下级菜单，无法删除');
        return;
      }
      removeIds('sys_menu', 'menuId', ids);
      state.tables.sys_role_menu = getTable('sys_role_menu').filter((item) => !ids.includes(Number(item.menuId)));
      await persistTables(['sys_menu', 'sys_role_menu']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/system/dict/type/list' && method === 'GET') {
      let rows = getTable('sys_dict_type').map(mapDictType);
      rows = rows.filter((item) => includesText(item.dictName, query.dictName));
      rows = rows.filter((item) => includesText(item.dictType, query.dictType));
      if (query.status) {
        rows = rows.filter((item) => item.status === query.status);
      }
      const result = paginate(rows, query);
      sendPage(response, result.rows, result.total);
      return;
    }

    if (pathname === '/system/dict/type/export' && method === 'POST') {
      sendFile(response, 'dict-types.csv', csvFromRows(getTable('sys_dict_type').map(mapDictType)));
      return;
    }

    if (pathname === '/system/dict/type/optionselect' && method === 'GET') {
      sendSuccess(response, getTable('sys_dict_type').map(mapDictType));
      return;
    }

    if (pathname === '/system/dict/type/refreshCache' && method === 'DELETE') {
      sendSuccess(response);
      return;
    }

    matched = pathname.match(/^\/system\/dict\/type\/(\d+)$/);
    if (matched && method === 'GET') {
      const dictType = getTable('sys_dict_type').find((item) => Number(item.dictId) === Number(matched[1]));
      if (!dictType) {
        sendError(response, 404, '字典类型不存在');
        return;
      }
      sendSuccess(response, mapDictType(dictType));
      return;
    }

    if (pathname === '/system/dict/type' && method === 'POST') {
      getTable('sys_dict_type').push({
        createBy: 'admin',
        createTime: now(),
        dictId: nextId('sys_dict_type', 'dictId'),
        dictName: body.dictName,
        dictType: body.dictType,
        remark: body.remark || '',
        status: body.status || '0',
        updateBy: '',
        updateTime: '',
      });
      await persistTables(['sys_dict_type']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/system/dict/type' && method === 'PUT') {
      const dictType = getTable('sys_dict_type').find((item) => Number(item.dictId) === Number(body.dictId));
      if (!dictType) {
        sendError(response, 404, '字典类型不存在');
        return;
      }
      Object.assign(dictType, {
        dictName: body.dictName ?? dictType.dictName,
        dictType: body.dictType ?? dictType.dictType,
        remark: body.remark ?? dictType.remark,
        status: body.status ?? dictType.status,
        updateBy: 'admin',
        updateTime: now(),
      });
      await persistTables(['sys_dict_type']);
      sendSuccess(response);
      return;
    }

    matched = pathname.match(/^\/system\/dict\/type\/([\d,]+)$/);
    if (matched && method === 'DELETE') {
      const ids = matched[1].split(',').map(Number);
      const removedTypes = getTable('sys_dict_type')
        .filter((item) => ids.includes(Number(item.dictId)))
        .map((item) => item.dictType);
      removeIds('sys_dict_type', 'dictId', ids);
      state.tables.sys_dict_data = getTable('sys_dict_data').filter((item) => !removedTypes.includes(item.dictType));
      await persistTables(['sys_dict_type', 'sys_dict_data']);
      sendSuccess(response);
      return;
    }

    matched = pathname.match(/^\/system\/dict\/data\/type\/(.+)$/);
    if (matched && method === 'GET') {
      const dictType = decodeURIComponent(matched[1]);
      sendSuccess(
        response,
        getTable('sys_dict_data')
          .filter((item) => item.dictType === dictType && item.status === '0')
          .sort((left, right) => Number(left.dictSort) - Number(right.dictSort))
          .map(mapDictData),
      );
      return;
    }

    if (pathname === '/system/dict/data/list' && method === 'GET') {
      let rows = getTable('sys_dict_data').map(mapDictData);
      if (query.dictType) {
        rows = rows.filter((item) => item.dictType === query.dictType);
      }
      rows = rows.filter((item) => includesText(item.dictLabel, query.dictLabel));
      if (query.status) {
        rows = rows.filter((item) => item.status === query.status);
      }
      const result = paginate(rows, query);
      sendPage(response, result.rows, result.total);
      return;
    }

    if (pathname === '/system/dict/data/export' && method === 'POST') {
      sendFile(response, 'dict-data.csv', csvFromRows(getTable('sys_dict_data').map(mapDictData)));
      return;
    }

    matched = pathname.match(/^\/system\/dict\/data\/(\d+)$/);
    if (matched && method === 'GET') {
      const dictData = getTable('sys_dict_data').find((item) => Number(item.dictCode) === Number(matched[1]));
      if (!dictData) {
        sendError(response, 404, '字典数据不存在');
        return;
      }
      sendSuccess(response, mapDictData(dictData));
      return;
    }

    if (pathname === '/system/dict/data' && method === 'POST') {
      getTable('sys_dict_data').push({
        createBy: 'admin',
        createTime: now(),
        cssClass: body.cssClass || '',
        dictCode: nextId('sys_dict_data', 'dictCode'),
        dictLabel: body.dictLabel,
        dictSort: Number(body.dictSort || 0),
        dictType: body.dictType,
        dictValue: body.dictValue,
        isDefault: body.isDefault || 'N',
        listClass: body.listClass || 'default',
        remark: body.remark || '',
        status: body.status || '0',
        updateBy: '',
        updateTime: '',
      });
      await persistTables(['sys_dict_data']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/system/dict/data' && method === 'PUT') {
      const dictData = getTable('sys_dict_data').find((item) => Number(item.dictCode) === Number(body.dictCode));
      if (!dictData) {
        sendError(response, 404, '字典数据不存在');
        return;
      }
      Object.assign(dictData, {
        cssClass: body.cssClass ?? dictData.cssClass,
        dictLabel: body.dictLabel ?? dictData.dictLabel,
        dictSort: Number(body.dictSort ?? dictData.dictSort),
        dictType: body.dictType ?? dictData.dictType,
        dictValue: body.dictValue ?? dictData.dictValue,
        isDefault: body.isDefault ?? dictData.isDefault,
        listClass: body.listClass ?? dictData.listClass,
        remark: body.remark ?? dictData.remark,
        status: body.status ?? dictData.status,
        updateBy: 'admin',
        updateTime: now(),
      });
      await persistTables(['sys_dict_data']);
      sendSuccess(response);
      return;
    }

    matched = pathname.match(/^\/system\/dict\/data\/([\d,]+)$/);
    if (matched && method === 'DELETE') {
      removeIds('sys_dict_data', 'dictCode', matched[1].split(',').map(Number));
      await persistTables(['sys_dict_data']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/system/config/list' && method === 'GET') {
      let rows = getTable('sys_config').map(mapConfig);
      rows = rows.filter((item) => includesText(item.configName, query.configName));
      rows = rows.filter((item) => includesText(item.configKey, query.configKey));
      if (query.configType) {
        rows = rows.filter((item) => item.configType === query.configType);
      }
      rows = applyDateRange(rows, 'createTime', query.params);
      const result = paginate(rows, query);
      sendPage(response, result.rows, result.total);
      return;
    }

    if (pathname === '/system/config/export' && method === 'POST') {
      sendFile(response, 'configs.csv', csvFromRows(getTable('sys_config').map(mapConfig)));
      return;
    }

    matched = pathname.match(/^\/system\/config\/configKey\/(.+)$/);
    if (matched && method === 'GET') {
      const configKey = decodeURIComponent(matched[1]);
      const config = getTable('sys_config').find((item) => item.configKey === configKey);
      sendSuccess(response, config?.configValue || '');
      return;
    }

    if (pathname === '/system/config/refreshCache' && method === 'DELETE') {
      sendSuccess(response);
      return;
    }

    matched = pathname.match(/^\/system\/config\/(\d+)$/);
    if (matched && method === 'GET') {
      const config = getTable('sys_config').find((item) => Number(item.configId) === Number(matched[1]));
      if (!config) {
        sendError(response, 404, '配置不存在');
        return;
      }
      sendSuccess(response, mapConfig(config));
      return;
    }

    if (pathname === '/system/config' && method === 'POST') {
      getTable('sys_config').push({
        configId: nextId('sys_config', 'configId'),
        configKey: body.configKey,
        configName: body.configName,
        configType: body.configType || 'N',
        configValue: body.configValue || '',
        createBy: 'admin',
        createTime: now(),
        remark: body.remark || '',
        updateBy: '',
        updateTime: '',
      });
      await persistTables(['sys_config']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/system/config' && method === 'PUT') {
      const config = getTable('sys_config').find((item) => Number(item.configId) === Number(body.configId));
      if (!config) {
        sendError(response, 404, '配置不存在');
        return;
      }
      Object.assign(config, {
        configKey: body.configKey ?? config.configKey,
        configName: body.configName ?? config.configName,
        configType: body.configType ?? config.configType,
        configValue: body.configValue ?? config.configValue,
        remark: body.remark ?? config.remark,
        updateBy: 'admin',
        updateTime: now(),
      });
      await persistTables(['sys_config']);
      sendSuccess(response);
      return;
    }

    matched = pathname.match(/^\/system\/config\/([\d,]+)$/);
    if (matched && method === 'DELETE') {
      removeIds('sys_config', 'configId', matched[1].split(',').map(Number));
      await persistTables(['sys_config']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/system/notice/list' && method === 'GET') {
      let rows = getTable('sys_notice').map(mapNotice);
      rows = rows.filter((item) => includesText(item.noticeTitle, query.noticeTitle));
      if (query.noticeType) {
        rows = rows.filter((item) => item.noticeType === query.noticeType);
      }
      if (query.status) {
        rows = rows.filter((item) => item.status === query.status);
      }
      const result = paginate(rows, query);
      sendPage(response, result.rows, result.total);
      return;
    }

    matched = pathname.match(/^\/system\/notice\/(\d+)$/);
    if (matched && method === 'GET') {
      const notice = getTable('sys_notice').find((item) => Number(item.noticeId) === Number(matched[1]));
      if (!notice) {
        sendError(response, 404, '公告不存在');
        return;
      }
      sendSuccess(response, mapNotice(notice));
      return;
    }

    if (pathname === '/system/notice' && method === 'POST') {
      getTable('sys_notice').push({
        createBy: 'admin',
        createTime: now(),
        noticeContent: body.noticeContent || '',
        noticeId: nextId('sys_notice', 'noticeId'),
        noticeTitle: body.noticeTitle,
        noticeType: body.noticeType || '1',
        remark: body.remark || '',
        status: body.status || '0',
        updateBy: '',
        updateTime: '',
      });
      await persistTables(['sys_notice']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/system/notice' && method === 'PUT') {
      const notice = getTable('sys_notice').find((item) => Number(item.noticeId) === Number(body.noticeId));
      if (!notice) {
        sendError(response, 404, '公告不存在');
        return;
      }
      Object.assign(notice, {
        noticeContent: body.noticeContent ?? notice.noticeContent,
        noticeTitle: body.noticeTitle ?? notice.noticeTitle,
        noticeType: body.noticeType ?? notice.noticeType,
        remark: body.remark ?? notice.remark,
        status: body.status ?? notice.status,
        updateBy: 'admin',
        updateTime: now(),
      });
      await persistTables(['sys_notice']);
      sendSuccess(response);
      return;
    }

    matched = pathname.match(/^\/system\/notice\/([\d,]+)$/);
    if (matched && method === 'DELETE') {
      removeIds('sys_notice', 'noticeId', matched[1].split(',').map(Number));
      await persistTables(['sys_notice']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/monitor/operlog/list' && method === 'GET') {
      let rows = getTable('sys_oper_log').map(mapOperLog);
      rows = rows.filter((item) => includesText(item.title, query.title));
      rows = rows.filter((item) => includesText(item.operName, query.operName));
      rows = rows.filter((item) => includesText(item.operIp, query.operIp));
      if (query.businessType) {
        rows = rows.filter((item) => String(item.businessType) === String(query.businessType));
      }
      if (query.status) {
        rows = rows.filter((item) => String(item.status) === String(query.status));
      }
      rows = applyDateRange(rows, 'operTime', query.params);
      rows = applySort(rows, query);
      const result = paginate(rows, query);
      sendPage(response, result.rows, result.total);
      return;
    }

    if (pathname === '/monitor/operlog/export' && method === 'POST') {
      sendFile(response, 'operlogs.csv', csvFromRows(getTable('sys_oper_log').map(mapOperLog)));
      return;
    }

    matched = pathname.match(/^\/monitor\/operlog\/([\d,]+)$/);
    if (matched && method === 'DELETE') {
      removeIds('sys_oper_log', 'operId', matched[1].split(',').map(Number));
      await persistTables(['sys_oper_log']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/monitor/operlog/clean' && method === 'DELETE') {
      state.tables.sys_oper_log = [];
      await persistTables(['sys_oper_log']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/monitor/logininfor/list' && method === 'GET') {
      let rows = getTable('sys_logininfor').map(mapLoginInfo);
      rows = rows.filter((item) => includesText(item.userName, query.userName));
      rows = rows.filter((item) => includesText(item.ipaddr, query.ipaddr));
      if (query.status) {
        rows = rows.filter((item) => String(item.status) === String(query.status));
      }
      rows = applyDateRange(rows, 'loginTime', query.params);
      const result = paginate(rows, query);
      sendPage(response, result.rows, result.total);
      return;
    }

    if (pathname === '/monitor/logininfor/export' && method === 'POST') {
      sendFile(response, 'logininfo.csv', csvFromRows(getTable('sys_logininfor').map(mapLoginInfo)));
      return;
    }

    matched = pathname.match(/^\/monitor\/logininfor\/unlock\/(.+)$/);
    if (matched && method === 'GET') {
      sendSuccess(response, null, `账号 ${decodeURIComponent(matched[1])} 已解锁`);
      return;
    }

    matched = pathname.match(/^\/monitor\/logininfor\/([\d,]+)$/);
    if (matched && method === 'DELETE') {
      removeIds('sys_logininfor', 'infoId', matched[1].split(',').map(Number));
      await persistTables(['sys_logininfor']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/monitor/logininfor/clean' && method === 'DELETE') {
      state.tables.sys_logininfor = [];
      await persistTables(['sys_logininfor']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/monitor/online' && method === 'GET') {
      const rows = [...state.sessions.values()]
        .filter((item) => Number(item.userId) === Number(session.userId))
        .map((item) => ({
          browser: item.browser,
          deptName: getDeptById(getUserById(item.userId)?.deptId)?.deptName || '',
          ipaddr: item.ipaddr,
          loginLocation: item.loginLocation,
          loginTime: item.loginTime,
          os: item.os,
          tokenId: item.tokenId,
          userName: getUserById(item.userId)?.userName || '',
        }));
      sendPage(response, rows, rows.length);
      return;
    }

    if (pathname === '/monitor/online/list' && method === 'GET') {
      const rows = [...state.sessions.values()].map((item) => ({
        browser: item.browser,
        deptName: getDeptById(getUserById(item.userId)?.deptId)?.deptName || '',
        ipaddr: item.ipaddr,
        loginLocation: item.loginLocation,
        loginTime: item.loginTime,
        os: item.os,
        tokenId: item.tokenId,
        userName: getUserById(item.userId)?.userName || '',
      }));
      sendPage(response, rows, rows.length);
      return;
    }

    matched = pathname.match(/^\/monitor\/online\/myself\/(.+)$/);
    if (matched && method === 'DELETE') {
      const token = decodeURIComponent(matched[1]);
      if (state.sessions.delete(token)) {
        await deleteSessionsByTokens([token]);
      }
      sendSuccess(response);
      return;
    }

    matched = pathname.match(/^\/monitor\/online\/(.+)$/);
    if (matched && method === 'DELETE') {
      const token = decodeURIComponent(matched[1]);
      if (state.sessions.delete(token)) {
        await deleteSessionsByTokens([token]);
      }
      sendSuccess(response);
      return;
    }

    if (pathname === '/monitor/cache' && method === 'GET') {
      sendSuccess(response, {
        commandStats: [
          { name: 'get', value: '16' },
          { name: 'set', value: '8' },
        ],
        dbSize: 12,
        info: {
          mode: 'standalone',
          redis_version: 'mock-7.0',
          uptime_in_days: '1',
        },
      });
      return;
    }

    if (pathname === '/monitor/job/list' && method === 'GET') {
      let rows = getTable('sys_job').map(mapJob);
      rows = rows.filter((item) => includesText(item.jobName, query.jobName));
      rows = rows.filter((item) => includesText(item.jobGroup, query.jobGroup));
      rows = rows.filter((item) => includesText(item.invokeTarget, query.invokeTarget));
      if (query.status) {
        rows = rows.filter((item) => item.status === query.status);
      }
      const result = paginate(rows, query);
      sendPage(response, result.rows, result.total);
      return;
    }

    if (pathname === '/monitor/job/export' && method === 'POST') {
      sendFile(response, 'jobs.csv', csvFromRows(getTable('sys_job').map(mapJob)));
      return;
    }

    matched = pathname.match(/^\/monitor\/job\/(\d+)$/);
    if (matched && method === 'GET') {
      const job = getTable('sys_job').find((item) => Number(item.jobId) === Number(matched[1]));
      if (!job) {
        sendError(response, 404, '任务不存在');
        return;
      }
      sendSuccess(response, mapJob(job));
      return;
    }

    if (pathname === '/monitor/job' && method === 'POST') {
      getTable('sys_job').push({
        concurrent: body.concurrent || '1',
        createBy: 'admin',
        createTime: now(),
        cronExpression: body.cronExpression || '',
        invokeTarget: body.invokeTarget,
        jobGroup: body.jobGroup || 'DEFAULT',
        jobId: nextId('sys_job', 'jobId'),
        jobName: body.jobName,
        misfirePolicy: body.misfirePolicy || '3',
        remark: body.remark || '',
        status: body.status || '0',
        updateBy: '',
        updateTime: '',
      });
      await persistTables(['sys_job']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/monitor/job' && method === 'PUT') {
      const job = getTable('sys_job').find((item) => Number(item.jobId) === Number(body.jobId));
      if (!job) {
        sendError(response, 404, '任务不存在');
        return;
      }
      Object.assign(job, {
        concurrent: body.concurrent ?? job.concurrent,
        cronExpression: body.cronExpression ?? job.cronExpression,
        invokeTarget: body.invokeTarget ?? job.invokeTarget,
        jobGroup: body.jobGroup ?? job.jobGroup,
        jobName: body.jobName ?? job.jobName,
        misfirePolicy: body.misfirePolicy ?? job.misfirePolicy,
        remark: body.remark ?? job.remark,
        status: body.status ?? job.status,
        updateBy: 'admin',
        updateTime: now(),
      });
      await persistTables(['sys_job']);
      sendSuccess(response);
      return;
    }

    matched = pathname.match(/^\/monitor\/job\/([\d,]+)$/);
    if (matched && method === 'DELETE') {
      removeIds('sys_job', 'jobId', matched[1].split(',').map(Number));
      await persistTables(['sys_job']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/monitor/job/changeStatus' && method === 'PUT') {
      const job = getTable('sys_job').find((item) => Number(item.jobId) === Number(body.jobId));
      if (!job) {
        sendError(response, 404, '任务不存在');
        return;
      }
      job.status = body.status ?? job.status;
      job.updateTime = now();
      await persistTables(['sys_job']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/monitor/jobLog/list' && method === 'GET') {
      const result = paginate(getTable('sys_job_log'), query);
      sendPage(response, result.rows, result.total);
      return;
    }

    if (pathname === '/monitor/jobLog/export' && method === 'POST') {
      sendFile(response, 'job-logs.csv', csvFromRows(getTable('sys_job_log')));
      return;
    }

    matched = pathname.match(/^\/monitor\/jobLog\/([\d,]+)$/);
    if (matched && method === 'DELETE') {
      removeIds('sys_job_log', 'jobLogId', matched[1].split(',').map(Number));
      await persistTables(['sys_job_log']);
      sendSuccess(response);
      return;
    }

    if (pathname === '/monitor/jobLog/clean' && method === 'DELETE') {
      state.tables.sys_job_log = [];
      await persistTables(['sys_job_log']);
      sendSuccess(response);
      return;
    }

    matched = pathname.match(/^\/resource\/oss\/listByIds\/(.+)$/);
    if (matched && method === 'GET') {
      const ids = matched[1].split(',').map((id) => String(id).trim());
      const files = getTable('attachment')
        .filter((item) => ids.includes(String(item.attachmentId)))
        .map((item) => ({
          ossId: String(item.attachmentId),
          url: item.fileUrl,
          fileName: item.fileName,
          originalName: item.fileName,
          objectName: item.objectName
        }));
      sendSuccess(response, files);
      return;
    }

      sendError(response, 404, `未实现的接口: ${method} ${pathname}`);
    } catch (error) {
      console.error(error);
      sendError(response, 500, error instanceof Error ? error.message : '服务异常');
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`system-api listening on http://127.0.0.1:${PORT}`);
});

async function shutdown() {
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function startGarbageCollection() {
  const GC_INTERVAL = 24 * 60 * 60 * 1000;
  
  async function runGC() {
    console.log('[GC] Starting zombie attachment cleanup...');
    const attachments = getTable('attachment');
    if (!attachments || attachments.length === 0) {
      console.log('[GC] No files to analyze.');
      return;
    }
    
    const now = new Date();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    
    let deletedCount = 0;
    
    const serializedOtherTables = Object.entries(state.tables)
      .filter(([name]) => name !== 'attachment')
      .map(([, rows]) => JSON.stringify(rows));
      
    for (let i = attachments.length - 1; i >= 0; i--) {
      const file = attachments[i];
      const fileTimeStr = file.createTime ? String(file.createTime).replace(' ', 'T') : '';
      const createdTime = new Date(fileTimeStr || now);
      
      if (now.getTime() - createdTime.getTime() > ONE_DAY) {
         const strId = `"${file.attachmentId}"`;
         const urlStr = `"${file.fileUrl}"`;
         const isReferenced = serializedOtherTables.some(json => json.includes(strId) || json.includes(urlStr));
         
         if (!isReferenced) {
           try {
             if (file.objectName) {
               await removeObject(file.objectName);
               console.log(`[GC] Removed object: ${file.objectName}`);
             }
             attachments.splice(i, 1);
             deletedCount++;
           } catch (err) {
             console.error(`[GC] Failed to remove ${file.objectName}:`, err);
           }
         }
      }
    }
    
    if (deletedCount > 0) {
       console.log(`[GC] Successfully cleaned up ${deletedCount} zombie files.`);
       persistTables(['attachment']).catch(console.error);
    } else {
       console.log('[GC] No zombie files matched for cleanup.');
    }
  }
  
  setTimeout(runGC, 60000);
  setInterval(runGC, GC_INTERVAL);
}
startGarbageCollection();
