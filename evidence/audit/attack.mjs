#!/usr/bin/env node
/**
 * LeziBench 独立验收攻击脚本（第三方审计用，不属于被测项目）
 *
 * 设计原则：
 *  - 只调用**真实的 CLI 入口 / 真实的库 API**，不 mock、不改被测代码。
 *  - 每条攻击先写清「期望」，再判定 PASS / FAIL。
 *  - 全部数据落在临时目录（LEZIBENCH_HOME），不污染默认数据目录。
 *
 * 运行：node qa/audit/attack.mjs [--only A1,A2,...]
 * 退出码：有 FAIL → 1；全 PASS → 0
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AUDIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(AUDIT_DIR, '..', '..', 'lezibench');
const CLI = path.join(REPO, 'scripts', 'cli.mjs');

const results = [];
let currentGroup = null;

function group(id, title) {
  currentGroup = id;
  console.log(`\n${'='.repeat(78)}\n[${id}] ${title}\n${'='.repeat(78)}`);
}

/**
 * expect: 'reject' | 'accept'
 *  - reject 表示「必须被拦住」，拦住 = PASS
 *  - accept 表示「必须正常工作且满足 extra」，满足 = PASS
 */
function record(id, desc, expectation, verdict, detail) {
  const pass = verdict === 'PASS';
  results.push({ id, desc, expectation, verdict, detail, group: currentGroup });
  console.log(`  ${pass ? '✔ PASS' : '✘ FAIL'}  ${desc}`);
  console.log(`         期望：${expectation}`);
  console.log(`         实际：${detail}`);
}

function mkTmp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), `lezi-audit-${prefix}-`));
}

/** 跑 CLI，返回 {code, stdout, stderr, ms} */
function runCli(args, { home, cwd = REPO, env = {}, timeout = 60000 } = {}) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    timeout,
    encoding: 'utf8',
    env: { ...process.env, ...(home ? { LEZIBENCH_HOME: home } : {}), ...env },
  });
  return {
    code: r.status,
    signal: r.signal,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    ms: Date.now() - t0,
    combined: `${r.stdout || ''}${r.stderr || ''}`,
  };
}

/** 在指定 home 下开一局，返回 runId */
async function startRun(home, seed, extra = []) {
  const r = runCli(['start', '--mode', 'standard', '--seed', seed, '--json', ...extra], { home });
  if (r.code !== 0) throw new Error(`start 失败(code=${r.code})：${r.combined.slice(0, 400)}`);
  const j = JSON.parse(r.stdout);
  return { runId: j.runId, batch: j };
}

/** 取 oracle 满分答案（直接调用被测项目的公开 API） */
async function oracleAnswers(seed) {
  const mod = await import(pathToFileURL(path.join(REPO, 'scripts', 'oracle-answers.mjs')).href);
  return mod.perfectAnswers(seed);
}

/**
 * 生成报告并读出 summary。
 * 注意：CLI 的 `report --format json` 是把报告**写到文件**、只在 stdout 打印摘要，
 * 所以必须用 --out 指定文件，再从文件读完整报告（不要从 stdout 解析）。
 */
async function reportOf(home, runId, outName = 'audit-report.json') {
  const out = path.join(home, outName);
  const r = runCli(['report', '--run', runId, '--format', 'json', '--out', out], { home });
  let report = null;
  let readErr = '';
  try {
    report = JSON.parse(await readFile(out, 'utf8'));
  } catch (e) {
    readErr = e.message;
  }
  return { code: r.code, report, summary: report?.summary, stdout: r.stdout, stderr: r.stderr, out, readErr };
}

/** 把一个答案对象写成文件 */
async function writeAnswers(dir, name, obj) {
  const p = path.join(dir, name);
  await writeFile(p, typeof obj === 'string' ? obj : JSON.stringify(obj), 'utf8');
  return p;
}

/** 提交四批（或指定批次） */
function submit(home, runId, batch, file, extra = []) {
  return runCli(['submit', '--run', runId, '--batch', String(batch), '--answers-file', file, '--json', ...extra], { home });
}

/** 拆出本批 4 个题号 */
function batchIds(batchObj) {
  return batchObj.items.map((i) => i.id);
}

/** 从满分答案里挑出本批 */
function pickBatch(all, ids) {
  const out = {};
  for (const id of ids) out[id] = all[id];
  return out;
}

