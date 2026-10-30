#!/usr/bin/env node
/**
 * qa/host/verify-skill.mjs —— LeziBench Skill 安装结构验证（不依赖任何第三方库）
 *
 * 验证内容（对应 research/PLATFORM_NOTES.md §1 的规范硬性要求）：
 *   1. 目录名 == frontmatter.name，且 name 满足 [a-z0-9] + 单连字符
 *   2. frontmatter 是合法 YAML 子集，name / description 必需且长度合规
 *   3. license 存在；compatibility ≤ 500 字符
 *   4. allowed-tools 若存在必须是空格分隔字符串（不是 YAML 列表）
 *   5. 不得设置 disable-model-invocation: true（否则模型侧不可见）
 *   6. 正文非空，且包含操作规程必需的小节
 *   7. scripts/cli.mjs 与 src/ 存在，且 `node scripts/cli.mjs doctor` 退出码 0
 *   8. 传入 --source 时，校验安装副本与仓库根 SKILL.md 逐字节一致
 *
 * 用法：
 *   node qa/host/verify-skill.mjs                       # 校验本仓库默认的两个安装点
 *   node qa/host/verify-skill.mjs --dir <skill 目录>     # 校验指定安装点
 *   node qa/host/verify-skill.mjs --dir <d> --source lezibench/SKILL.md
 *   node qa/host/verify-skill.mjs --json                # 机器可读结果
 *
 * 退出码：0 全部通过；1 有失败项。
 */
import { readFile, readdir, stat, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);

/* ---------------------------- frontmatter 解析 ---------------------------- */

/**
 * 极简 YAML 子集解析：只支持顶层 `key: value`，以及 `key:` 后跟 `- item` 的块列表。
 * 足够判定规范要求，且不引入依赖。
 */
export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { ok: false, error: '缺少 --- 包裹的 YAML frontmatter', data: {}, body: text };
  const raw = m[1];
  const body = m[2];
  const data = {};
  const order = [];
  const lines = raw.split(/\r?\n/);
  let currentKey = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem) {
      if (currentKey === null) return { ok: false, error: `第 ${i + 1} 行：列表项没有所属 key`, data, body };
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      data[currentKey].push(stripQuotes(listItem[1].trim()));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
    if (!kv) return { ok: false, error: `第 ${i + 1} 行无法解析为 key: value：${line}`, data, body };
    const key = kv[1];
    const rest = kv[2];
    if (rest === '' || rest === '|' || rest === '>') {
      currentKey = key;
      data[key] = '';
      order.push(key);
    } else {
      currentKey = null;
      data[key] = stripQuotes(rest);
      order.push(key);
    }
  }
  return { ok: true, data, body, order, raw };
}

function stripQuotes(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}

