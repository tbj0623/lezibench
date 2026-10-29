#!/usr/bin/env node
/**
 * 端到端自测驱动：真的走完 start → submit×4 → report 全流程，
 * 并做三组固定断言：满分卷=100、全错卷=0、部分卷=对应原子分。
 *
 * 用法： node tests/e2e-run.mjs [--keep]
 * 退出码 0 = 全部断言通过。
 */
import { rm, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startRun, submitBatch, buildReport, writeReport, regradeRun, statusRun, loadState } from '../src/runner.mjs';
import { perfectAnswers } from '../scripts/oracle-answers.mjs';
import { ITEMS, itemsForBatch, BATCHES, instantiateInternal } from '../src/exam/manifest.mjs';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const failures = [];
function check(name, cond, detail = '') {
  if (cond) console.log(`  ✔ ${name}`);
  else {
    console.log(`  ✘ ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

async function runFull(root, seed, answerMaker) {
  const { runId } = await startRun({ root, seed, runId: undefined });
  const answers = answerMaker(seed);
  const gaps = [];
  for (const b of BATCHES) {
    const items = itemsForBatch(b);
    const payload = {};
    for (const it of items) payload[it.id] = answers[it.id];
    const res = await submitBatch({ root, runId, batch: b, answers: payload, allowMissing: true });
    gaps.push(res);
  }
  const report = await buildReport({ root, runId });
  return { runId, report, gaps, answers };
}

const root = await mkdtemp(path.join(os.tmpdir(), 'lezi-e2e-'));
console.log(`临时数据目录：${root}`);

/* ---------- 1. 满分卷 ---------- */
console.log('\n[1] 满分卷：oracle 答案必须拿到 100 分');
{
  const seed = 'e2e-perfect-1';
  const { runId, report } = await runFull(root, seed, perfectAnswers);
  check('状态为 COMPLETED', report.summary.status === 'COMPLETED', report.summary.status);
  check('总分 = 100', report.summary.total === 100, `实际 ${report.summary.total}`);
  check('四维各 25', report.summary.dimensions.every((d) => d.awarded === 25), JSON.stringify(report.summary.dimensions.map((d) => [d.key, d.awarded])));
  const notFull = report.items.filter((i) => i.awarded !== i.maxPoints);
  check('16 题全部满分', notFull.length === 0, notFull.map((i) => `${i.id}:${i.awarded}/${i.maxPoints}`).join(','));
  check('段位 = 卓越', report.summary.level === '卓越', String(report.summary.level));
  const { path: htmlPath } = await writeReport({ root, runId, format: 'html' });
  check('HTML 报告已写出', existsSync(htmlPath));
  const html = await readFile(htmlPath, 'utf8');
  check('HTML 无外链资源', !/(src|href)\s*=\s*["']https?:/i.test(html), '检测到远程资源引用');
  check('HTML 含总分 100', html.includes('>100<'));
}

/* ---------- 2. 全错卷 ---------- */
console.log('\n[2] 全错卷：所有题都答错，必须得 0 分');
{
  const seed = 'e2e-zero-1';
  const wrong = (s) => {
    const good = perfectAnswers(s);
    const out = {};
    for (const it of ITEMS) {
      const a = good[it.id];
      // 逐题构造「结构合法但值错误」的答案。
      // 注意：部分题的答案会随 seed 变化（I01 的附件要求、C01 的原式对错、D02 的 A/B/C），
      // 所以这里必须**根据本题的实际 oracle 取反**，不能写死常量 —— 否则碰上对应 seed 就会误判为「答对」。
      const internal = instantiateInternal(it, s);
      const o = it.oracle(internal.facts);
      switch (it.id) {
        case 'I01': out[it.id] = { deadline: '周五下午5点', budgetAttached: !o.budgetAttached }; break;
        case 'I02': out[it.id] = { selected: ['S99'], rejected: ['S98'] }; break;
        case 'I03': out[it.id] = {
          // 必须三项都与 oracle 相反，否则「碰巧答对两项」会拿部分分，破坏「全错卷=0」的前提
          rule: o.rule === 'R1' ? 'R2' : 'R1',
          decision: o.decision === '批准' ? '转人工' : '批准',
          escalate: !o.escalate,
        }; break;
        case 'I04': out[it.id] = { status: o.status === '已通过' ? '已驳回' : '已通过', owner: '错误的人', deadline: '周日' }; break;
        case 'R01': out[it.id] = { subtotal: 1, total: 1 }; break;
        case 'R02': out[it.id] = { order: ['E', 'D', 'C', 'B', 'A'], first: 'E', last: 'A' }; break;
        case 'R03': out[it.id] = { veg: 0, chicken: 0, beef: 0 }; break;
        case 'R04': out[it.id] = Object.fromEntries(['甲', '乙', '丙', '丁'].map((n, i) => [n, { position: i + 1, color: '红' }])); break;
        case 'D01': out[it.id] = { list: ['错误城市'] }; break;
        case 'D02': out[it.id] = { answer: o.answer === 'A' ? 'B' : 'A', reason: '甲预算更少所以更省。' }; break;
        case 'D03': out[it.id] = { lossMaking: ['Z-999'], onlyInStore: ['Z-998'], commonCount: 99 }; break;
        case 'D04': out[it.id] = { levels: { 甲: '金牌' }, counts: { gold: 6, silver: 0, normal: 0 } }; break;
        case 'C01': out[it.id] = { isCorrect: !o.isCorrect, correctTotal: o.correctTotal + 7 }; break;
        case 'C02': out[it.id] = { beforeVoid: 1, finalStock: 2 }; break;
        case 'C03': out[it.id] = Object.fromEntries(['a1', 'a2', 'a3', 'a4'].map((k) => [k, { rule: '新', needManual: true }])); break;
        case 'C04': out[it.id] = { rootCause: '单价用错', fixedSubtotal: o.fixedSubtotal + 3, fixedTotal: o.fixedTotal + 3 }; break;
        default: out[it.id] = {};
      }
    }
    return out;
  };
  const { report } = await runFull(root, seed, wrong);
  check('总分 = 0', report.summary.total === 0, `实际 ${report.summary.total}`);
  check('状态仍为 COMPLETED（答案错误不等于系统故障）', report.summary.status === 'COMPLETED', report.summary.status);
  check('段位 = 需要提升', report.summary.level === '需要提升', String(report.summary.level));
}

/* ---------- 3. 部分正确 ---------- */
console.log('\n[3] 部分正确：只答对第一题，应精确得到该题原子分');
{
  const seed = 'e2e-partial-1';
  const mixed = (s) => {
    const good = perfectAnswers(s);
    const out = { I01: good.I01 };
    for (const it of ITEMS) if (it.id !== 'I01') out[it.id] = null;
    return out;
  };
  const { report } = await runFull(root, seed, mixed);
  check('总分 = I01 满分 4', report.summary.total === 4, `实际 ${report.summary.total}`);
  const i01 = report.items.find((i) => i.id === 'I01');
  check('I01 得 4 分', i01.awarded === 4, String(i01.awarded));
  check('其余 15 题为 MISSING_ANSWER', report.items.filter((i) => i.id !== 'I01').every((i) => i.gradingStatus === 'MISSING_ANSWER'));
}

/* ---------- 4. 缺答 → 不出最终完整成绩 ---------- */
console.log('\n[4] 未答完：不能给出「完整成绩」');
{
  const { runId } = await startRun({ root, seed: 'e2e-incomplete-1' });
  const good = perfectAnswers('e2e-incomplete-1');
  await submitBatch({ root, runId, batch: 1, answers: Object.fromEntries(itemsForBatch(1).map((i) => [i.id, good[i.id]])) });
  const report = await buildReport({ root, runId });
  check('未答完时状态不是 COMPLETED', report.summary.status !== 'COMPLETED', report.summary.status);
  check('未答完时不给出段位', !report.summary.level, String(report.summary.level));
}

/* ---------- 5. 幂等与冲突 ---------- */
console.log('\n[5] 幂等与冲突提交');
{
  const seed = 'e2e-idem-1';
  const { runId } = await startRun({ root, seed });
  const good = perfectAnswers(seed);
  const payload = Object.fromEntries(itemsForBatch(1).map((i) => [i.id, good[i.id]]));
  const r1 = await submitBatch({ root, runId, batch: 1, answers: payload });
  check('首次提交正常判分', r1.graded.length === 4);
  const r2 = await submitBatch({ root, runId, batch: 1, answers: payload });
  check('相同 payload 重复提交按幂等处理', r2.idempotent === true);
  let rejected = false;
  try {
    await submitBatch({ root, runId, batch: 1, answers: { ...payload, I01: { deadline: '乱填', budgetAttached: true } } });
  } catch { rejected = true; }
  check('不同 payload 覆盖被拒绝', rejected);
  // regrade 不得改变原答案
  const before = await loadState(root, runId);
  const reg = await regradeRun({ root, runId });
  const after = await loadState(root, runId);
  check('regrade 不改原始答案记录', before.state.gradedItems.length === after.state.gradedItems.length);
  check('regrade 有归档', existsSync(reg.archive));
}

/* ---------- 6. 不可解析 → NEEDS_REVIEW 而非 0 分 ---------- */
console.log('\n[6] 无法解析的答案必须进入待复核，而不是当知识错误扣 0');
{
  const { runId } = await startRun({ root, seed: 'e2e-unparse-1' });
  const res = await submitBatch({ root, runId, batch: 1, answers: { I01: '我觉得大概是周三吧反正不交预算表了', R01: '？？？？', D01: '', C01: '不知道' }, allowMissing: true });
  const statuses = Object.fromEntries(res.graded.map((g) => [g.id, g.gradingStatus]));
  console.log('    各题状态:', JSON.stringify(statuses));
  check('存在 UNPARSEABLE 状态', Object.values(statuses).includes('UNPARSEABLE'), JSON.stringify(statuses));
  const report = await buildReport({ root, runId });
  check('报告状态非 COMPLETED', report.summary.status !== 'COMPLETED', report.summary.status);
}

/* ---------- 7. 路径与参数安全 ---------- */
console.log('\n[7] 路径与参数安全');
{
  let bad = 0;
  for (const runId of ['../../etc/passwd', '..\\..\\windows', 'a/b', 'x'.repeat(200)]) {
    try { await statusRun({ root, runId }); } catch { bad++; }
  }
  check('非法 runId 一律被拒绝', bad === 4, `只拒绝 ${bad}/4`);

  let unknownRejected = false;
  const { runId } = await startRun({ root, seed: 'e2e-safety-1' });
  try { await submitBatch({ root, runId, batch: 1, answers: { ZZ99: 'x' } }); } catch { unknownRejected = true; }
  check('不在本批的题目 ID 被拒绝', unknownRejected);

  let badBatch = false;
  try { await submitBatch({ root, runId, batch: 9, answers: {} }); } catch { badBatch = true; }
  check('非法批次被拒绝', badBatch);
}

console.log(`\n${failures.length === 0 ? '✅ 全部端到端断言通过' : `❌ ${failures.length} 项失败`}`);
if (failures.length) {
  console.log(failures.map((f) => `  - ${f}`).join('\n'));
  process.exitCode = 1;
}
