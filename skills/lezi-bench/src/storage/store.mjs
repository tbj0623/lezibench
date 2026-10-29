/**
 * 存储层：跨平台数据目录、原子写入、路径安全。
 * 原则：不越出数据根目录写任何东西；任何写入失败都抛可读错误，绝不静默吞掉。
 */
import { mkdir, rename, writeFile, readFile, open, unlink, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes, createHash } from 'node:crypto';

export const DATA_DIR_ENV = 'LEZIBENCH_HOME';

/** 解析数据根目录：环境变量优先，其次是各平台标准位置 */
export function resolveDataRoot(env = process.env) {
  if (env[DATA_DIR_ENV]) return path.resolve(env[DATA_DIR_ENV]);
  const platform = process.platform;
  if (platform === 'win32') {
    const base = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(base, 'LeziBench');
  }
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'LeziBench');
  const base = env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'lezibench');
}

export function newRunId(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `run-${y}${m}${d}-${hh}${mm}${ss}-${randomBytes(3).toString('hex')}`;
}

/** runId 只允许安全字符，且必须是我们自己生成的格式前缀 */
export function assertSafeRunId(runId) {
  if (typeof runId !== 'string' || !runId) throw new Error('runId 不能为空');
  if (!/^[A-Za-z0-9._-]{6,80}$/.test(runId)) throw new Error(`runId 含非法字符：${runId}`);
  if (runId.includes('..')) throw new Error('runId 不得包含 ..');
  return runId;
}

export function runDir(root, runId) {
  assertSafeRunId(runId);
  const dir = path.join(root, 'runs', runId);
  const rel = path.relative(root, dir);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('解析出的运行目录越界');
  return dir;
}

export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
  return dir;
}

/** 原子写：同目录临时文件 → fsync → rename；Windows 上 rename 覆盖已存在文件可能失败，退化为 unlink+rename */
export async function atomicWrite(file, data) {
  const dir = path.dirname(file);
  await ensureDir(dir);
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.${randomBytes(4).toString('hex')}.tmp`);
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  let fh;
  try {
    fh = await open(tmp, 'w');
    await fh.writeFile(buf);
    await fh.sync();
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
  try {
    await rename(tmp, file);
  } catch (err) {
    if (process.platform === 'win32' || err.code === 'EEXIST' || err.code === 'EPERM') {
      await unlink(file).catch(() => {});
      await rename(tmp, file);
    } else {
      await unlink(tmp).catch(() => {});
      throw err;
    }
  }
  return file;
}

export async function atomicWriteJson(file, obj) {
  return atomicWrite(file, `${JSON.stringify(obj, null, 2)}\n`);
}

export async function readJson(file, fallback = null) {
  try {
    const txt = await readFile(file, 'utf8');
    return JSON.parse(txt);
  } catch (err) {
    if (err.code === 'ENOENT' && fallback !== null) return fallback;
    if (err.code === 'ENOENT') throw new Error(`文件不存在：${file}`);
    if (err instanceof SyntaxError) throw new Error(`文件内容不是合法 JSON：${file}（${err.message}）`);
    throw new Error(`读取失败：${file}（${err.code || err.message}）`);
  }
}

export async function pathExists(p) {
  return existsSync(p);
}

export function sha256File(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** 检查目录可写（真正写一个探针文件再删），返回 {ok, error} */
export async function probeWritable(dir) {
  try {
    await ensureDir(dir);
    const probe = path.join(dir, `.probe-${Date.now()}-${randomBytes(3).toString('hex')}`);
    await writeFile(probe, 'ok', 'utf8');
    const st = await stat(probe);
    await unlink(probe);
    return { ok: true, dir, bytes: st.size };
  } catch (err) {
    return { ok: false, dir, error: `${err.code || ''} ${err.message}`.trim() };
  }
}

/** 把任意用户输入路径解析为绝对路径（仅用于 --out，绝不用于读系统文件） */
export function resolveOutputPath(p, cwd = process.cwd()) {
  if (!p || typeof p !== 'string') throw new Error('输出路径不能为空');
  return path.isAbsolute(p) ? path.normalize(p) : path.resolve(cwd, p);
}
