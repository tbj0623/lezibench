/**
 * LeziBench 反作弊 / 反泄漏测试（node --test）
 * ------------------------------------------------------------------
 * 这类 bug 的共同点：不读题也能得分。
 *   1. 题面示例 JSON 恰好就是正确答案
 *   2. 某个字段在所有 seed 下取值恒定（背答案即可）
 *   3. 整道题的正确答案恒定
 *   4. 只答某个字段、其余乱填即可拿分
 *
 * 每个用例都写成「若被测代码有该缺陷则失败」，不做 assert(true)。
 * 运行：node --test qa/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, instantiateInternal } from '../src/exam/manifest.mjs';
import { gradeItem } from '../src/grading/grade.mjs';
import { perfectAnswers } from '../scripts/oracle-answers.mjs';

const N = 60; // 抽样 seed 数，兼顾速度与覆盖
const SEEDS = Array.from({ length: N }, (_, i) => String(i));
const byId = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

const grade = (id, answer, seed) =>
  gradeItem(instantiateInternal(byId[id], seed), typeof answer === 'string' ? answer : JSON.stringify(answer), { seed });

/** 抽出题面示例 JSON（占位符不是合法 JSON 时返回 null，属预期） */
function exampleOf(prompt) {
  for (const line of prompt.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try { return JSON.parse(t); } catch { /* 占位符 */ }
  }
  return null;
}

/** 把 oracle 输出拍平成 field → 序列化值，用于检测常量字段 */
function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, `${prefix}${k}.`));
    else out[`${prefix}${k}`] = JSON.stringify(v);
  }
  return out;
}

/* ==================================================================== */
test('反泄漏：任何题的题面示例都不得是可直接照抄的满分答案', () => {
  const offenders = [];
  for (const item of ITEMS) {
    let sampleable = 0;
    for (const seed of SEEDS) {
      const gen = item.generate(seed);
      const ex = exampleOf(gen.prompt);
      if (!ex) continue;
      sampleable++;
      const r = grade(item.id, JSON.stringify(ex), seed);
      if (r.awarded === item.points) {
        offenders.push(`${item.id}@${seed} 照抄示例得满分 ${r.awarded}/${item.points}`);
      }
    }
    // 附加信息：示例可解析但完全不得分也算合格
    assert.ok(sampleable >= 0, `${item.id}: 内部错误`);
  }
  assert.deepEqual(offenders, [], `题面示例泄漏答案：\n${offenders.slice(0, 20).join('\n')}`);
});

test('反泄漏：照抄示例的期望得分必须为 0（按题汇总，N=60）', () => {
  const report = [];
  for (const item of ITEMS) {
    let sum = 0, n = 0;
    for (const seed of SEEDS) {
      const ex = exampleOf(item.generate(seed).prompt);
      if (!ex) continue;
      sum += grade(item.id, JSON.stringify(ex), seed).awarded;
      n++;
    }
    if (n > 0) report.push({ id: item.id, avg: sum / n, max: item.points });
  }
  const bad = report.filter((r) => r.avg > 0);
  assert.deepEqual(
    bad.map((r) => `${r.id} 平均 ${r.avg.toFixed(2)}/${r.max}`),
    [],
    `照抄题面示例仍有得分（说明示例含有真实答案成分）`,
  );
});

test('反作弊：R04 示例给出的 position 不得等于真实名次', () => {
  const offenders = [];
  for (const seed of SEEDS) {
    const gen = byId.R04.generate(seed);
    const o = byId.R04.oracle(gen.facts);
    const names = gen.facts.names;
    const examplePositionsAllCorrect = names.every((n, i) => o.answer[n].position === i + 1);
    if (examplePositionsAllCorrect) offenders.push(seed);
  }
  assert.deepEqual(
    offenders.slice(0, 10),
    [],
    `R04 在 ${offenders.length}/${N} 个 seed 下「姓名顺序 = 位置顺序」，示例会泄漏全部 position`,
  );
});

