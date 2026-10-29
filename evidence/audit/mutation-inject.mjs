#!/usr/bin/env node
/**
 * 真实变异注入（第三方审计用）
 *
 * 与项目自带的 tests/mutation.mjs 不同：那个是「在内存里构造错误答案，看判分器是否扣分」，
 * 属于**行为测试**。本脚本做的是**真正的源码变异**：改源码 → 跑 `node --test` → 必须变红。
 * 只有这样才能证明「测试真的会失败」，而不是 assert(true)。
 *
 * 做法：把 lezibench/ 复制到临时目录，对副本逐条注入缺陷，在副本里跑官方测试命令。
 * 绝不修改工作区里的被测代码。
 *
 * 运行：node qa/audit/mutation-inject.mjs [--keep]
 */
import { spawnSync } from 'node:child_process';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AUDIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(AUDIT_DIR, '..', '..', 'lezibench');
const KEEP = process.argv.includes('--keep');

/** @type {{id:string,名:string,期望:string,file:string,apply:(s:string)=>string}[]} */
const MUTANTS = [
  {
    id: 'M1',
    名: '翻转标准答案（I01 oracle 的 budgetAttached 取反）',
    期望: '「oracle 答案必须满分」类断言变红',
    file: 'src/exam/items/instruction.mjs',
    apply: (s) => {
      // I01 oracle 现在返回 budgetAttached: facts.attachRequired → 取反即为「翻转标准答案」
      const anchor = 'budgetAttached: facts.attachRequired,';
      if (!s.includes(anchor)) throw new Error('M1 定位失败：找不到 I01 oracle 的 budgetAttached: facts.attachRequired');
      return s.replace(anchor, 'budgetAttached: !facts.attachRequired, // MUTANT');
    },
  },
  {
    id: 'M2',
    名: '删掉一个评分条件（I02 的 C2）',
    期望: '「条件合计 == 满分」或「criterionId 必须对应」类断言变红',
    file: 'src/exam/items/instruction.mjs',
    apply: (s) => {
      const re = /\s*\{ id: 'I02\.C2', points: 2, text: '[^']*' \},/;
      if (!re.test(s)) throw new Error('M2 定位失败：找不到 I02.C2 条件');
      return s.replace(re, '');
    },
  },
  {
    id: 'M3',
    名: '破坏段位阈值（卓越门槛 90 → 95）',
    期望: '「段位阈值与产品 PRD 一致」断言变红',
    file: 'src/exam/manifest.mjs',
    apply: (s) => {
      const re = /\{ min: 90, max: 100, label: '卓越'/;
      if (!re.test(s)) throw new Error('M3 定位失败：找不到卓越阈值');
      return s.replace(re, "{ min: 95, max: 100, label: '卓越'");
    },
  },
  {
    id: 'M4',
    名: '改题分（I01 points 4 → 5，破坏 100 分合同）',
    期望: '「16题/100分」或「条件合计」断言变红',
    file: 'src/exam/items/instruction.mjs',
    apply: (s) => {
      const re = /(const I01 = \{[\s\S]*?\n\s*points: )4(,)/;
      if (!re.test(s)) throw new Error('M4 定位失败：找不到 I01 points: 4');
      return s.replace(re, '$15$2');
    },
  },
  {
    id: 'M5',
    名: '判分器放水（gradeItem 内 awarded 恒等于满分）',
    期望: '「错误答案必定 0 分」断言变红',
    file: 'src/grading/grade.mjs',
    apply: (s) => {
      const re = /const awarded = normalizedChecks\.reduce\(\(s, c\) => s \+ \(c\.passed \? c\.points : 0\), 0\);/;
      if (!re.test(s)) throw new Error('M5 定位失败：找不到 awarded 计算行');
      return s.replace(re, 'const awarded = item.points; // MUTANT');
    },
  },
  {
    id: 'M6',
    名: '缺答闸门失效（submitBatch 里 allowMissing 永远为真）',
    期望: '「缺答必须阻断提交」断言变红',
    file: 'src/runner.mjs',
    apply: (s) => {
      const re = /if \(missing\.length > 0 && opts\.allowMissing !== true\) \{/;
      if (!re.test(s)) throw new Error('M6 定位失败：找不到缺答闸门');
      return s.replace(re, 'if (false) { // MUTANT');
    },
  },
  {
    id: 'M7',
    名: '未答完也报 COMPLETED（summarize 的 complete 恒真）',
    期望: '「未答完不得给段位/COMPLETED」断言变红',
    file: 'src/grading/grade.mjs',
    apply: (s) => {
      const re = /const complete = itemResults\.length === expectTotal && pending\.length === 0;/;
      if (!re.test(s)) throw new Error('M7 定位失败：找不到 complete 判定');
      return s.replace(re, 'const complete = true; // MUTANT');
    },
  },
  {
    id: 'M8',
    名: '原子写退化（atomicWrite 直接 writeFile，去掉 rename）',
    期望: '「atomicWrite 真写盘、无临时文件残留」断言变红',
    file: 'src/storage/store.mjs',
    apply: (s) => {
      const re = /export async function atomicWrite\(file, data\) \{[\s\S]*?\n\}/;
      if (!re.test(s)) throw new Error('M8 定位失败：找不到 atomicWrite');
      return s.replace(re, `export async function atomicWrite(file, data) {
  await ensureDir(path.dirname(file));
  await writeFile(file, Buffer.isBuffer(data) ? data : String(data), 'utf8');
  return file;
}`);
    },
  },
];

const results = [];

async function prepare() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'lezi-mut-'));
  const dst = path.join(dir, 'lezibench');
  await cp(SRC, dst, {
    recursive: true,
    filter: (p) => !p.includes(`${path.sep}node_modules`) && !p.includes(`${path.sep}.git`),
  });
  return { dir, dst };
}