export function charLen(s) {
  return typeof s === 'string' ? [...s].length : 0;
}

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 纯函数式规范校验（不碰磁盘），便于单测和复用 */
export function validateSpec({ dirName, fm, body }) {
  const checks = [];
  const add = (ok, name, detail) => checks.push({ ok: !!ok, name, detail });

  add(fm.ok, 'frontmatter 可解析', fm.ok ? 'YAML 顶层 key/value 解析成功' : fm.error);

  const name = fm.data.name;
  add(typeof name === 'string' && name.length > 0, 'name 存在', name ? `name=${name}` : '缺少 name 字段');
  if (typeof name === 'string' && name.length > 0) {
    add(name.length <= 64, 'name 长度 ≤64', `${charLen(name)} 字符`);
    add(NAME_RE.test(name), 'name 字符集合规', NAME_RE.test(name) ? '仅小写字母/数字/单连字符' : `非法：${name}（不得大写、下划线、连续 --、首尾 -）`);
    add(name === dirName, 'name == 父目录名', name === dirName ? `都是 ${dirName}` : `name=${name}，目录=${dirName}`);
  }

  const desc = fm.data.description;
  add(typeof desc === 'string' && desc.trim().length > 0, 'description 存在', desc ? `${charLen(desc)} 字符` : '缺少 description 字段');
  if (typeof desc === 'string' && desc.trim()) {
    add(charLen(desc) <= 1024, 'description ≤1024', `${charLen(desc)} 字符`);
    const triggers = ['跑分', '评测', 'LeziBench', '能力体检'];
    const hit = triggers.filter((t) => desc.toLowerCase().includes(t.toLowerCase()));
    add(hit.length >= 3, 'description 含触发词', `命中 ${hit.length}/4：${hit.join(' / ') || '无'}`);
  }

  add(typeof fm.data.license === 'string' && fm.data.license.trim() !== '', 'license 存在', fm.data.license || '缺少 license');

  const compat = fm.data.compatibility;
  const compatOk = typeof compat === 'string' && charLen(compat) > 0 && charLen(compat) <= 500;
  add(compatOk, 'compatibility ≤500', compat ? `${charLen(compat)} 字符` : '缺少 compatibility');

  const at = fm.data['allowed-tools'];
  if (at === undefined) {
    add(true, 'allowed-tools 写法', '未声明（合法，本 Skill 不限制工具）');
  } else {
    add(typeof at === 'string', 'allowed-tools 为空格分隔字符串', typeof at === 'string' ? '字符串 ✓' : '被解析成列表 / 非字符串 ✗（规范要求空格分隔字符串）');
  }

  const dmi = fm.data['disable-model-invocation'];
  const dmiTrue = typeof dmi === 'string' && /^(true|yes|on|1)$/i.test(dmi.trim());
  add(!dmiTrue, '模型侧可见', dmiTrue ? 'disable-model-invocation: true → 模型目录里看不到，等于废掉' : '未禁用模型调用');

  const ui = fm.data['user-invocable'];
  const uiFalse = typeof ui === 'string' && /^(false|no|off|0)$/i.test(ui.trim());
  add(!uiFalse, '用户可 /lezibench 调用', uiFalse ? 'user-invocable: false' : '默认允许');

  add(body.trim().length > 0, '正文非空', `${body.split(/\r?\n/).length} 行 / ${charLen(body)} 字符`);
  const required = ['doctor', 'start', 'submit', 'report', 'resume', 'status', 'regrade', 'NEEDS_REVIEW'];
  const missing = required.filter((k) => !body.includes(k));
  add(missing.length === 0, '正文覆盖全部子命令与异常态', missing.length ? `缺少：${missing.join(', ')}` : '全部命中');

  return checks;
}

/* ------------------------------- 磁盘侧验证 ------------------------------- */

async function dirExists(p) {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function verifyOne(dir, { source, json }) {
  const abs = path.resolve(dir);
  const result = { dir: abs, ok: false, checks: [], doctor: null };

  if (!(await dirExists(abs))) {
    result.checks.push({ ok: false, name: '目录存在', detail: `不存在或不是目录：${abs}` });
    return result;
  }
  const dirName = path.basename(abs);
  const skillFile = path.join(abs, 'SKILL.md');
  if (!existsSync(skillFile)) {
    result.checks.push({ ok: false, name: 'SKILL.md 存在', detail: `缺少 ${skillFile}` });
    return result;
  }
  const text = await readFile(skillFile, 'utf8');
  const fm = parseFrontmatter(text);
  result.checks.push(...validateSpec({ dirName, fm, body: fm.body }));

  // 目录结构：scripts/ 与 src/ 必须是同层（DSH 只扫一层，嵌套不会被发现）
  const entries = await readdir(abs, { withFileTypes: true });
  const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  for (const need of ['scripts', 'src']) {
    result.checks.push({ ok: dirNames.includes(need), name: `${need}/ 与 SKILL.md 同层`, detail: dirNames.includes(need) ? '存在' : `缺少 ${need}/` });
  }
  const cli = path.join(abs, 'scripts', 'cli.mjs');
  result.checks.push({ ok: existsSync(cli), name: 'scripts/cli.mjs 存在', detail: existsSync(cli) ? cli : `缺少 ${cli}` });

  if (source) {
    try {
      const srcBuf = await readFile(path.resolve(source));
      const dstBuf = await readFile(skillFile);
      const same = srcBuf.equals(dstBuf);
      result.checks.push({ ok: same, name: '与仓库根 SKILL.md 逐字节一致', detail: same ? `${srcBuf.length} 字节完全相同` : `长度 ${srcBuf.length} vs ${dstBuf.length}，内容不一致` });
    } catch (err) {
      result.checks.push({ ok: false, name: '与仓库根 SKILL.md 逐字节一致', detail: `读取失败：${err.message}` });
    }
  }

  // 真跑一次 doctor（用临时数据根，避免污染用户的默认数据目录）
  if (existsSync(cli)) {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'lezi-verify-'));
    const started = Date.now();
    try {
      const { stdout, stderr } = await execFileP(process.execPath, [cli, 'doctor'], {
        cwd: abs,
        env: { ...process.env, LEZIBENCH_HOME: tmp },
        timeout: 60000,
        maxBuffer: 1 << 20,
      });
      const out = `${stdout}\n${stderr}`.trim();
      const allOk = /全部通过/.test(out) && !/✘/.test(out);
      result.doctor = { exitCode: 0, ms: Date.now() - started, output: out };
      result.checks.push({ ok: allOk, name: 'node scripts/cli.mjs doctor 退出码 0', detail: `exit=0，${Date.now() - started}ms` });
    } catch (err) {
      result.doctor = { exitCode: err.code ?? 'ERR', ms: Date.now() - started, output: `${err.stdout || ''}\n${err.stderr || err.message}`.trim() };
      result.checks.push({ ok: false, name: 'node scripts/cli.mjs doctor 退出码 0', detail: `exit=${err.code ?? 'ERR'}：${String(err.stdout || err.stderr || err.message).slice(0, 300)}` });
    } finally {
      await rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  }

  result.ok = result.checks.every((c) => c.ok);
  return result;
}

