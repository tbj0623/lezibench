#!/usr/bin/env node
/**
 * 把仓库内容同步成一份「可安装的 Skill 目录」。
 *
 * 为什么需要它：
 *  - Agent Skills 规范要求 name 字段 == 父目录名，所以安装目录必须叫 lezi-bench/
 *  - 之前出现过「只改了 SKILL.md，src/ 还是旧版」的事故（旧版 summarize 会把没答完误报成考完）
 *    所以这里做**全量校验**：逐文件比对哈希，任何一个文件不一致就报错退出。
 *
 * 用法：
 *   node scripts/sync-skill.mjs                  # 同步到仓库内 skills/lezi-bench/
 *   node scripts/sync-skill.mjs --target <dir>   # 同步到指定目录（如 ~/.agents/skills/lezi-bench）
 *   node scripts/sync-skill.mjs --check --target <dir>   # 只校验，不写
 */
import { parseArgs } from 'node:util';
import { isMain } from '../src/is-main.mjs';
import { cp, rm, mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';

export const SKILL_NAME = 'lezi-bench';
const REPO_ROOT = path.resolve(import.meta.dirname, '..');

// 需要进入安装包的内容（顺序即复制顺序）
const PAYLOAD = ['SKILL.md', 'package.json', 'scripts', 'src'];

function sha(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function walk(dir, base = dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full, base, out);
    } else if (e.isFile()) {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return out;
}

/** 计算某个目录下所有文件的 相对路径 → sha256 */
export async function hashTree(dir) {
  if (!existsSync(dir)) return null;
  const files = (await walk(dir)).sort();
  const out = {};
  for (const rel of files) {
    out[rel] = sha(await readFile(path.join(dir, rel)));
  }
  return out;
}

/** 解析 SKILL.md frontmatter（只支持本仓库用到的简单 YAML 子集） */
export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const out = {};
  let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const kv = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      out[key] = kv[2].trim();
    } else if (/^\s+/.test(line) && key) {
      out[key] += ` ${line.trim()}`;
    }
  }
  return out;
}

/** 校验 Skill 包是否合规 + 内容是否与源一致 */
export async function validateSkillDir(dir, { expectName = SKILL_NAME } = {}) {
  const errs = [];
  const skillMd = path.join(dir, 'SKILL.md');
  if (!existsSync(skillMd)) return { ok: false, errs: [`缺少 SKILL.md：${skillMd}`] };
  const text = await readFile(skillMd, 'utf8');
  const fm = parseFrontmatter(text);
  if (!fm) errs.push('frontmatter 缺失或不是合法 YAML');
  else {
    if (!fm.name) errs.push('缺少 name 字段');
    else {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name)) errs.push(`name「${fm.name}」不符合 kebab-case（仅小写字母/数字/单连字符）`);
      if (fm.name.length > 64) errs.push('name 超过 64 字符');
      if (fm.name.includes('--')) errs.push('name 含连续 --');
    }
    if (!fm.description) errs.push('缺少 description 字段');
    else if (fm.description.length > 1024) errs.push(`description 超过 1024 字符（当前 ${fm.description.length}）`);
    if (fm.compatibility && fm.compatibility.length > 500) errs.push('compatibility 超过 500 字符');
    if ('allowed-tools' in fm && /^\[/.test(fm['allowed-tools'])) errs.push('allowed-tools 必须是空格分隔字符串，不能是 YAML 列表');
    // 最关键：name 必须等于父目录名
    const base = path.basename(dir);
    if (fm.name && fm.name !== base) errs.push(`name「${fm.name}」必须与目录名「${base}」一致`);
    if (expectName && fm.name !== expectName) errs.push(`name 应为 ${expectName}，实际 ${fm.name}`);
  }
  // CLI 必须可执行且 doctor 通过
  const cli = path.join(dir, 'scripts', 'cli.mjs');
  if (!existsSync(cli)) errs.push('缺少 scripts/cli.mjs');
  const body = text.replace(/^---[\s\S]*?---\r?\n/, '').trim();
  if (body.length < 200) errs.push('SKILL.md 正文过短（少于 200 字符），Agent 无法据此操作');
  return { ok: errs.length === 0, errs, frontmatter: fm };
}

export async function syncSkill({ target, check = false, verbose = true } = {}) {
  const dest = target || path.join(REPO_ROOT, 'skills', SKILL_NAME);
  if (!check) {
    await mkdir(path.dirname(dest), { recursive: true });
    // 先删后拷，避免旧文件残留（例如改名后还在的老文件）
    await rm(dest, { recursive: true, force: true });
    await mkdir(dest, { recursive: true });
    for (const item of PAYLOAD) {
      const src = path.join(REPO_ROOT, item);
      if (!existsSync(src)) continue;
      await cp(src, path.join(dest, item), { recursive: true });
    }
  }
  const { ok, errs, frontmatter } = await validateSkillDir(dest, { expectName: SKILL_NAME });
  // 逐个文件比对，确保没有「只拷了 SKILL.md、src 还是旧的」这种情况
  const mismatches = [];
  for (const item of PAYLOAD) {
    const src = path.join(REPO_ROOT, item);
    const dst = path.join(dest, item);
    if (!existsSync(src)) continue;
    const s = await stat(src);
    if (s.isDirectory()) {
      const hs = await hashTree(src);
      const hd = await hashTree(dst);
      if (!hd) { mismatches.push(`${item}/ 目标缺失`); continue; }
      for (const rel of Object.keys(hs)) {
        if (hs[rel] !== hd[rel]) mismatches.push(`${item}/${rel} 内容不一致或缺失`);
      }
      for (const rel of Object.keys(hd)) {
        if (!(rel in hs)) mismatches.push(`${item}/${rel} 是源里没有的多余文件`);
      }
    } else {
      const hs = sha(await readFile(src));
      const hd = existsSync(dst) ? sha(await readFile(dst)) : null;
      if (hs !== hd) mismatches.push(`${item} 内容不一致或缺失`);
    }
  }
  const result = { dest, ok: ok && mismatches.length === 0, errs, mismatches, frontmatter };
  if (verbose) {
    if (result.ok) console.log(`✔ Skill 包校验通过：${dest}\n  name=${frontmatter?.name}  文件逐一致，frontmatter 合规`);
    else {
      console.error(`✘ Skill 包校验失败：${dest}`);
      for (const e of errs) console.error(`  - ${e}`);
      for (const m of mismatches) console.error(`  - ${m}`);
    }
  }
  return result;
}

/** 用子进程真的跑一次 doctor，确认安装后的包能运行 */
export async function runInstalledDoctor(dir) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  try {
    const { stdout } = await run(process.execPath, [path.join(dir, 'scripts', 'cli.mjs'), 'doctor'], {
      cwd: dir,
      env: { ...process.env, LEZIBENCH_HOME: path.join(os.tmpdir(), 'lezi-doctor-probe') },
      timeout: 30000,
    });
    return { ok: stdout.includes('全部通过'), output: stdout };
  } catch (err) {
    return { ok: false, output: `${err.message}\n${err.stdout || ''}\n${err.stderr || ''}` };
  }
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: { target: { type: 'string' }, check: { type: 'boolean', default: false } },
    allowPositionals: true,
  });
  const res = await syncSkill({ target: values.target, check: values.check });
  if (!res.ok) process.exit(1);
  const doc = await runInstalledDoctor(res.dest);
  if (!doc.ok) {
    console.error('✘ 安装后的包无法通过 doctor：');
    console.error(doc.output);
    process.exit(1);
  }
  console.log('✔ 安装后的包 doctor 通过');
}