test('反作弊：R04 只答对 position、颜色乱填不得拿到 C1 以外的分', () => {
  let sum = 0;
  for (const seed of SEEDS) {
    const gen = byId.R04.generate(seed);
    const names = gen.facts.names;
    // 完全按「示例顺序」填 position，颜色随便填一个固定值
    const cheat = Object.fromEntries(names.map((n, i) => [n, { position: i + 1, color: '红' }]));
    sum += grade('R04', cheat, seed).awarded;
  }
  const avg = sum / N;
  assert.ok(avg <= 1, `R04「示例位置 + 瞎填颜色」平均 ${avg.toFixed(2)}/9，过高（说明 position 可白拿）`);
});

test('反作弊：D02 不得存在「一个固定答案通杀所有 seed」', () => {
  const template = { answer: 'C', reason: '甲项目的最终实际支出没有给出，无法确定。' };
  let full = 0;
  for (const seed of SEEDS) {
    if (grade('D02', template, seed).awarded === 6) full++;
  }
  assert.equal(
    full,
    0,
    `D02 用同一个模板答案在 ${full}/${N} 个 seed 上拿到满分 —— 答案恒定，考生无需读题`,
  );
});

test('反作弊：D02 只写 answer=C + 占位理由不得通过 C3', () => {
  const r = grade('D02', { answer: 'C', reason: '随便写一句' }, '0');
  assert.ok(r.awarded < 6, 'D02 占位理由竟拿满分');
  const c3 = r.checks.find((c) => c.criterionId === 'D02.C3');
  assert.ok(c3, '缺少 D02.C3');
  // C3 的语义是「没有把预算当最终支出」，不是「答了 C 就给」
  assert.ok(
    r.awarded <= 4,
    `D02 仅凭 answer=C 就拿到 ${r.awarded}/6，C3 变成了「答 C 即送分」`,
  );
});

test('反作弊：D03 的 onlyInStore / commonCount 不得在所有 seed 下恒定', () => {
  const onlyStore = new Set();
  const common = new Set();
  for (const seed of SEEDS) {
    const o = byId.D03.oracle(byId.D03.generate(seed).facts);
    onlyStore.add(JSON.stringify(o.onlyInStore));
    common.add(o.commonCount);
  }
  assert.ok(
    onlyStore.size > 1 || common.size > 1,
    `D03 的 onlyInStore=${[...onlyStore][0]} 与 commonCount=${[...common][0]} 在所有 seed 下恒定，可直接背答案`,
  );
});

test('反作弊：D03 不写 lossMaking、只填两个常量字段不得拿到 2/3 的分', () => {
  let sum = 0;
  for (const seed of SEEDS) {
    sum += grade('D03', { onlyInStore: ['F-660'], commonCount: 5 }, seed).awarded;
  }
  const avg = sum / N;
  assert.ok(avg <= 2, `D03「只填常量、完全不做亏本分析」平均 ${avg.toFixed(2)}/6，过高`);
});

test('反作弊：任何题的正确答案都不得在所有 seed 下完全相同', () => {
  const offenders = [];
  for (const item of ITEMS) {
    const answers = new Set(SEEDS.map((s) => JSON.stringify(perfectAnswers(s)[item.id])));
    if (answers.size === 1) offenders.push(`${item.id} 恒为 ${[...answers][0]}`);
  }
  assert.deepEqual(offenders, [], `以下题目的正确答案在 ${N} 个 seed 下完全恒定：\n${offenders.join('\n')}`);
});

test('反作弊：至少 90% 的题目其题面必须随 seed 变化', () => {
  const staticItems = [];
  for (const item of ITEMS) {
    const prompts = new Set(SEEDS.map((s) => item.generate(s).prompt));
    if (prompts.size === 1) staticItems.push(item.id);
  }
  assert.ok(
    staticItems.length <= Math.floor(ITEMS.length * 0.1),
    `题面不随 seed 变化的题目过多：${staticItems.join(', ')}`,
  );
});