function readState(home, runId) {
  return readFile(path.join(home, 'runs', runId, 'state.json'), 'utf8').then(JSON.parse);
}

function parseJsonSafe(s) {
  try { return JSON.parse(s); } catch { return null; }
}

/**
 * 递归把对象/数组里的**数值型值**替换成 replacement，字符串里的数字也一并替换。
 * 只改值、不改键（否则题号 I01 会被改成 I99.9，触发「本批不包含该题目」而误判）。
 */
function numericize(value, replacement) {
  if (typeof value === 'number') return replacement;
  if (typeof value === 'string') return value.replace(/\d+(\.\d+)?/g, String(replacement));
  if (Array.isArray(value)) return value.map((v) => numericize(v, replacement));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = numericize(v, replacement);
    return out;
  }
  return value;
}

/* ========================================================================== */
/* A1 · 边界分数：全部答对但把答案改成 99.9，必须不得 100                      */
/* ========================================================================== */
async function attackA1() {
  group('A1', '边界分数：全对但答案改成 99.9，必须不得 100');
  const home = await mkTmp('a1');
  const seed = 'audit-a1';
  const all = await oracleAnswers(seed);
  const { runId, batch } = await startRun(home, seed);
  const b1 = batch.items.map((i) => i.id);

  // A1a: 第 1 批所有**数值型字段**改成 99.9（保留题号键，只改值）
  const mutated = pickBatch(all, b1);
  const file = await writeAnswers(home, 'a1-99.9.json', { answers: numericize(mutated, 99.9) });
  const r = submit(home, runId, 1, file);

  const st = await readState(home, runId);
  const awarded = st.batches[1]?.awarded ?? -1;
  const max = st.batches[1]?.max ?? -1;
  record('A1a', '第1批所有数值字段改为 99.9', '不得拿满分',
    awarded < max ? 'PASS' : 'FAIL',
    `code=${r.code}, 本批得分 ${awarded}/${max}`);

  // A1b: 只把 R01（纯数值题）写成 99.9，其余保持 oracle 满分
  const home2 = await mkTmp('a1b');
  const { runId: r2 } = await startRun(home2, 'audit-a1b');
  const per = Object.fromEntries(b1.map((id) => [id, id === 'R01' ? { subtotal: 99.9, total: 99.9 } : all[id]]));
  const rB = submit(home2, r2, 1, await writeAnswers(home2, 'a1b.json', { answers: per }));
  const st2 = await readState(home2, r2);
  const r01res = (st2.gradedItems || []).find((g) => g.id === 'R01');
  record('A1b', 'R01 数值写 99.9（其余题满分）', 'R01 必须 0 分',
    r01res && r01res.awarded === 0 ? 'PASS' : 'FAIL',
    `R01 awarded=${r01res?.awarded}（满分 4）, status=${r01res?.gradingStatus}, code=${rB.code}`);

  // A1c: 99.9 冒充「四舍五入后的 100 分」——整卷所有数值字段 99.9
  const home3 = await mkTmp('a1c');
  const { runId: r3 } = await startRun(home3, 'audit-a1c');
  const { itemsForBatch } = await import(pathToFileURL(path.join(REPO, 'src/exam/manifest.mjs')).href);
  const groups = {};
  for (let b = 1; b <= 4; b++) groups[b] = itemsForBatch(b).map((i) => i.id);
  let allOk = true;
  for (let b = 1; b <= 4; b++) {
    const ans = numericize(pickBatch(all, groups[b]), 99.9);
    const rr = submit(home3, r3, b, await writeAnswers(home3, `a1c-${b}.json`, { answers: ans }));
    if (rr.code !== 0) allOk = false;
  }
  const rp = await reportOf(home3, r3, 'a1c-report.json');
  const rep = rp.summary;
  record('A1c', '整卷所有数字改为 99.9 并跑完 4 批', '总分必须 < 100（不得四舍五入成 100）',
    allOk && rep && rep.total < 100 ? 'PASS' : 'FAIL',
    `总分=${rep?.total}, 段位=${rep?.level}, status=${rep?.status}`);
}

