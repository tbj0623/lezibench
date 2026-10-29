/**
 * CLI 与存储层测试（node --test）
 * 覆盖：doctor / start / submit / status / resume / report / regrade / list / version
 *       + 路径穿越 / 大文件 / 坏 JSON / 幂等 / 冲突 / 原子写
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  resolveDataRoot, newRunId, assertSafeRunId, runDir, atomicWrite, atomicWriteJson,
  readJson, probeWritable, resolveOutputPath, DATA_DIR_ENV,
} from '../src/storage/store.mjs';
import { doctor, startRun, submitBatch, statusRun, loadState, buildReport, writeReport, regradeRun } from '../src/runner.mjs';
import { perfectAnswers } from '../scripts/oracle-answers.mjs';
import { itemsForBatch, BATCHES } from '../src/exam/manifest.mjs';
import { validateSkillDir, parseFrontmatter, hashTree } from '../scripts/sync-skill.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, '..', 'scripts', 'cli.mjs');
const REPO = path.resolve(HERE, '..');
const run = promisify(execFile);

async function cli(args, opts = {}) {
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args], {
      cwd: REPO,
      env: { ...process.env, ...(opts.env || {}) },
      timeout: 60000,
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

async function tmpRoot() {
  return mkdtemp(path.join(os.tmpdir(), 'lezi-cli-'));
}

/* ------------------------------- 存储层 ------------------------------- */

test('resolveDataRoot: 环境变量优先，各平台路径正确', () => {
  assert.equal(resolveDataRoot({ [DATA_DIR_ENV]: '/custom/path' }), path.resolve('/custom/path'));
  const root = resolveDataRoot({});
  if (process.platform === 'win32') {
    assert.ok(/LeziBench$/.test(root), `Windows 应落到 .../LeziBench，实际 ${root}`);
  } else if (process.platform === 'darwin') {
    assert.ok(root.includes(path.join('Library', 'Application Support', 'LeziBench')), root);
  } else {
    assert.ok(/lezibench$/.test(root), `Linux 应落到 .../lezibench，实际 ${root}`);
  }
  // XDG_DATA_HOME 只在非 Windows/macOS 上生效
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    assert.equal(resolveDataRoot({ XDG_DATA_HOME: '/data' }), path.join('/data', 'lezibench'));
  }
});

test('assertSafeRunId: 拒绝路径穿越与非法字符', () => {
  for (const bad of ['../../etc', '..\\..\\win', 'a/b', 'a\\b', '..', '', 'x'.repeat(200), 'a b']) {
    assert.throws(() => assertSafeRunId(bad), `应拒绝：${bad}`);
  }
  for (const good of ['run-20260101-000000-abcdef', 'abc123', 'A-b_c.d']) {
    assert.equal(assertSafeRunId(good), good);
  }
});