test('反作弊：单题「只填常量 + 其余瞎填」的平均得分不得超过满分的 40%', () => {
  const offenders = [];
  for (const item of ITEMS) {
    // 取 seed=0 的答案作为固定答案（最朴素的背答案策略）
    const fixed = JSON.stringify(item.oracle(instantiateInternal(item, '0').facts));
    let sum = 0;
    for (const seed of SEEDS) sum += grade(item.id, fixed, seed).awarded;
    const avg = sum / N;
    if (avg > item.points * 0.4) offenders.push(`${item.id}: ${avg.toFixed(2)}/${item.points}`);
  }
  assert.deepEqual(offenders, [], `以下题目用固定答案即可拿到 >40% 分数：\n${offenders.join('\n')}`);
});

test('反作弊：跨题合计「固定答案基线」不得超过总分的 25%', () => {
  let total = 0;
  for (const item of ITEMS) {
    const fixed = JSON.stringify(item.oracle(instantiateInternal(item, '0').facts));
    let sum = 0;
    for (const seed of SEEDS) sum += grade(item.id, fixed, seed).awarded;
    total += sum / N;
  }
  assert.ok(total <= 25, `固定答案基线总分 ${total.toFixed(1)}/100，超过 25 分上限（考生可背答案）`);
});

/* ==================================================================== */
test('反作弊：I01 答 budgetAttached=true 必须扣掉 C2（3 分不得白送）', () => {
  const r = grade('I01', { deadline: '周三上午10点', budgetAttached: true }, '0');
  const c2 = r.checks.find((c) => c.criterionId === 'I01.C2');
  assert.ok(c2, 'I01 缺少 C2');
  assert.equal(c2.passed, false, 'I01 答 budgetAttached=true 竟然通过 C2（3 分白送）');
  assert.ok(r.awarded <= 1, `I01 答 budgetAttached=true 仍得 ${r.awarded}/4，C2 未生效`);
});

test('反作弊：C02 两个数都错但差值正确时不得通过 C2', () => {
  const internal = instantiateInternal(byId.C02, '42');
  const f = internal.facts;
  const real = byId.C02.oracle(f);
  const s2 = f.steps[3].qty;
  // beforeVoid 与 finalStock 都错，但 finalStock - beforeVoid 恰好等于撤回量
  const r = grade('C02', { beforeVoid: 0, finalStock: s2 }, '42');
  const c2 = r.checks.find((c) => c.criterionId === 'C02.C2');
  assert.ok(
    !c2.passed,
    `C02.C2 被「两个错值但差值正确」骗过：beforeVoid=0/finalStock=${s2}（真实 ${real.beforeVoid}/${real.finalStock}）仍判撤回逻辑正确`,
  );
});

/* ==================================================================== */
test('别名：题面自身措辞必须被接受（R01「实际应付款」/ I03「需要转人工」）', () => {
  const o1 = byId.R01.oracle(instantiateInternal(byId.R01, '42').facts);
  const r01 = grade('R01', `原价合计: ${o1.subtotal}\n实际应付款: ${o1.total}`, '42');
  assert.equal(r01.awarded, 4, `R01 用题面原文「实际应付款」作答只得 ${r01.awarded}/4，alias 缺失`);

  const o3 = byId.I03.oracle(instantiateInternal(byId.I03, '42').facts);
  const r03 = grade(
    'I03',
    `rule: ${o3.rule}\ndecision: ${o3.decision}\n需要转人工: ${o3.escalate ? '是' : '否'}`,
    '42',
  );
  assert.equal(r03.awarded, 6, `I03 用题面原文「需要转人工」作答只得 ${r03.awarded}/6，alias 缺失`);
});

test('别名：常见同义字段名不得导致整项丢分', () => {
  const o1 = byId.R01.oracle(instantiateInternal(byId.R01, '42').facts);
  for (const key of ['应付款', '实付款', '应付金额', '实际应付款']) {
    const r = grade('R01', `subtotal: ${o1.subtotal}\n${key}: ${o1.total}`, '42');
    assert.equal(r.awarded, 4, `R01 用「${key}」作键只得 ${r.awarded}/4`);
  }
});