/* ========================================================================== */
/* A2 · 越权：路径穿越 runId、超长 runId                                       */
/* ========================================================================== */
async function attackA2() {
  group('A2', '越权：路径穿越 runId、超长 runId');
  const home = await mkTmp('a2');
  const { runId } = await startRun(home, 'audit-a2');
  const file = await writeAnswers(home, 'a2.json', { answers: {} });

  const probes = [
    { id: 'A2a', arg: '../../etc/passwd', why: 'Unix 相对穿越' },
    { id: 'A2b', arg: '..\\..\\windows', why: 'Windows 相对穿越' },
    { id: 'A2c', arg: '..%2f..%2fetc%2fpasswd', why: 'URL 编码穿越' },
    { id: 'A2d', arg: '/etc/passwd', why: '绝对路径' },
    { id: 'A2e', arg: 'C:\\Windows\\System32\\drivers\\etc\\hosts', why: 'Windows 绝对路径' },
    { id: 'A2f', arg: 'x'.repeat(5000), why: '超长 runId（5000 字符）' },
    { id: 'A2g', arg: '.../.../...', why: '变体点斜杠' },
  ];
  for (const p of probes) {
    // status 与 report 两条入口都试
    const s = runCli(['status', '--run', p.arg, '--json'], { home });
    const rp = runCli(['report', '--run', p.arg, '--format', 'json'], { home });
    const rejected = s.code !== 0 && rp.code !== 0;
    const detail = `status code=${s.code}, report code=${rp.code}；` +
      `status 输出=${(s.combined || '').trim().slice(0, 90).replace(/\n/g, ' ')}`;
    record(p.id, `runId = ${JSON.stringify(p.arg.length > 40 ? p.arg.slice(0, 20) + `…(${p.arg.length}字符)` : p.arg)}（${p.why}）`,
      '必须拒绝，且不得越出数据根', rejected ? 'PASS' : 'FAIL', detail);
  }

  // 校验数据根外没被创建任何东西
  const escaped = existsSync(path.join(home, '..', 'etc')) || existsSync('/etc/passwd.audit');
  record('A2h', '越权尝试后检查是否在数据根外落盘', '不得在数据根外创建文件',
    escaped ? 'FAIL' : 'PASS', `数据根=${home}，根外可疑产物=${escaped}`);
  void file; void runId;
}