test('runDir: 解析结果不得越出数据根', async () => {
  const root = await tmpRoot();
  try {
    const d = runDir(root, 'run-20260101-000000-aaaaaa');
    assert.ok(d.startsWith(root));
    assert.throws(() => runDir(root, '../evil'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('atomicWrite: 真写盘、内容正确、无临时文件残留', async () => {
  const dir = await tmpRoot();
  try {
    const f = path.join(dir, 'sub', 'a.txt');
    await atomicWrite(f, '你好世界');
    assert.equal(await readFile(f, 'utf8'), '你好世界');
    const entries = await (await import('node:fs/promises')).readdir(path.dirname(f));
    assert.deepEqual(entries, ['a.txt'], '不应残留 .tmp 文件');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('atomicWrite 覆盖已有文件（Windows rename 退化路径）', async () => {
  const dir = await tmpRoot();
  try {
    const f = path.join(dir, 'b.json');
    await atomicWriteJson(f, { v: 1 });
    await atomicWriteJson(f, { v: 2 });
    assert.deepEqual(await readJson(f), { v: 2 });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('probeWritable: 可写目录返回 ok，不可写返回具体错误', async () => {
  const dir = await tmpRoot();
  try {
    const ok = await probeWritable(dir);
    assert.equal(ok.ok, true);
    const bad = await probeWritable(path.join(dir, 'a\0b'));
    assert.equal(bad.ok, false);
    assert.ok(bad.error && bad.error.length > 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('resolveOutputPath: 相对路径按 cwd 解析，绝对路径保持', () => {
  const rel = resolveOutputPath('out/x.html', '/base');
  assert.equal(rel, path.resolve('/base', 'out/x.html'));
  const abs = path.resolve('/tmp/y.html');
  assert.equal(resolveOutputPath(abs, '/base'), path.normalize(abs));
  assert.throws(() => resolveOutputPath(''));
});

/* --------------------------------- CLI --------------------------------- */

test('CLI: version 返回 JSON 且含版本号', async () => {
  const r = await cli(['version', '--json']);
  assert.equal(r.code, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.ok(j.examVersion && j.graderVersion);
  assert.equal(j.cli, 'lezi-bench');
});

test('CLI: help 列出全部命令', async () => {
  const r = await cli(['--help']);
  assert.equal(r.code, 0);
  for (const c of ['doctor', 'start', 'submit', 'status', 'resume', 'report', 'regrade']) {
    assert.ok(r.stdout.includes(c), `help 应包含 ${c}`);
  }
});

test('CLI: 未知命令退出码 2', async () => {
  const r = await cli(['nonsense']);
  assert.equal(r.code, 2);
  assert.ok(r.stderr.includes('未知命令'));
});

test('CLI: 缺必需参数退出码 2 且给出提示', async () => {
  for (const args of [['submit'], ['status'], ['report'], ['regrade']]) {
    const r = await cli(args);
    assert.equal(r.code, 2, `${args.join(' ')} 应返回 2`);
    assert.ok(/缺少必需参数/.test(r.stderr), `${args.join(' ')} 应提示缺参数`);
  }
});

test('CLI: 全流程 start → submit×4 → report（独立数据目录）', async () => {
  const root = await tmpRoot();
  const env = { LEZIBENCH_HOME: root };
  try {
    const doc = await cli(['doctor', '--json'], { env });
    assert.equal(doc.code, 0, doc.stderr);
    assert.equal(JSON.parse(doc.stdout).ok, true);

    const st = await cli(['start', '--mode', 'standard', '--seed', 'cli-e2e', '--json'], { env });
    assert.equal(st.code, 0, st.stderr);
    const start = JSON.parse(st.stdout);
    assert.ok(start.runId);
    assert.equal(start.items.length, 4);
    // 绝不能把答案/事实泄露给答题方
    const leaked = JSON.stringify(start);
    assert.ok(!leaked.includes('oracle'), '不得泄露 oracle');
    assert.ok(!leaked.includes('facts'), '不得泄露 facts');
    assert.ok(!/"answer"\s*:/.test(leaked), '不得泄露答案');

    const answers = perfectAnswers('cli-e2e');
    for (const b of BATCHES) {
      const file = path.join(root, `ans-${b}.json`);
      const payload = { answers: Object.fromEntries(itemsForBatch(b).map((i) => [i.id, answers[i.id]])) };
      await writeFile(file, JSON.stringify(payload), 'utf8');
      const sub = await cli(['submit', '--run', start.runId, '--batch', String(b), '--answers-file', file, '--json'], { env });
      assert.equal(sub.code, 0, sub.stderr);
      const j = JSON.parse(sub.stdout);
      assert.equal(j.batchAwarded, j.batchMax, `第 ${b} 批应满分`);
    }

    const status = await cli(['status', '--run', start.runId, '--json'], { env });
    assert.equal(JSON.parse(status.stdout).status, 'completed');

    const rep = await cli(['report', '--run', start.runId, '--format', 'html', '--json'], { env });
    assert.equal(rep.code, 0, rep.stderr);
    const rj = JSON.parse(rep.stdout);
    assert.equal(rj.summary.total, 100);
    assert.ok(existsSync(rj.path));
    const html = await readFile(rj.path, 'utf8');
    assert.ok(html.includes('DEMO') === false, '真实运行不该有 DEMO 水印');
    assert.ok(html.includes('100'));

    const list = await cli(['list', '--json'], { env });
    assert.ok(JSON.parse(list.stdout).runs.some((x) => x.runId === start.runId));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CLI: 坏答案文件 / 超大文件 / 非对象 都要报错而不是崩溃', async () => {
  const root = await tmpRoot();
  const env = { LEZIBENCH_HOME: root };
  try {
    const st = await cli(['start', '--seed', 'bad-file', '--json'], { env });
    const { runId } = JSON.parse(st.stdout);
    const bad = path.join(root, 'bad.json');
    await writeFile(bad, '{not json', 'utf8');
    const r1 = await cli(['submit', '--run', runId, '--batch', '1', '--answers-file', bad], { env });
    assert.equal(r1.code, 1);
    assert.ok(/不是合法 JSON/.test(r1.stderr));

    const arr = path.join(root, 'arr.json');
    await writeFile(arr, '[1,2,3]', 'utf8');
    const r2 = await cli(['submit', '--run', runId, '--batch', '1', '--answers-file', arr], { env });
    assert.equal(r2.code, 1);

    const missing = await cli(['submit', '--run', runId, '--batch', '1', '--answers-file', path.join(root, 'nope.json')], { env });
    assert.equal(missing.code, 1);
    assert.ok(/读不到答案文件/.test(missing.stderr));

    const big = path.join(root, 'big.json');
    await writeFile(big, JSON.stringify({ x: 'a'.repeat(300 * 1024) }), 'utf8');
    const r3 = await cli(['submit', '--run', runId, '--batch', '1', '--answers-file', big], { env });
    assert.equal(r3.code, 1);
    assert.ok(/过大/.test(r3.stderr));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CLI: 不存在的 run 给出可读错误', async () => {
  const root = await tmpRoot();
  try {
    const r = await cli(['status', '--run', 'run-20260101-000000-aaaaaa', '--json'], { env: { LEZIBENCH_HOME: root } });
    assert.equal(r.code, 1);
    assert.ok(/找不到运行记录/.test(r.stderr));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CLI: resume 给出下一批题目，而不是从头开始', async () => {
  const root = await tmpRoot();
  const env = { LEZIBENCH_HOME: root };
  try {
    const st = await cli(['start', '--seed', 'resume-test', '--json'], { env });
    const { runId } = JSON.parse(st.stdout);
    const answers = perfectAnswers('resume-test');
    const file = path.join(root, 'a1.json');
    await writeFile(file, JSON.stringify({ answers: Object.fromEntries(itemsForBatch(1).map((i) => [i.id, answers[i.id]])) }), 'utf8');
    await cli(['submit', '--run', runId, '--batch', '1', '--answers-file', file], { env });

    const rs = await cli(['resume', '--run', runId, '--json'], { env });
    assert.equal(rs.code, 0, rs.stderr);
    const j = JSON.parse(rs.stdout);
    assert.equal(j.nextBatch, 2);
    assert.equal(j.progress, '4/16 题');
  } finally { await rm(root, { recursive: true, force: true }); }
});

/* ------------------------------ runner 层 ------------------------------ */

test('doctor: 全项通过并给出数据目录与版本', async () => {
  const root = await tmpRoot();
  try {
    const d = await doctor({ root });
    assert.equal(d.ok, true, JSON.stringify(d.checks));
    assert.equal(d.checks.length >= 4, true);
    assert.ok(d.versions.exam && d.versions.grader);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('start: 同 seed 两次 start 得到相同题目、不同 runId', async () => {
  const root = await tmpRoot();
  try {
    const a = await startRun({ root, seed: 'same-seed' });
    const b = await startRun({ root, seed: 'same-seed' });
    assert.notEqual(a.runId, b.runId);
    assert.deepEqual(a.batch.items.map((i) => i.prompt), b.batch.items.map((i) => i.prompt));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('report: summary 格式是纯文本且含关键字段', async () => {
  const root = await tmpRoot();
  try {
    const { runId } = await startRun({ root, seed: 'summary-test' });
    const answers = perfectAnswers('summary-test');
    for (const b of BATCHES) {
      await submitBatch({ root, runId, batch: b, answers: Object.fromEntries(itemsForBatch(b).map((i) => [i.id, answers[i.id]])) });
    }
    const { path: p } = await writeReport({ root, runId, format: 'summary' });
    const txt = await readFile(p, 'utf8');
    assert.ok(txt.includes('100 / 100'));
    assert.ok(txt.includes('指令理解'));
    assert.ok(txt.includes('LOCAL_SELF_TEST'));
    assert.ok(txt.includes('exam v'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('report --out: 可写到任意用户指定路径', async () => {
  const root = await tmpRoot();
  const outDir = await tmpRoot();
  try {
    const { runId } = await startRun({ root, seed: 'out-test' });
    const answers = perfectAnswers('out-test');
    for (const b of BATCHES) {
      await submitBatch({ root, runId, batch: b, answers: Object.fromEntries(itemsForBatch(b).map((i) => [i.id, answers[i.id]])) });
    }
    const custom = path.join(outDir, 'nested', 'my-report.html');
    const { path: p } = await writeReport({ root, runId, format: 'html', out: custom });
    assert.equal(p, path.normalize(custom));
    assert.ok(existsSync(custom));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outDir, { recursive: true, force: true });
  }
});

test('regrade: 分数不变时不产生伪差异，且原答案指纹受保护', async () => {
  const root = await tmpRoot();
  try {
    const { runId } = await startRun({ root, seed: 'regrade-test' });
    const answers = perfectAnswers('regrade-test');
    for (const b of BATCHES) {
      await submitBatch({ root, runId, batch: b, answers: Object.fromEntries(itemsForBatch(b).map((i) => [i.id, answers[i.id]])) });
    }
    const r = await regradeRun({ root, runId });
    assert.equal(r.diffs.length, 0, '同版本重判不应有分数变化');
    assert.equal(r.beforeTotal, 100);
    assert.equal(r.afterTotal, 100);

    // 篡改原始答案文件后重判必须拒绝
    const { paths } = await loadState(root, runId);
    const f = path.join(paths.answers, '1-I01.json');
    const saved = JSON.parse(await readFile(f, 'utf8'));
    saved.rawAnswer = { deadline: '改了', budgetAttached: true };
    await writeFile(f, JSON.stringify(saved), 'utf8');
    await assert.rejects(() => regradeRun({ root, runId }), /指纹与记录不一致/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

/* --------------------------- Skill 包自检 --------------------------- */

test('Skill 包：frontmatter 合规、name 与目录一致、内容与源逐一致', async () => {
  const dir = path.join(REPO, 'skills', 'lezi-bench');
  if (!existsSync(dir)) {
    // 还没同步时不算失败，但要在输出里明确说明
    console.log('  （skills/lezi-bench 尚未生成，跳过——请先运行 node scripts/sync-skill.mjs）');
    return;
  }
  const r = await validateSkillDir(dir, { expectName: 'lezi-bench' });
  assert.equal(r.ok, true, `校验失败：${[...(r.errs || []), ...(r.mismatches || [])].join('; ')}`);
  assert.equal(r.frontmatter.name, 'lezi-bench');
  assert.ok(r.frontmatter.description.length <= 1024);
  assert.ok(!('disable-model-invocation' in r.frontmatter), '不得禁用模型调用，否则模型看不到这个 skill');
});

test('Skill 包：SKILL.md 里的命令都能被 CLI 支持', async () => {
  const f = path.join(REPO, 'SKILL.md');
  const text = await readFile(f, 'utf8');
  const cmds = [...text.matchAll(/cli\.mjs\s+([a-z]+)/g)].map((m) => m[1]);
  const known = new Set(['doctor', 'start', 'submit', 'status', 'resume', 'report', 'regrade', 'list', 'version']);
  for (const c of cmds) assert.ok(known.has(c), `SKILL.md 引用了一个 CLI 不认识的命令：${c}`);
  assert.ok(cmds.includes('doctor'), 'SKILL.md 必须要求先跑 doctor');
});

test('parseFrontmatter: 简单 YAML 解析', () => {
  const fm = parseFrontmatter('---\nname: abc\ndescription: hello world\nlicense: MIT\n---\n\nbody');
  assert.equal(fm.name, 'abc');
  assert.equal(fm.description, 'hello world');
  assert.equal(parseFrontmatter('no frontmatter'), null);
});

/* ------------------------------------------------------------------ *
 * 审计发现：atomicWrite 退化成裸 writeFile 也无人检出
 * 这里直接检查实现特征（临时文件 + rename），因为行为测试很难区分两者。
 * ------------------------------------------------------------------ */
test('atomicWrite 必须是「先写临时文件再 rename」，不能退化成裸 writeFile', async () => {
  const src = await readFile(path.join(REPO, 'src', 'storage', 'store.mjs'), 'utf8');
  const fnStart = src.indexOf('export async function atomicWrite(');
  assert.ok(fnStart > 0, '找不到 atomicWrite 定义');
  const fnBody = src.slice(fnStart, fnStart + 2000);
  assert.ok(/\.tmp/.test(fnBody), 'atomicWrite 应使用 .tmp 临时文件');
  assert.ok(/rename\(/.test(fnBody), 'atomicWrite 应使用 rename 原子替换');
  assert.ok(/\.sync\(\)/.test(fnBody), 'atomicWrite 应 fsync 后才 rename');
});

test('atomicWrite 并发写入同一文件后，最终内容必须是其中一次的完整值', async () => {
  // 说明：不做「写入过程中高频读」的测试 —— 在 Windows 上 rename 覆盖会退化成
  // unlink+rename，存在极短暂的「文件不存在」窗口，那是 OS 语义不是缺陷。
  // 真正要保证的不变量是：并发写完之后，文件内容完整且等于某一次写入的值。
  const dir = await tmpRoot();
  try {
    const f = path.join(dir, 'concurrent.json');
    const payloads = Array.from({ length: 8 }, (_, i) => ({ v: i, data: 'x'.repeat(5000 + i * 100) }));
    await Promise.all(payloads.map((p) => atomicWriteJson(f, p)));
    const txt = await readFile(f, 'utf8');
    const got = JSON.parse(txt); // 必须是完整合法 JSON
    assert.ok(payloads.some((p) => p.v === got.v && p.data.length === got.data.length), '最终内容不等于任何一次写入的值');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
