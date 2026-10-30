#!/usr/bin/env node
/**
 * LeziBench 安装器 —— 幂等、安全、可回滚。
 *
 * 为什么要有它（v1.4 P0-A 的真实缺陷）：
 *   v1.3.0 的 docs/INSTALL.md 大篇幅引用 `install/install.ps1` / `install/install.sh`，
 *   但这两个文件在仓库里**根本不存在**，文档还写着"两份脚本都实测跑通了 doctor"。
 *   结果是新用户照文档走第一步就 404。
 *
 * 设计原则（一条实现，多个入口，杜绝文档与代码漂移）：
 *   真正的安装逻辑**只在这里**；`install/install.sh` 与 `install/install.ps1`
 *   只是把参数转给 `node scripts/cli.mjs install` 的薄包装。
 *
 * 安全约定：
 *   - 目录名必须是 `lezi-bench`（Skill 规范要求 name == 父目录名，写错会被宿主静默跳过）；
 *   - 目标是本 skill → 先备份再替换，只保留最近 2 份备份；
 *   - 目标是**别人的**同名目录 → 拒绝，除非显式 --force（绝不静默删别人的东西）；
 *   - 装完真跑一次 doctor，跑不过就 exit 3，不谎报安装成功。
 */
import { existsSync, readFileSync } from 'node:fs';
import { access, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { syncSkill, runInstalledDoctor, SKILL_NAME } from './sync-skill.mjs';
import { EXAM_VERSION, catalogFingerprint } from '../src/exam/manifest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const EXIT = {
  OK: 0,
  USAGE: 1,
  CONFLICT: 2,
  VERIFY: 3,
  NO_ROOT: 4,
};

const MAX_BACKUPS = 2;

/** 按顺序列出候选技能根（不创建任何目录） */
export function candidateSkillRoots(cwd = process.cwd(), env = process.env) {
  const home = os.homedir();
  const list = [
    { dir: path.join(cwd, '.agents', 'skills'), label: '工作区级 .agents/skills（rank 200）' },
    { dir: path.join(cwd, '.dsh', 'skills'), label: '工作区级 .dsh/skills（rank 100）' },
  ];
  if (env.DSH_HOME) list.push({ dir: path.join(env.DSH_HOME, 'skills'), label: '$DSH_HOME/skills（rank 400）' });
  list.push({ dir: path.join(home, '.agents', 'skills'), label: '用户级 ~/.agents/skills（rank 500）' });
  return list;
}

async function isWritableDir(dir) {
  try {
    const s = await stat(dir);
    if (!s.isDirectory()) return false;
    await access(dir, 0o2 /* W_OK */);
    return true;
  } catch {
    return false;
  }
}

/**
 * 选定技能根：优先用**已存在且可写**的根（按优先级），
 * 全都不存在时回落到用户级 `~/.agents/skills`（不往当前工作区里乱建目录）。
 */
export async function resolveSkillRoot({ target, cwd = process.cwd(), env = process.env } = {}) {
  if (target) {
    const dir = path.resolve(target);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    if (!(await isWritableDir(dir))) throw new InstallError(`目标目录不可写：${dir}`, EXIT.NO_ROOT);
    return { root: dir, label: '--target 指定' };
  }
  const candidates = candidateSkillRoots(cwd, env);
  for (const c of candidates) {
    if (existsSync(c.dir) && (await isWritableDir(c.dir))) return { root: c.dir, label: c.label };
  }
  const fallback = candidates[candidates.length - 1];
  try {
    await mkdir(fallback.dir, { recursive: true });
    if (await isWritableDir(fallback.dir)) return { root: fallback.dir, label: fallback.label };
  } catch { /* 落到下面抛错 */ }
  throw new InstallError(
    `找不到可写的技能目录。已尝试：\n${candidates.map((c) => `  - ${c.dir}`).join('\n')}\n`
    + '请用 --target <技能根目录> 显式指定。',
    EXIT.NO_ROOT,
  );
}

export class InstallError extends Error {
  constructor(message, code = EXIT.USAGE) {
    super(message);
    this.code = code;
  }
}

/** 该目录是不是「本 skill」（认 package.json 的 name） */
export function isOurSkill(dir) {
  const pkg = path.join(dir, 'package.json');
  if (!existsSync(pkg)) return false;
  try {
    return JSON.parse(readFileSync(pkg, 'utf8')).name === SKILL_NAME;
  } catch {
    return false;
  }
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('Z', 'Z');
}

async function pruneBackups(root, log) {
  const prefix = `${SKILL_NAME}.bak-`;
  let names = [];
  try {
    names = (await readdir(root)).filter((n) => n.startsWith(prefix)).sort();
  } catch { return []; }
  const removed = [];
  while (names.length > MAX_BACKUPS) {
    const victim = names.shift();
    await rm(path.join(root, victim), { recursive: true, force: true });
    removed.push(victim);
  }
  if (removed.length && log) log.push(`清理旧备份（保留最近 ${MAX_BACKUPS} 份）：${removed.join('、')}`);
  return removed;
}

/**
 * 安装（幂等）。
 * @returns {Promise<{code:number, dest:string, root:string, backup:string|null, logs:string[]}>}
 */