/* ========================================================================== */
/* A3 · 注入：原型污染 / 巨型字符串 / 字符串型 total                          */
/* ========================================================================== */
async function attackA3() {
  group('A3', '注入：__proto__ / 10MB 字符串 / 字符串型数值');
  const home = await mkTmp('a3');
  const seed = 'audit-a3';
  const all = await oracleAnswers(seed);
  const { runId, batch } = await startRun(home, seed);
  const b1 = batch.items.map((i) => i.id);

  // A3a: __proto__ 键注入（其余 4 题用 oracle 满分，确保"正常判分"可判定）
  const protoAnswers = { ...pickBatch(all, b1) };
  const protoObj = JSON.parse('{"__proto__":{"polluted":true}}');
  protoAnswers.__proto__ = protoObj.__proto__;
  // 用 JSON 文本手工拼，确保 "__proto__" 作为真实自有键落进文件
  const protoText = `{"answers":{"__proto__":{"polluted":true},${b1
    .map((id) => `${JSON.stringify(id)}:${JSON.stringify(all[id])}`)
    .join(',')}}}`;
  const fProto = await writeAnswers(home, 'a3-proto.json', protoText);
  const rProto = submit(home, runId, 1, fProto);
  const st = await readState(home, runId);
  const polluted = ({}).polluted === true || Object.prototype.polluted === true;
  // 可接受的行为：要么把 __proto__ 当作未知题号拒绝，要么忽略它继续判分；两者都不得污染原型
  const rejectedAsUnknown = rProto.code !== 0 && /不包含这些题目|__proto__/.test(rProto.combined);
  const acceptedAndGraded = rProto.code === 0;
  record('A3a', '__proto__ 键注入', '不得污染 Object.prototype；可拒绝或忽略，但不得崩溃/污染',
    !polluted && (rejectedAsUnknown || acceptedAndGraded) ? 'PASS' : 'FAIL',
    `code=${rProto.code}, Object.prototype.polluted=${({}).polluted}, ` +
    `处理方式=${rejectedAsUnknown ? '按未知题号拒绝' : acceptedAndGraded ? '忽略并正常判分' : '其他'}, ` +
    `提示=${(rProto.combined || '').trim().split('\n')[0].slice(0, 90)}`);

  // A3b: 10MB 字符串（单题答案）
  const home2 = await mkTmp('a3b');
  const { runId: r2, batch: b2 } = await startRun(home2, 'audit-a3b');
  const ids2 = b2.items.map((i) => i.id);
  const huge = 'A'.repeat(10 * 1024 * 1024);
  const hugeAnswers = { answers: Object.fromEntries(ids2.map((id) => [id, huge])) };
  const fHuge = path.join(home2, 'a3-huge.json');
  await writeFile(fHuge, JSON.stringify(hugeAnswers), 'utf8');
  const size = (await stat(fHuge)).size;
  const rHuge = submit(home2, r2, 1, fHuge);
  record('A3b', `10MB 字符串答案（文件 ${(size / 1024 / 1024).toFixed(1)}MB）`,
    '必须被文件大小上限拦住（不得 OOM / 不得静默截断判分）',
    rHuge.code !== 0 ? 'PASS' : 'FAIL',
    `code=${rHuge.code}, 输出=${(rHuge.combined || '').trim().slice(0, 120).replace(/\n/g, ' ')}`);

  // A3c: {"total": "1); process.exit(1);//"} 形态
  const home3 = await mkTmp('a3c');
  const { runId: r3, batch: b3 } = await startRun(home3, 'audit-a3c');
  const ids3 = b3.items.map((i) => i.id);
  const inj = Object.fromEntries(ids3.map((id) => [id, id === 'R01'
    ? { subtotal: '1); process.exit(1);//', total: '1); process.exit(1);//' }
    : all[id]]));
  const rInj = submit(home3, r3, 1, await writeAnswers(home3, 'a3c.json', { answers: inj }));
  const st3 = await readState(home3, r3);
  const r01 = (st3.gradedItems || []).find((g) => g.id === 'R01');
  record('A3c', `故意注入 {"total":"1); process.exit(1);//"}`,
    '进程不得退出，必须判 0 分或按不可解析处理',
    rInj.code === 0 && r01 && r01.awarded === 0 ? 'PASS' : 'FAIL',
    `code=${rInj.code}, R01 awarded=${r01?.awarded}, status=${r01?.gradingStatus}`);

  // A3d: 原型链污染扩散检查（跑完一轮后全局）
  record('A3d', '多组注入后 Object.prototype 是否被污染', '不得污染',
    ({}).polluted === undefined ? 'PASS' : 'FAIL', `({}).polluted=${String(({}).polluted)}`);
}

/* ========================================================================== */
/* A4 · 覆盖：同批次提交两次不同答案，第二次必须被拒                          */
/* ========================================================================== */
async function attackA4() {
  group('A4', '覆盖：同一批次提交两次不同答案');
  const home = await mkTmp('a4');
  const seed = 'audit-a4';
  const all = await oracleAnswers(seed);
  const { runId, batch } = await startRun(home, seed);
  const b1 = batch.items.map((i) => i.id);

  const good = pickBatch(all, b1);
  const f1 = await writeAnswers(home, 'a4-1.json', { answers: good });
  const r1 = submit(home, runId, 1, f1);

  const wrong = {};
  for (const id of b1) wrong[id] = id === 'R01' ? { subtotal: 1, total: 1 } : all[id];
  const f2 = await writeAnswers(home, 'a4-2.json', { answers: wrong });
  const r2 = submit(home, runId, 1, f2);
  const st = await readState(home, runId);
  const firstAwarded = st.batches[1]?.awarded;

  // 原分必须没被覆盖
  const unchanged = firstAwarded === st.batches[1]?.awarded && st.batches[1]?.status === 'graded';
  record('A4', '第1批先提交满分，再提交不同答案',
    '第二次必须被拒绝，且第一次分数不被覆盖',
    r2.code !== 0 && unchanged ? 'PASS' : 'FAIL',
    `第1次 code=${r1.code}；第2次 code=${r2.code}；拒绝信息=「${(r2.combined || '').trim().split('\n')[0].slice(0, 100)}」；本批分仍=${firstAwarded}/${st.batches[1]?.max}`);

  // A4b: 相同 payload 重复提交必须幂等
  const r3 = submit(home, runId, 1, f1);
  record('A4b', '相同 payload 重复提交', '必须幂等（code=0 且不重复计分）',
    r3.code === 0 ? 'PASS' : 'FAIL',
    `code=${r3.code}, idempotent=${parseJsonSafe(r3.stdout)?.idempotent}`);
}