/* ---------------------------------- CLI ---------------------------------- */

function parseArgv(argv) {
  const out = { dirs: [], source: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--dir') out.dirs.push(argv[++i]);
    else if (a === '--source') out.source = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a.startsWith('--dir=')) out.dirs.push(a.slice(6));
    else if (a.startsWith('--source=')) out.source = a.slice(9);
    else throw new Error(`未知参数：${a}`);
  }
  return out;
}

export async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgv(argv);
  } catch (err) {
    console.error(`错误：${err.message}`);
    return 2;
  }
  if (args.help) {
    console.log('用法：node evidence/host/verify-skill.mjs [--dir <skill 目录>]... [--source <SKILL.md>] [--json]');
    return 0;
  }

  if (args.dirs.length === 0) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const repo = path.resolve(here, '..', '..');
    // 只检查**真实存在**的安装点：工作区级 .agents/skills 是可选的，
    // 没装过不该算「失败」（v1.4 修复：原来会把不存在的可选路径当失败项，导致总体永远不过）。
    const candidates = [
      path.join(repo, '.agents', 'skills', 'lezi-bench'),
      path.join(os.homedir(), '.agents', 'skills', 'lezi-bench'),
    ];
    for (const c of candidates) if (existsSync(c)) args.dirs.push(c);
    if (args.dirs.length === 0) args.dirs.push(path.join(os.homedir(), '.agents', 'skills', 'lezi-bench'));
    // v1.4 修复：这里原本是 path.join(repo, 'lezibench', 'SKILL.md')。
    // 本脚本位于 <repo>/evidence/host/，`repo` 已经是仓库根，
    // 再拼一层 'lezibench' 就变成 <repo>/lezibench/SKILL.md —— 必然 ENOENT（假红）。
    if (!args.source) args.source = path.join(repo, 'SKILL.md');
  }

  const results = [];
  for (const d of args.dirs) results.push(await verifyOne(d, args));

  if (args.json) {
    console.log(JSON.stringify({ ok: results.every((r) => r.ok), results }, null, 2));
  } else {
    for (const r of results) {
      console.log(`\n=== ${r.dir} ===`);
      for (const c of r.checks) console.log(`  ${c.ok ? '✔' : '✘'} ${c.name}：${c.detail}`);
      console.log(`  → ${r.ok ? '通过' : '未通过'}`);
    }
    console.log(`\n总体：${results.every((r) => r.ok) ? '全部通过' : '存在失败项'}`);
  }
  return results.every((r) => r.ok) ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('verify-skill.mjs')) {
  const code = await main();
  process.exit(code ?? 0);
}
