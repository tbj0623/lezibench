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
  const parseable = [];
  for (const item of ITEMS) {
    let sampleable = 0;
    for (const seed of SEEDS) {
      const gen = item.generate(seed);
      assert.equal(typeof gen.prompt, 'string', `${item.id}@${seed}: prompt 不是字符串`);
      const ex = exampleOf(gen.prompt);
      if (!ex) continue; // 占位符（<...>）不是合法 JSON，照抄无从谈起
      sampleable++;
      const r = grade(item.id, JSON.stringify(ex), seed);
      if (r.awarded === item.points) {
        offenders.push(`${item.id}@${seed} 照抄示例得满分 ${r.awarded}/${item.points}`);
      }
    }
    if (sampleable > 0) parseable.push(`${item.id}(${sampleable}/${SEEDS.length})`);
  }
  // 说明：占位符题（示例不可解析）在结构上就不可能被照抄，因此不进入 parseable 列表；
  // 这里只把「示例可解析」的题打印出来，便于人工确认判据覆盖到了哪些题。
  assert.deepEqual(
    offenders,
    [],
    `题面示例泄漏答案：\n${offenders.slice(0, 20).join('\n')}\n（示例可解析的题：${parseable.join(', ')}）`,
  );
});

test('反泄漏：照抄示例的平均得分必须 ≤ 0.5 分（按题汇总，N=60）', () => {
  // 【判据为什么是「≤0.5 分」而不是「必须 0 分」】
  //   1) 大多数题（I01/I03/R01/R03/D03/D04/C01/C03/C04）的示例已改成 `<...>` 占位符，
  //      不是合法 JSON，解析必然失败 → 结构上就不可能靠照抄得分，天然为 0。
  //   2) 少数题（如 D01/C02）的示例仍是具体数字（"南京"、"100"/"108"），在个别 seed 下
  //      可能恰好与真实答案的某个 criterion 重合（例如 D01 的示例正好含 2 个真实城市）。
  //      要求「每个 seed 都 0 分」既做不到也不必要——真正要防的是「照抄即可捡到整题」。
  //   3) 因此判据取「按题平均 ≤ 0.5 分」：既容忍低概率巧合，又能抓住
  //      「示例含真实答案成分」的系统性泄漏（那种情况下平均会显著 >0.5）。
  const report = [];
  const skipped = [];
  for (const item of ITEMS) {
    let sum = 0, n = 0, max = 0;
    for (const seed of SEEDS) {
      const ex = exampleOf(item.generate(seed).prompt);
      if (!ex) continue;
      const a = grade(item.id, JSON.stringify(ex), seed).awarded;
      sum += a; n++; max = Math.max(max, a);
    }
    if (n === 0) { skipped.push(item.id); continue; } // 全占位符，天然不可照抄
    report.push({ id: item.id, avg: sum / n, max: item.points, worst: max, samples: n });
  }
  // 至少要有若干题是「真的被这条判据覆盖到」的，否则说明示例全成了占位符、
  // 本用例退化为空转——显式断言覆盖数，防止将来悄悄失效。
  assert.ok(
    report.length >= 3,
    `只有 ${report.length} 道题的示例可解析，本判据覆盖不足（占位符题：${skipped.join(', ')}）`,
  );
  const bad = report.filter((r) => r.avg > 0.5);
  assert.deepEqual(
    bad.map((r) => `${r.id} 平均 ${r.avg.toFixed(2)}/${r.max}（最高 ${r.worst}）`),
    [],
    `照抄题面示例的平均得分超过 0.5 分，说明示例含有真实答案成分`,
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
  // 4 个名字的排列共 4! = 24 种，「姓名顺序恰好等于位置顺序」的概率是 1/24 ≈ 4.2%。
  // 所以要求 0 次是不讲概率的；正确判据是「显著高于随机水平」才算结构性问题。
  const rate = offenders.length / N;
  assert.ok(
    rate <= 0.12,
    `R04 在 ${offenders.length}/${N} 个 seed (${(rate * 100).toFixed(1)}%) 下「姓名顺序 = 位置顺序」；` +
      `随机水平应为 1/24 ≈ 4.2%，超过 12% 说明是结构性泄漏`,
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
  // D02 是三选一（A/B/C），单靠「固定答 C + 通用理由」在 C 分支的 seed 上本来就应该满分
  // —— 那是因为那个 seed 的正确答案确实是 C，不是判分缺陷。
  // 真正要防的是「答案恒定」，所以判据是：命中率不得显著高于 1/3。
  const rate = full / N;
  assert.ok(
    rate <= 0.45,
    `D02 固定模板在 ${full}/${N} 个 seed (${(rate * 100).toFixed(1)}%) 上满分；` +
      `三选一结构下限约 33%，超过 45% 说明答案分布又偏了`,
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