/* ========================================================================== */
/* A5 · 篡改：手改 state.json 分数后出报告                                    */
/* ========================================================================== */
async function attackA5() {
  group('A5', '篡改：手改 state.json 里的分数后出报告');
  const home = await mkTmp('a5');
  const seed = 'audit-a5';
  const all = await oracleAnswers(seed);
  const { runId, batch } = await startRun(home, seed);
  const b1 = batch.items.map((i) => i.id);

  // 先提交 1 批「错误答案」
  const wrong = {};
  for (const id of b1) wrong[id] = { garbage: 1 };
  const f = await writeAnswers(home, 'a5.json', { answers: wrong });
  const r = submit(home, runId, 1, f);

  const stPath = path.join(home, 'runs', runId, 'state.json');
  const before = JSON.parse(await readFile(stPath, 'utf8'));
  const awardedBefore = before.batches[1]?.awarded ?? 0;

  // 直接把每题 awarded 与批次 awarded 改成满分
  const perItemMax = { I01: 4, R01: 4, D01: 4, C01: 4 };
  for (const g of before.gradedItems) { g.awarded = perItemMax[g.id] ?? 4; g.gradingStatus = 'GRADED'; }
  before.batches[1].awarded = 16;
  await writeFile(stPath, JSON.stringify(before, null, 2), 'utf8');

  const rp = await reportOf(home, runId, 'a5-report.json');
  const rep = rp.summary;
  const html = runCli(['report', '--run', runId, '--format', 'html', '--out', path.join(home, 'tampered.html')], { home });

  // 判据：要么报告自己看得出不一致，要么文档明确承认「防不住」
  const docAdmits = existsSync(path.join(REPO, 'docs', 'LIMITATIONS.md'));
  const lim = docAdmits ? await readFile(path.join(REPO, 'docs', 'LIMITATIONS.md'), 'utf8') : '';
  const admitsTamper = /state\.json、答案文件、判分器都在本地，没有签名校验|题库指纹不防篡改/.test(lim);
  const reportWarns = /签|tamper|不一致|校验失败/.test(`${rp.stdout || ''}`);

  record('A5', `把第1批 4 题 awarded 全改成满分（原 ${awardedBefore}/16）后 report`,
    '必须能看出不一致，或文档明确承认防不住',
    admitsTamper || reportWarns ? 'PASS' : 'FAIL',
    `report code=${rp.code}；报告总分=${rep?.total}（说明 state 被直接采信，篡改生效）；` +
    `报告自警告=${reportWarns}；docs/LIMITATIONS.md §7 明示「${admitsTamper ? 'state.json、答案文件、判分器都在本地，没有签名校验 / 题库指纹不防篡改' : '未找到免责说明'}」`);

  // A5b: regrade 是否能把篡改拉回真实分
  const rg = runCli(['regrade', '--run', runId, '--json'], { home });
  const after = parseJsonSafe(rg.stdout);
  record('A5b', '篡改后执行 regrade', '应从原始答案重算并还原真实分（篡改不生效）',
    rg.code === 0 && after && after.afterTotal === awardedBefore ? 'PASS' : 'FAIL',
    `code=${rg.code}, beforeTotal=${after?.beforeTotal}, afterTotal=${after?.afterTotal}（真实分=${awardedBefore}）`);
  void html;
}