function runTests(cwd) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['--test', 'tests/*.test.mjs'], {
    cwd,
    encoding: 'utf8',
    timeout: 10 * 60 * 1000,
    shell: false,
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const pass = Number((out.match(/^ℹ pass (\d+)$/m) || [])[1] || -1);
  const fail = Number((out.match(/^ℹ fail (\d+)$/m) || [])[1] || -1);
  return { code: r.status, out, pass, fail, ms: Date.now() - t0 };
}

console.log('真实源码变异注入测试');
console.log(`源仓库：${SRC}`);
console.log(`Node：${process.version}\n`);

// 0. 基线：未变异副本必须全绿（否则后面"变红"毫无意义）
const base = await prepare();
const baseRun = runTests(base.dst);
const baseGreen = baseRun.code === 0;
console.log(`[基线] 未变异副本 node --test → exit=${baseRun.code}, pass=${baseRun.pass}, fail=${baseRun.fail}, ${baseRun.ms}ms`);
results.push({
  id: 'BASE',
  名: '基线（未变异）',
  期望: '必须全绿',
  code: baseRun.code,
  pass: baseRun.pass,
  fail: baseRun.fail,
  detected: baseGreen,
  note: baseGreen ? `pass=${baseRun.pass}` : `基线就是红的，后续无意义：${baseRun.out.slice(-400)}`,
});
if (!baseGreen) {
  console.error('✘ 基线未通过，终止。');
  console.error(baseRun.out.slice(-3000));
  process.exit(1);
}

// 逐条变异
for (const m of MUTANTS) {
  const { dst } = await prepare();
  const file = path.join(dst, m.file);
  const orig = await readFile(file, 'utf8');
  let mutated;
  try {
    mutated = m.apply(orig);
  } catch (e) {
    results.push({ id: m.id, 名: m.名, 期望: m.期望, code: null, pass: -1, fail: -1, detected: false, note: `注入失败：${e.message}` });
    console.log(`✘ [${m.id}] ${m.名} —— 注入失败：${e.message}`);
    continue;
  }
  await writeFile(file, mutated, 'utf8');
  const run = runTests(dst);
  const detected = run.code !== 0;
  results.push({
    id: m.id, 名: m.名, 期望: m.期望,
    code: run.code, pass: run.pass, fail: run.fail, detected, note: '',
  });
  const firstFail = (run.out.match(/^✖ .*$/m) || [''])[0];
  console.log(`${detected ? '✔ 已检出' : '✘ 未检出'} [${m.id}] ${m.名}`);
  console.log(`         期望：${m.期望}`);
  console.log(`         实际：exit=${run.code}, pass=${run.pass}, fail=${run.fail}, ${run.ms}ms` +
    (firstFail ? `；首个失败：${firstFail.slice(0, 110)}` : ''));
  if (!KEEP) await rm(path.dirname(dst), { recursive: true, force: true }).catch(() => {});
}

const missed = results.filter((r) => r.id !== 'BASE' && !r.detected);
console.log(`\n${'='.repeat(70)}`);
console.log(`变异总数 ${results.length - 1}，被检出 ${results.length - 1 - missed.length}，漏检 ${missed.length}`);
if (missed.length) {
  console.log('漏检（测试是摆设）：');
  for (const m of missed) console.log(`  - [${m.id}] ${m.名}（${m.note}）`);
  process.exitCode = 1;
} else {
  console.log('✅ 全部变异都被官方测试检出：测试确实会失败。');
}

const { writeFile: wf } = await import('node:fs/promises');
await wf(path.join(AUDIT_DIR, 'mutation-inject.json'), JSON.stringify(results, null, 2), 'utf8');
console.log(`\n结果已写入 ${path.join(AUDIT_DIR, 'mutation-inject.json')}`);
if (!KEEP) await rm(base.dir, { recursive: true, force: true }).catch(() => {});