export async function install({ target, force = false, cwd = process.cwd(), env = process.env } = {}) {
  const logs = [];
  const { root, label } = await resolveSkillRoot({ target, cwd, env });
  logs.push(`技能根：${root}（${label}）`);

  const dest = path.join(root, SKILL_NAME);
  let backup = null;

  if (existsSync(dest)) {
    if (!isOurSkill(dest)) {
      if (!force) {
        throw new InstallError(
          `目标位置已存在一个**不是** LeziBench 的目录：${dest}\n`
          + '为免误删别人的文件，安装已中止。确认要覆盖请加 --force。',
          EXIT.CONFLICT,
        );
      }
      logs.push(`⚠️ 目标不是 LeziBench，但已指定 --force，将先备份再覆盖：${dest}`);
    }
    backup = path.join(root, `${SKILL_NAME}.bak-${stamp()}`);
    await rm(backup, { recursive: true, force: true });
    await import('node:fs/promises').then(({ rename }) => rename(dest, backup));
    logs.push(`已备份旧版本 → ${backup}`);
  }

  const res = await syncSkill({ target: dest, verbose: false });
  if (!res.ok) {
    const detail = [...res.errs, ...res.mismatches].join('；');
    throw new InstallError(`写入后自检失败：${detail}`, EXIT.VERIFY);
  }
  logs.push('文件已复制，逐文件哈希与源一致');

  const doc = await runInstalledDoctor(dest);
  logs.push(doc.ok ? '安装后 doctor 通过' : `安装后 doctor 失败：\n${doc.output}`);
  if (!doc.ok) {
    throw new InstallError(
      `装好了但 doctor 没通过，本次安装不算成功。\n${doc.output}`,
      EXIT.VERIFY,
    );
  }

  await pruneBackups(root, logs);

  return { code: EXIT.OK, dest, root, backup, logs };
}

/** 卸载：只删 lezi-bench/，备份保留（可回滚） */
export async function uninstall({ target, cwd = process.cwd(), env = process.env } = {}) {
  const logs = [];
  const dest = target
    ? path.join(path.resolve(target), SKILL_NAME)
    : path.join((await resolveSkillRoot({ cwd, env })).root, SKILL_NAME);

  if (!existsSync(dest)) {
    logs.push(`没有安装到 ${dest}，无需卸载。`);
    return { code: EXIT.OK, dest, removed: false, logs };
  }
  if (!isOurSkill(dest)) {
    throw new InstallError(
      `${dest} 不是 LeziBench 的安装目录（package.json name ≠ ${SKILL_NAME}），拒绝删除。`,
      EXIT.CONFLICT,
    );
  }
  await rm(dest, { recursive: true, force: true });
  logs.push(`已删除 ${dest}`);
  const root = path.dirname(dest);
  const backups = (await readdir(root).catch(() => [])).filter((n) => n.startsWith(`${SKILL_NAME}.bak-`));
  if (backups.length) logs.push(`保留了 ${backups.length} 份备份（可手动回滚）：${backups.join('、')}`);
  return { code: EXIT.OK, dest, removed: true, logs };
}

/* ───────────────────────────── CLI 入口 ───────────────────────────── */

export function parseInstallArgs(argv) {
  const opts = { target: undefined, force: false, uninstall: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target') opts.target = argv[++i];
    else if (a.startsWith('--target=')) opts.target = a.slice('--target='.length);
    else if (a === '--force' || a === '-f') opts.force = true;
    else if (a === '--uninstall') opts.uninstall = true;
    else if (a === '--json') opts.json = true;
    else throw new InstallError(`未知参数：${a}`, EXIT.USAGE);
  }
  if (opts.target === '') throw new InstallError('--target 需要一个目录参数', EXIT.USAGE);
  return opts;
}

export async function runInstallCli(argv) {
  const write = (s) => process.stdout.write(`${s}\n`);
  let opts;
  try {
    opts = parseInstallArgs(argv);
    const res = opts.uninstall ? await uninstall(opts) : await install(opts);
    if (opts.json) {
      write(JSON.stringify({
        ok: true,
        action: opts.uninstall ? 'uninstall' : 'install',
        version: EXAM_VERSION,
        fingerprint: catalogFingerprint(),
        ...res,
      }, null, 2));
    } else {
      for (const l of res.logs) write(l);
      write('');
      write(`✔ ${opts.uninstall ? '卸载完成' : '安装完成'}：${res.dest}`);
      if (!opts.uninstall) {
        write(`  LeziBench v${EXAM_VERSION}  题库指纹 ${catalogFingerprint().slice(0, 12)}…`);
        write('  下一步：让 Agent 读该目录的 SKILL.md 直接开跑，或先执行');
        write(`    node "${path.join(res.dest, 'scripts', 'cli.mjs')}" doctor`);
      }
    }
    return EXIT.OK;
  } catch (err) {
    const code = err instanceof InstallError ? err.code : EXIT.USAGE;
    if (opts?.json) write(JSON.stringify({ ok: false, error: err.message, code }, null, 2));
    else process.stderr.write(`✘ 安装失败：${err.message}\n`);
    return code;
  }
}

export { HERE };