/* ========================================================================== */
/* A6 · 缺答：只答 3 题提交，必须被阻断（除非 --allow-missing）               */
/* ========================================================================== */
async function attackA6() {
  group('A6', '缺答：只答 3 题提交');
  const home = await mkTmp('a6');
  const seed = 'audit-a6';
  const all = await oracleAnswers(seed);
  const { runId, batch } = await startRun(home, seed);
  const b1 = batch.items.map((i) => i.id);
  const three = pickBatch(all, b1.slice(0, 3)); // 故意少一题

  const f = await writeAnswers(home, 'a6.json', { answers: three });
  const r = submit(home, runId, 1, f);
  const st = await readState(home, runId);
  const blocked = r.code !== 0 && !st.batches[1];
  record('A6', `只答 ${Object.keys(three).length}/4 题（缺 ${b1[3]}）`,
    '必须阻断，且不得写入批次结果',
    blocked ? 'PASS' : 'FAIL',
    `code=${r.code}, batches[1]=${JSON.stringify(st.batches[1] || null)}, 提示=${(r.combined || '').trim().split('\n')[0].slice(0, 90)}`);

  // A6b: 显式 --allow-missing 必须放行，并按缺答 0 分记录
  const r2 = submit(home, runId, 1, f, ['--allow-missing']);
  const st2 = await readState(home, runId);
  const miss = (st2.gradedItems || []).find((g) => g.id === b1[3]);
  record('A6b', '同上但加 --allow-missing', '必须放行，缺的那题记为 MISSING_ANSWER 且 0 分',
    r2.code === 0 && st2.batches[1]?.status === 'graded' && miss?.gradingStatus === 'MISSING_ANSWER' && miss?.awarded === 0 ? 'PASS' : 'FAIL',
    `code=${r2.code}, missingIds=${JSON.stringify(st2.batches[1]?.missingIds)}, 缺答题状态=${miss?.gradingStatus}, 得分=${miss?.awarded}`);
}

/* ========================================================================== */
/* A7 · 未答完出报告：只提交 1 批就 report，必须 PARTIAL 且无段位            */
/* ========================================================================== */
async function attackA7() {
  group('A7', '未答完出报告：只提交 1 批就 report');
  const home = await mkTmp('a7');
  const seed = 'audit-a7';
  const all = await oracleAnswers(seed);
  const { runId, batch } = await startRun(home, seed);
  const b1 = batch.items.map((i) => i.id);
  const f = await writeAnswers(home, 'a7.json', { answers: pickBatch(all, b1) });
  submit(home, runId, 1, f);

  const rp = await reportOf(home, runId, 'a7-report.json');
  const rep = rp.summary;
  const ok = rep && rep.status === 'PARTIAL' && rep.level === null && rep.completed === false;
  record('A7', '仅 1/4 批后生成报告', 'status=PARTIAL 且 level=null',
    ok ? 'PASS' : 'FAIL',
    `code=${rp.code}, status=${rep?.status}, level=${JSON.stringify(rep?.level)}, completed=${rep?.completed}, total=${rep?.total}/${rep?.maxTotal}`);

  // A7b: 同一局 HTML 报告里不得出现段位徽章高亮 / 不得写「总分：xx/100　段位：」
  const out = path.join(home, 'a7.html');
  const rh = runCli(['report', '--run', runId, '--format', 'html', '--out', out], { home });
  const html = existsSync(out) ? await readFile(out, 'utf8') : '';
  const hasLevelClaim = /段位：\S/.test(html) || /标准局成绩/.test(html);
  record('A7b', '未答完的 HTML 报告', '不得宣称「标准局成绩」或给出段位',
    rh.code === 0 && !hasLevelClaim ? 'PASS' : 'FAIL',
    `code=${rh.code}, 含「段位：」=${/段位：\S/.test(html)}, 含「标准局成绩」=${/标准局成绩/.test(html)}, 含「待复核/部分完成」=${/部分完成|待复核/.test(html)}`);
}

/* ========================================================================== */
/* A8 · 答案文件攻击：非 JSON / 数组 / 超大 / 空 / null                       */
/* ========================================================================== */
async function attackA8() {
  group('A8', '答案文件攻击');
  const home = await mkTmp('a8');
  const seed = 'audit-a8';
  const all = await oracleAnswers(seed);
  const { runId, batch } = await startRun(home, seed);
  const b1 = batch.items.map((i) => i.id);
  const good = pickBatch(all, b1);

  const cases = [
    { id: 'A8a', name: '非 JSON（纯文本）', content: 'not json at all {{{', expect: 'reject' },
    { id: 'A8b', name: 'JSON 数组', content: JSON.stringify([good]), expect: 'reject' },
    { id: 'A8c', name: '空文件', content: '', expect: 'reject' },
    { id: 'A8d', name: 'null', content: 'null', expect: 'reject' },
    { id: 'A8e', name: 'JSON 字符串 "abc"', content: '"abc"', expect: 'reject' },
    { id: 'A8f', name: '数字 42', content: '42', expect: 'reject' },
    { id: 'A8g', name: '合法但缺 answers 的对象', content: JSON.stringify(good), expect: 'parse-or-reject' },
  ];
  for (const c of cases) {
    // 每个 case 用全新 home，避免前面污染批次状态
    const h = await mkTmp(`a8-${c.id}`);
    const { runId: rid } = await startRun(h, `audit-${c.id}`);
    const f = await writeAnswers(h, 'ans.json', c.content);
    const r = submit(h, rid, 1, f);
    let verdict, detail;
    if (c.expect === 'reject') {
      verdict = r.code !== 0 ? 'PASS' : 'FAIL';
      detail = `code=${r.code}, 输出=${(r.combined || '').trim().split('\n')[0].slice(0, 100)}`;
    } else {
      // 直接 {...} 形态是官方支持的（readAnswersFile 支持两种）
      verdict = r.code === 0 ? 'PASS' : 'FAIL';
      detail = `code=${r.code}（直接对象形态官方支持，应放行）, 输出=${(r.combined || '').trim().split('\n')[0].slice(0, 100)}`;
    }
    record(c.id, c.name, c.expect === 'reject' ? '必须明确报错（非崩溃/非静默）' : '应被接受为合法输入',
      verdict, detail);
  }

  // A8h: 超大文件（1MB，超过 256KB 上限）
  const h = await mkTmp('a8h');
  const { runId: rid } = await startRun(h, 'audit-a8h');
  const big = { answers: Object.fromEntries(b1.map((id) => [id, 'x'.repeat(300 * 1024)])) };
  const fBig = path.join(h, 'big.json');
  await writeFile(fBig, JSON.stringify(big), 'utf8');
  const rBig = submit(h, rid, 1, fBig);
  record('A8h', '超过 256KB 的答案文件', '必须报「文件过大」而不是 OOM',
    rBig.code !== 0 && /过大|256/.test(rBig.combined) ? 'PASS' : 'FAIL',
    `code=${rBig.code}, 输出=${(rBig.combined || '').trim().split('\n')[0].slice(0, 100)}`);
}

/* ========================================================================== */
/* A9 · 并发：两个 submit 同时打同一批                                         */
/* ========================================================================== */
async function attackA9() {
  group('A9', '并发：两个 submit 同时提交同一批次');
  const home = await mkTmp('a9');
  const seed = 'audit-a9';
  const all = await oracleAnswers(seed);
  const { runId, batch } = await startRun(home, seed);
  const b1 = batch.items.map((i) => i.id);

  const setA = pickBatch(all, b1);
  const setB = {};
  for (const id of b1) setB[id] = id === 'R01' ? { subtotal: 1, total: 1 } : all[id];

  const fA = await writeAnswers(home, 'a.json', { answers: setA });
  const fB = await writeAnswers(home, 'b.json', { answers: setB });

  const runAsync = (file) => new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, 'submit', '--run', runId, '--batch', '1', '--answers-file', file, '--json'], {
      cwd: REPO,
      env: { ...process.env, LEZIBENCH_HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => resolve({ code, out, err }));
  });

  const [ra, rb] = await Promise.all([runAsync(fA), runAsync(fB)]);

  // state.json 必须仍是合法 JSON，且只保留一个批次结果
  let st = null, parseOk = true, errMsg = '';
  try { st = JSON.parse(await readFile(path.join(home, 'runs', runId, 'state.json'), 'utf8')); }
  catch (e) { parseOk = false; errMsg = e.message; }

  const codes = [ra.code, rb.code].sort();
  const oneWon = codes.filter((c) => c === 0).length === 1 && codes.filter((c) => c !== 0).length === 1;
  const sane = parseOk && st && st.batches?.[1]?.status === 'graded' &&
    Array.isArray(st.gradedItems) && st.gradedItems.length === 4;

  record('A9', '两个进程同时 submit 同一批（不同答案）',
    'state.json 必须仍可解析、不出现重复题目；理想情况只一方成功',
    sane ? 'PASS' : 'FAIL',
    `退出码=${JSON.stringify(codes)}；state 可解析=${parseOk}${parseOk ? '' : '(' + errMsg + ')'}；` +
    `gradedItems=${st?.gradedItems?.length}；batches[1].awarded=${st?.batches?.[1]?.awarded}/${st?.batches?.[1]?.max}；` +
    `「恰好一方成功」=${oneWon}`);

  // A9b: 检查是否存在重复题目（同一 id 出现两次）
  const ids = (st?.gradedItems || []).map((g) => g.id);
  const dup = ids.length !== new Set(ids).size;
  record('A9b', '并发后 gradedItems 是否有重复题号', '不得重复（重复会导致总分虚高）',
    !dup ? 'PASS' : 'FAIL', `题号=${ids.join(',')}，重复=${dup}`);
}

/* ========================================================================== */
/* A10 · 中文/空格路径全流程                                                   */
/* ========================================================================== */
async function attackA10() {
  group('A10', '中文 + 空格路径：LEZIBENCH_HOME 含中文与空格，全流程');
  const base = await mkTmp('a10');
  const home = path.join(base, '乐子 跑分 数据 目录', 'with space');
  await mkdir(home, { recursive: true });

  const seed = 'audit-a10';
  const all = await oracleAnswers(seed);
  const steps = [];
  try {
    const dr = runCli(['doctor', '--json'], { home });
    steps.push({ n: 'doctor', code: dr.code });

    const s = await startRun(home, seed);
    steps.push({ n: 'start', code: 0 });

    // 题号从 manifest 取（不依赖 CLI 输出格式）
    const { itemsForBatch } = await import(pathToFileURL(path.join(REPO, 'src/exam/manifest.mjs')).href);
    const groups = {};
    for (let b = 1; b <= 4; b++) groups[b] = itemsForBatch(b).map((i) => i.id);

    for (let b = 1; b <= 4; b++) {
      const f = await writeAnswers(home, `ans-${b}.json`, { answers: pickBatch(all, groups[b]) });
      const r = submit(home, s.runId, b, f);
      steps.push({ n: `submit b${b}`, code: r.code });
      if (r.code !== 0) throw new Error(`submit b${b} 失败：${(r.combined || '').slice(0, 200)}`);
    }
    const rp = runCli(['report', '--run', s.runId, '--format', 'html', '--out', path.join(home, '报告 输出.html')], { home });
    steps.push({ n: 'report html', code: rp.code });
    const rj = await reportOf(home, s.runId, 'a10-report.json');
    const rep = rj.summary;
    steps.push({ n: 'report json', code: rj.code });

    const allZero = steps.every((x) => x.code === 0);
    record('A10', `数据目录 = ${home}`,
      'doctor/start/submit×4/report 全流程必须成功，且满分卷得 100',
      allZero && rep?.total === 100 ? 'PASS' : 'FAIL',
      `步骤=${steps.map((x) => `${x.n}:${x.code}`).join(', ')}；总分=${rep?.total}, 段位=${rep?.level}`);
  } catch (e) {
    record('A10', `数据目录 = ${home}`, '全流程必须成功', 'FAIL', `异常：${e.message}`);
  }
}

/* ========================================================================== */
/* 主流程                                                                      */
/* ========================================================================== */
const ALL = [
  ['A1', attackA1], ['A2', attackA2], ['A3', attackA3], ['A4', attackA4], ['A5', attackA5],
  ['A6', attackA6], ['A7', attackA7], ['A8', attackA8], ['A9', attackA9], ['A10', attackA10],
];

const onlyArg = process.argv.find((a) => a.startsWith('--only'));
const only = onlyArg ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : process.argv[process.argv.indexOf(onlyArg) + 1])?.split(',').map((s) => s.trim()) : null;

console.log(`LeziBench 独立攻击测试`);
console.log(`仓库：${REPO}`);
console.log(`Node：${process.version}  平台：${process.platform}/${process.arch}`);
console.log(`时间：${new Date().toISOString()}`);

for (const [id, fn] of ALL) {
  if (only && !only.includes(id)) continue;
  try {
    await fn();
  } catch (e) {
    record(id, `攻击组 ${id} 执行异常`, '不得抛出未捕获异常', 'FAIL', e.stack?.split('\n').slice(0, 3).join(' | ') || String(e));
  }
}

const failed = results.filter((r) => r.verdict !== 'PASS');
console.log(`\n${'='.repeat(78)}`);
console.log(`攻击测试汇总：${results.length} 条断言，PASS ${results.length - failed.length}，FAIL ${failed.length}`);
if (failed.length) {
  console.log('未通过：');
  for (const f of failed) console.log(`  ✘ [${f.group}] ${f.id} ${f.desc} — ${f.detail}`);
  process.exitCode = 1;
}
console.log(`\nJSON 结果：`);
console.log(JSON.stringify(results, null, 2));
