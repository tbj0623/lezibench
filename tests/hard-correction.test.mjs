/**
 * 状态追踪与纠错维度（C01–C04）的专项测试。
 *
 * 这份文件只测 correction.mjs 的四道题，与 tests/golden-fixtures.test.mjs 分工不同：
 *   - golden-fixtures 里是「跨全部 16 题」的骨架夹具；
 *   - 这里针对 C01–C04 改版后**新增的干扰机制**做定点验证：
 *       C01 错误类别必须能区分（优先级 / 符号 / 进位）
 *       C02 十步台账的「撤回的撤回」与调拨不改变合计
 *       C03 追溯条款与过渡期例外必须能被区分
 *       C04 两个 bug 互相掩盖 —— 只修一个拿不到满分
 *
 * ⚠️ 手算夹具的纪律（与 golden-fixtures 一致，且是硬性规定）：
 *   期望值一律由人手工推导后写成**字面常量**，不得调用 oracle() / perfectAnswers() 生成。
 *   起因是一次真实事故：期望值全由被测 oracle 生成时，把 I01 的 oracle 取反后
 *   按题面诚实作答只得 1/4，而 node --test 仍然全绿 —— 那是「自洽即通过」，等于没测。
 *   所以下面每个常量旁边都写了「怎么算的」。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_BY_ID, instantiateInternal } from '../src/exam/manifest.mjs';
import { gradeItem } from '../src/grading/grade.mjs';

const IDS = ['C01', 'C02', 'C03', 'C04'];
const item = (id) => ITEM_BY_ID.get(id);

/* ==================================================================== *
 * ★ FIXTURES —— 给 tests/golden-fixtures.test.mjs 重建用的可复制常量
 * ==================================================================== *
 *
 * 用法（在 golden-fixtures.test.mjs 里）：
 *     import { FIXTURES } from './hard-correction.test.mjs';
 *     for (const fx of FIXTURES) {
 *       const r = gradeItem(instantiateInternal(ITEM_BY_ID.get(fx.id), fx.seed), fx.answer, { seed: fx.seed });
 *       assert.equal(r.awarded, POINTS[fx.id]);
 *     }
 *
 * 纪律（硬性，不可放宽）：
 *   - 下面每一个 answer 都是**人工按 factsDigest 里的原始参数算出来的**，
 *     不是 oracle() / perfectAnswers() 的输出。
 *   - how 字段写的就是「怎么算的」，任何人可以拿计算器复算。
 *   - factsDigest 只放**复算必需的输入**（价格、数量、步数参数、门槛等），
 *     不放答案，避免「把期望值混在输入里」。
 *   - 如果题目有意改版，必须**手工重算**这些常量并更新 how —— 这个摩擦是故意的。
 */
export const FIXTURES = [
  /* ------------------------------ C01 ------------------------------ */
  {
    id: 'C01',
    seed: 'hand-c01-1',
    points: 4,
    factsDigest: {
      expr: '9 × 7 - 12 + 16 × 7 + 30 - 26 + 41',
      terms: 8,
      written: 198,
    },
    answer: { isCorrect: false, errorKind: '进位', correctTotal: 208 },
    how: '先乘后加减：9×7=63，16×7=112；63-12+112+30-26+41 = 51+112+30-26+41 = 163+30-26+41 = 193-26+41 = 167+41 = 208。写法 198 = 208-10，是漏了进位那一档。',
  },
  {
    id: 'C01',
    seed: 'hand-c01-2',
    points: 4,
    factsDigest: {
      expr: '14 × 11 - 19 + 13 × 6 + 40',
      terms: 6,
      written: 928,
    },
    answer: { isCorrect: false, errorKind: '运算优先级', correctTotal: 253 },
    how: '先乘后加减：14×11=154，13×6=78；154-19+78+40 = 135+78+40 = 213+40 = 253。写法的 928 恰好是「不分优先级、从左往右硬算」的结果（154-19=135，135+13=148，148×6=888，888+40=928），所以属于运算优先级错误。',
  },
  {
    id: 'C01',
    seed: 'hand-c01-3',
    points: 4,
    factsDigest: {
      expr: '12 × 8 - 35 + 12 × 11 + 29',
      terms: 6,
      written: 832,
    },
    answer: { isCorrect: false, errorKind: '运算优先级', correctTotal: 222 },
    how: '先乘后加减：12×8=96，12×11=132；96-35+132+29 = 61+132+29 = 193+29 = 222。写法的 832 是左到右硬算（96-35=61，61+12=73，73×11=803，803+29=832），故为运算优先级错误。',
  },
  {
    id: 'C01',
    seed: 'hand-c01-4',
    points: 4,
    factsDigest: {
      expr: '19 × 12 - 16 + 6 × 7 + 12',
      terms: 6,
      written: 266,
    },
    answer: { isCorrect: true, errorKind: '无', correctTotal: 266 },
    how: '先乘后加减：19×12=228，6×7=42；228-16+42+12 = 212+42+12 = 254+12 = 266。写法 266 与手算一致，所以原式本来就对，错误类别为「无」。这一条专门防「isCorrect 恒为 false」。',
  },

  /* ------------------------------ C02 ------------------------------ */
  {
    id: 'C02',
    seed: 'hand-c02-1',
    points: 6,
    factsDigest: {
      init: { main: 286, aux: 182, total: 468 },
      steps: { 1: '入库 +70', 2: '出库 -38', 3: '盘亏 -15', 4: '调拨 38（主→分，合计不变）', 5: '入库 +42', 6: '作废第5步 -42', 7: '反悔（撤销第6步）+42', 8: '分仓出库 -39', 9: '作废第2步 +38', 10: '盘盈 +19' },
    },
    answer: { beforeVoid: 527, finalStock: 545 },
    how: '初始合计 286+182=468。① 468+70=538 → -38=500 → -15=485 → 调拨±0 仍 485 → +42=527（=第一次作废之前）。② -42=485 → 反悔 +42=527 → -39=488 → 作废第2步 +38=526 → +19=545。关键：第4步调拨在**合计**上是 0，不能减两次。',
  },
  {
    id: 'C02',
    seed: 'hand-c02-2',
    points: 6,
    factsDigest: {
      init: { main: 245, aux: 178, total: 423 },
      steps: { 1: '入库 +60', 2: '出库 -60', 3: '盘亏 -5', 4: '调拨 30（主→分，合计不变）', 5: '入库 +32', 6: '作废第5步 -32', 7: '反悔（撤销第6步）+32', 8: '分仓出库 -16', 9: '作废第2步 +60', 10: '盘盈 +19' },
    },
    answer: { beforeVoid: 450, finalStock: 513 },
    how: '初始合计 245+178=423。① 423+60=483 → -60=423 → -5=418 → 调拨±0 仍 418 → +32=450（=第一次作废之前）。② -32=418 → 反悔 +32=450 → -16=434 → 作废第2步 +60=494 → +19=513。注意第2步出库与第9步作废互相抵销。',
  },
  {
    id: 'C02',
    seed: 'hand-c02-3',
    points: 6,
    factsDigest: {
      init: { main: 261, aux: 174, total: 435 },
      steps: { 1: '入库 +45', 2: '出库 -40', 3: '盘亏 -24', 4: '调拨 30（主→分，合计不变）', 5: '入库 +47', 6: '作废第5步 -47', 7: '反悔（撤销第6步）+47', 8: '分仓出库 -19', 9: '作废第2步 +40', 10: '盘盈 +11' },
    },
    answer: { beforeVoid: 463, finalStock: 495 },
    how: '初始合计 261+174=435。① 435+45=480 → -40=440 → -24=416 → 调拨±0 仍 416 → +47=463（=第一次作废之前）。② -47=416 → 反悔 +47=463 → -19=444 → 作废第2步 +40=484 → +11=495。可以验算：最终 - 作废前 = -19+40+11 = 32，495-463=32 ✔',
  },

  /* ------------------------------ C03 ------------------------------ */
  {
    id: 'C03',
    seed: 'hand-c03-1',
    points: 6,
    factsDigest: {
      limits: { 旧: 3640, 新: 4734, 修订: 5252 },
      clauses: '新规期未审批→追溯改按修订；3/18–3/19 提交→一律按新（不追溯）；规则按提交日期适用',
      apps: {
        a1: '3/19 未审批 4410', a2: '2/19 已完成 3104', a3: '3/13 未审批 5014', a4: '3/19 未审批 4374',
        a5: '3/14 已完成 4150', a6: '3/14 已完成 4146', a7: '3/7 未审批 4842', a8: '2/22 已完成 3577',
      },
    },
    answer: {
      a1: { rule: '新', needManual: false },   // 过渡期 → 新；4410 ≤ 4734
      a2: { rule: '旧', needManual: false },   // 旧规期；3104 ≤ 3640
      a3: { rule: '修订', needManual: false }, // 追溯；5014 ≤ 5252
      a4: { rule: '新', needManual: false },   // 过渡期 → 新；4374 ≤ 4734
      a5: { rule: '新', needManual: false },   // 已审批不追溯；4150 ≤ 4734
      a6: { rule: '新', needManual: false },   // 已审批不追溯；4146 ≤ 4734
      a7: { rule: '修订', needManual: false }, // 追溯；4842 ≤ 5252
      a8: { rule: '旧', needManual: false },   // 旧规期；3577 ≤ 3640
    },
    how: '逐笔：2 月提交→旧；3/18–19 提交→过渡期例外一律按新（即使未审批）；3 月其它日期且未审批→追溯按修订；3 月其它日期且已完成审批→按新。再拿各自门槛比金额：a1 4410≤4734、a2 3104≤3640、a3 5014≤5252、a4 4374≤4734、a5 4150≤4734、a6 4146≤4734、a7 4842≤5252、a8 3577≤3640，全部不需人工。注意这一池 needManual 恰好全为 false，是真实结果，不是放水。',
  },
  {
    id: 'C03',
    seed: 'hand-c03-2',
    points: 6,
    factsDigest: {
      limits: { 旧: 3634, 新: 5021, 修订: 5804 },
      clauses: '新规期未审批→追溯改按修订；3/18–3/19 提交→一律按新（不追溯）；规则按提交日期适用',
      apps: {
        a1: '2/24 已完成 4123', a2: '3/10 未审批 5535', a3: '2/19 已完成 3887', a4: '3/18 未审批 5409',
        a5: '3/10 已完成 5157', a6: '3/5 已完成 4671', a7: '3/8 未审批 5886', a8: '3/19 未审批 4610',
      },
    },
    answer: {
      a1: { rule: '旧', needManual: true },    // 4123 > 3634
      a2: { rule: '修订', needManual: false }, // 追溯；5535 ≤ 5804
      a3: { rule: '旧', needManual: true },    // 3887 > 3634
      a4: { rule: '新', needManual: true },    // 过渡期 → 新；5409 > 5021
      a5: { rule: '新', needManual: true },    // 已审批不追溯；5157 > 5021
      a6: { rule: '新', needManual: false },   // 4671 ≤ 5021
      a7: { rule: '修订', needManual: true },  // 追溯；5886 > 5804
      a8: { rule: '新', needManual: false },   // 过渡期 → 新；4610 ≤ 5021
    },
    how: '规则判定同夹具 5。门槛比对：a1 4123>3634 需人工；a2 5535≤5804 不需；a3 3887>3634 需；a4 5409>5021 需；a5 5157>5021 需；a6 4671≤5021 不需；a7 5886>5804 需；a8 4610≤5021 不需。这一池 true/false 都覆盖，与夹具 5 互补 —— 夹具 5 全 false 时若判分器「needManual 恒 false」也能过，必须靠这一条拦住。',
  },
  {
    id: 'C03',
    seed: 'hand-c03-3',
    points: 6,
    factsDigest: {
      limits: { 旧: 3641, 新: 5125, 修订: 5616 },
      clauses: '新规期未审批→追溯改按修订；3/18–3/19 提交→一律按新（不追溯）；规则按提交日期适用',
      apps: {
        a1: '3/16 未审批 5395', a2: '3/7 未审批 5106', a3: '3/18 未审批 4914', a4: '2/22 已完成 4223',
        a5: '3/17 已完成 4608', a6: '3/11 已完成 4594', a7: '3/18 未审批 5288', a8: '2/13 已完成 4117',
      },
    },
    answer: {
      a1: { rule: '修订', needManual: false }, // 追溯；5395 ≤ 5616
      a2: { rule: '修订', needManual: false }, // 追溯；5106 ≤ 5616
      a3: { rule: '新', needManual: false },   // 过渡期；4914 ≤ 5125
      a4: { rule: '旧', needManual: true },    // 4223 > 3641
      a5: { rule: '新', needManual: false },   // 已审批；4608 ≤ 5125
      a6: { rule: '新', needManual: false },   // 已审批；4594 ≤ 5125
      a7: { rule: '新', needManual: true },    // 过渡期；5288 > 5125
      a8: { rule: '旧', needManual: true },    // 4117 > 3641
    },
    how: '规则判定同夹具 5。门槛比对：a1 5395≤5616 不需；a2 5106≤5616 不需（若误按新门槛 5125 会判成需人工 → 这正是考点）；a3 4914≤5125 不需；a4 4223>3641 需；a5 4608≤5125 不需；a6 4594≤5125 不需；a7 5288>5125 需；a8 4117>3641 需。a2 是本条最有价值的一笔：金额卡在「新 5125」与「修订 5616」之间，只有正确追溯才能判对。',
  },

  /* ------------------------------ C04 ------------------------------ */
  {
    id: 'C04',
    seed: 'hand-c04-1',
    points: 9,
    factsDigest: {
      script: { unit_price: 41.95, qty: 8, subtotal_round: 0, rate: 0.75 },
      actual: { unit_price: 41.95, qty: 5, rate: 0.75, subtotal_round: '不取整', total_round: 2 },
      scriptPrintedTotal: 252,
    },
    answer: { rootCause: '数量用错+四舍五入', fixedSubtotal: 209.75, fixedTotal: 157.31 },
    how: 'bug1 数量用错（脚本 qty=8，实际 5）；bug2 四舍五入（脚本把 subtotal round 到 0 位，抹掉分位）。两处都修：41.95×5 = 209.75；209.75×0.75 = 157.3125 → 保留两位 157.31。互相掩盖验证：只修 bug1 → round(209.75,0)=210，210×0.75=157.5≠157.31；只修 bug2 → 41.95×8=335.6，×0.75=251.7≠157.31。',
  },
  {
    id: 'C04',
    seed: 'hand-c04-2',
    points: 9,
    factsDigest: {
      script: { unit_price: 22.45, qty: 8, subtotal_round: 2, rate: 1 },
      actual: { unit_price: 20.95, qty: 8, rate: 0.8, subtotal_round: '不取整', total_round: 2 },
      scriptPrintedTotal: 179.6,
    },
    answer: { rootCause: '单价用错+折扣漏乘', fixedSubtotal: 167.6, fixedTotal: 134.08 },
    how: 'bug1 单价用错（脚本 22.45，实际 20.95）；bug2 折扣漏乘（脚本 rate=1，0.8 根本没乘上）。两处都修：20.95×8 = 167.60；167.60×0.8 = 134.08。互相掩盖验证：只修 bug1 → 167.60×1 = 167.60≠134.08；只修 bug2 → 22.45×8=179.60，×0.8=143.68≠134.08。',
  },
  {
    id: 'C04',
    seed: 'hand-c04-3',
    points: 9,
    factsDigest: {
      script: { unit_price: 35.1, qty: 8, subtotal_round: 0, rate: 0.85 },
      actual: { unit_price: 35.1, qty: 6, rate: 0.85, subtotal_round: '不取整', total_round: 2 },
      scriptPrintedTotal: 238.85,
    },
    answer: { rootCause: '数量用错+四舍五入', fixedSubtotal: 210.6, fixedTotal: 179.01 },
    how: 'bug1 数量用错（脚本 qty=8，实际 6）；bug2 四舍五入（subtotal round 到 0 位）。两处都修：35.1×6 = 210.60；210.60×0.85 = 179.01。互相掩盖验证：只修 bug1 → round(210.6,0)=211，211×0.85=179.35≠179.01；只修 bug2 → 35.1×8=280.8，×0.85=238.68≠179.01。',
  },
];

/** 供外部按 id 取夹具 */
export const FIXTURES_BY_ID = IDS.reduce((acc, id) => {
  acc[id] = FIXTURES.filter((f) => f.id === id);
  return acc;
}, {});

/** 取某题在某 seed 下的实例（含 facts，仅供判分 / 核对题面参数） */
const internal = (id, seed) => instantiateInternal(item(id), seed);

/** 判分：唯一被信任的接口 */
function grade(id, seed, answer) {
  return gradeItem(internal(id, seed), answer, { seed });
}

/** 收集某题在若干 seed 下的 prompt */
function promptsOf(id, seeds) {
  return seeds.map((s) => item(id).generate(s).prompt);
}

const SEEDS20 = Array.from({ length: 20 }, (_, i) => `hard-${i}`);

/* ==================================================================== *
 * 1. 20 seed：generate 不抛异常 + 确定性（同 seed 逐字节一致）
 * ==================================================================== */
test('C01–C04：20 个 seed 下 generate 不抛异常，且同 seed 完全确定', () => {
  for (const id of IDS) {
    for (const seed of [...SEEDS20, 'demo', '中文', 'x'.repeat(40), '1', '0']) {
      let g1;
      assert.doesNotThrow(() => { g1 = item(id).generate(seed); }, `${id} seed=${seed} generate 抛异常`);
      assert.equal(typeof g1.prompt, 'string', `${id} 缺 prompt`);
      assert.ok(g1.prompt.length > 80, `${id} 题面过短（${g1.prompt.length}）`);
      assert.ok(g1.facts && typeof g1.facts === 'object', `${id} 缺 facts`);
      assert.ok(Array.isArray(g1.publicCriteria), `${id} 缺 publicCriteria`);

      // 确定性：同 seed 两次生成必须逐字节一致
      const g2 = item(id).generate(seed);
      assert.equal(g2.prompt, g1.prompt, `${id} seed=${seed} 题面不确定`);
      assert.equal(JSON.stringify(g2.facts), JSON.stringify(g1.facts), `${id} seed=${seed} facts 不确定`);
      // 判分也要确定：同样的答案判两次，分数与理由都必须一致
      const o = item(id).oracle(g1.facts);
      const r1 = grade(id, seed, o);
      const r2 = grade(id, seed, o);
      assert.equal(r1.awarded, r2.awarded, `${id} seed=${seed} 判分不确定`);
    }
  }
});

test('C01–C04：不同 seed 必须产生实质不同的题面（不得可背）', () => {
  for (const id of IDS) {
    const set = new Set(promptsOf(id, SEEDS20));
    assert.ok(set.size >= 15, `${id} 20 个 seed 只产生了 ${set.size} 种题面，变化不足`);
  }
});

/* ==================================================================== *
 * 2. oracle 答案 20 seed 下都满分
 * ==================================================================== */
test('C01–C04：oracle 答案在 20 个 seed 下都拿满分', () => {
  for (const id of IDS) {
    const pts = item(id).points;
    for (const seed of SEEDS20) {
      const g = item(id).generate(seed);
      const o = item(id).oracle(g.facts);
      const r = grade(id, seed, o);
      assert.equal(
        r.awarded,
        pts,
        `${id} seed=${seed} oracle 答案只拿 ${r.awarded}/${pts}；失败条件：` +
          r.checks.filter((c) => !c.passed).map((c) => `${c.criterionId}(${c.reason})`).join(' | '),
      );
      assert.equal(r.gradingStatus, 'GRADED', `${id} seed=${seed} 状态为 ${r.gradingStatus}`);
    }
  }
});

/* ==================================================================== *
 * 3. 手算夹具（期望值为人工算出的字面常量，不调用 oracle）
 * ==================================================================== */

test('FIXTURES 表自检：每题 ≥3 条、结构完整、且答案确实能判满分', () => {
  assert.ok(Array.isArray(FIXTURES), 'FIXTURES 必须是数组');
  for (const id of IDS) {
    const list = FIXTURES_BY_ID[id];
    assert.ok(Array.isArray(list) && list.length >= 3, `${id} 的夹具少于 3 条（${list && list.length}）`);
    for (const fx of list) {
      assert.equal(fx.id, id);
      assert.equal(typeof fx.seed, 'string');
      assert.equal(fx.points, item(id).points, `${id} fixture.points 与题目分值不符`);
      assert.ok(fx.factsDigest && typeof fx.factsDigest === 'object', `${id} 缺 factsDigest`);
      assert.ok(fx.answer && typeof fx.answer === 'object', `${id} 缺 answer`);
      assert.equal(typeof fx.how, 'string');
      assert.ok(fx.how.length >= 20, `${id} seed=${fx.seed} 的 how 太短，没写清怎么算的`);
      // 关键：这些常量必须真的能判满分
      const r = grade(id, fx.seed, fx.answer);
      assert.equal(r.awarded, fx.points,
        `${id} seed=${fx.seed} 夹具答案只得 ${r.awarded}/${fx.points}；${r.checks.map((c) => c.reason).join(' | ')}`);
    }
  }
  // 夹具的 seed 不能重复（否则等于只有一条）
  const seeds = FIXTURES.map((f) => `${f.id}:${f.seed}`);
  assert.equal(new Set(seeds).size, seeds.length, 'FIXTURES 里有重复的 id+seed');
});

test('FIXTURES 的 factsDigest 必须与题目实际生成的参数一致（防止夹具与题面脱节）', () => {
  // C01：expr / terms / written 必须与 generate 出来的一致
  for (const fx of FIXTURES_BY_ID.C01) {
    const f = item('C01').generate(fx.seed).facts;
    assert.equal(fx.factsDigest.expr, f.expr, `${fx.seed} factsDigest.expr 与题面不符`);
    assert.equal(fx.factsDigest.terms, f.operandCount, `${fx.seed} factsDigest.terms 与题面不符`);
    assert.equal(fx.factsDigest.written, f.wrong, `${fx.seed} factsDigest.written 与题面不符`);
  }
  // C02：初始三仓合计与各步数量
  for (const fx of FIXTURES_BY_ID.C02) {
    const f = item('C02').generate(fx.seed).facts;
    assert.equal(fx.factsDigest.init.main, f.initMain, `${fx.seed} 主仓初始不符`);
    assert.equal(fx.factsDigest.init.aux, f.initAux, `${fx.seed} 分仓初始不符`);
    assert.equal(fx.factsDigest.init.total, f.initMain + f.initAux, `${fx.seed} 初始合计不符`);
    assert.equal(fx.factsDigest.steps[1], `入库 +${f.s1}`, `${fx.seed} 第1步不符`);
    assert.equal(fx.factsDigest.steps[4], `调拨 ${f.t1}（主→分，合计不变）`, `${fx.seed} 第4步不符`);
    assert.equal(fx.factsDigest.steps[9], `作废第2步 +${f.s2}`, `${fx.seed} 第9步不符`);
  }
  // C03：三版门槛
  for (const fx of FIXTURES_BY_ID.C03) {
    const f = item('C03').generate(fx.seed).facts;
    assert.deepEqual(fx.factsDigest.limits, { 旧: f.limitOld, 新: f.limitNew, 修订: f.limitRev },
      `${fx.seed} 三版门槛不符`);
    assert.equal(Object.keys(fx.answer).length, 8, `${fx.seed} 答案不是 8 笔`);
  }
  // C04：脚本参数与打印出来的 total
  for (const fx of FIXTURES_BY_ID.C04) {
    const f = item('C04').generate(fx.seed).facts;
    assert.equal(fx.factsDigest.script.unit_price, f.priceBug, `${fx.seed} 脚本单价不符`);
    assert.equal(fx.factsDigest.script.qty, f.qtyBug, `${fx.seed} 脚本数量不符`);
    assert.equal(fx.factsDigest.script.rate, f.scriptRate, `${fx.seed} 脚本 rate 不符`);
    assert.equal(fx.factsDigest.script.subtotal_round, f.subtotalRoundDigits, `${fx.seed} 脚本 round 位数不符`);
    assert.equal(fx.factsDigest.actual.unit_price, f.price, `${fx.seed} 正确单价不符`);
    assert.equal(fx.factsDigest.actual.qty, f.qtyOk, `${fx.seed} 正确数量不符`);
    assert.equal(fx.factsDigest.actual.rate, f.rate, `${fx.seed} 正确 rate 不符`);
    assert.equal(fx.factsDigest.scriptPrintedTotal, f.buggyTotal, `${fx.seed} 脚本输出值不符`);
  }
});

/**
 * 夹具 1 —— C01 / seed = 'hand-c01-1'
 * 题面算式（8 项）：9 × 7 - 12 + 16 × 7 + 30 - 26 + 41，店员写的结果 198
 *
 * 手算（先乘后加减，无括号）：
 *   9 × 7 = 63
 *   16 × 7 = 112
 *   63 - 12 + 112 + 30 - 26 + 41
 *   = 51 + 112 + 30 - 26 + 41
 *   = 163 + 30 - 26 + 41
 *   = 193 - 26 + 41
 *   = 167 + 41
 *   = 208
 * 所以：正确值 208，店员写的 198 是错的（198 = 208 - 10，漏了进位）。
 */
test('手算夹具 1 · C01：优先级计算的正确值是 208，不是 198', () => {
  const r = grade('C01', 'hand-c01-1', { isCorrect: false, errorKind: '进位', correctTotal: 208 });
  assert.equal(r.awarded, 4, `手算 208/进位 只得 ${r.awarded}/4；${r.checks.map((c) => c.reason).join(' | ')}`);
});

/**
 * 夹具 2 —— C01 / seed = 'hand-c01-2'
 * 题面算式（6 项）：14 × 11 - 19 + 13 × 6 + 40，店员写的结果 928
 *
 * 手算：14 × 11 = 154；13 × 6 = 78
 *   154 - 19 + 78 + 40 = 135 + 78 + 40 = 213 + 40 = 253
 * 店员写的 928 是错的。928 恰好等于「全部从左到右硬算」的结果
 * （14×11=154, 154-19=135, 135+13=148, 148×6=888, 888+40=928），
 * 所以错误类别是「运算优先级」。
 */
test('手算夹具 2 · C01：从左到右硬算得 928，正确值是 253（优先级错误）', () => {
  const r = grade('C01', 'hand-c01-2', { isCorrect: false, errorKind: '运算优先级', correctTotal: 253 });
  assert.equal(r.awarded, 4, `手算 253/优先级 只得 ${r.awarded}/4；${r.checks.map((c) => c.reason).join(' | ')}`);
});

/**
 * 夹具 3 —— C02 / seed = 'hand-c02-1'
 * 初始：主仓 286，分仓 182。参数：s1=70 s2=38 s3=15 t1=38 s5=42 s8=39 s10=19
 *
 * 逐步手算（合计口径）：
 *   初始合计 = 286 + 182 = 468
 *   第1步 入库 +70            → 538
 *   第2步 出库 -38            → 500
 *   第3步 盘亏 -15            → 485
 *   第4步 调拨 38（主→分）    → 485（合计不变，这是关键：不要减两次）
 *   第5步 入库 +42            → 527   ← 第一次作废之前 = 527
 *   第6步 作废第5步入库 -42   → 485
 *   第7步 反悔（撤销第6步）+42 → 527
 *   第8步 分仓出库 -39        → 488
 *   第9步 作废第2步出库 +38   → 526
 *   第10步 盘盈 +19           → 545
 * 所以 beforeVoid = 527，finalStock = 545。
 */
test('手算夹具 3 · C02：十步台账后 beforeVoid=527、finalStock=545', () => {
  const r = grade('C02', 'hand-c02-1', { beforeVoid: 527, finalStock: 545 });
  assert.equal(r.awarded, 6, `手算 527/545 只得 ${r.awarded}/6；${r.checks.map((c) => c.reason).join(' | ')}`);
});

/**
 * 夹具 4 —— C02 / seed = 'hand-c02-2'
 * 初始：主仓 245，分仓 178。参数：s1=60 s2=60 s3=5 t1=30 s5=32 s8=16 s10=19
 *
 *   初始合计 = 245 + 178 = 423
 *   第1步 +60             → 483
 *   第2步 -60             → 423
 *   第3步 -5              → 418
 *   第4步 调拨 30         → 418（合计不变）
 *   第5步 +32             → 450   ← 第一次作废之前 = 450
 *   第6步 作废第5步 -32   → 418
 *   第7步 反悔 +32        → 450
 *   第8步 -16             → 434
 *   第9步 作废第2步 +60   → 494
 *   第10步 +19            → 513
 * 所以 beforeVoid = 450，finalStock = 513。
 */
test('手算夹具 4 · C02：第 2 步与第 5 步互相抵销，finalStock=513', () => {
  const r = grade('C02', 'hand-c02-2', { beforeVoid: 450, finalStock: 513 });
  assert.equal(r.awarded, 6, `手算 450/513 只得 ${r.awarded}/6；${r.checks.map((c) => c.reason).join(' | ')}`);
});

/**
 * 夹具 5 —— C03 / seed = 'hand-c03-1'
 * 门槛：旧 3640 / 新 4734 / 修订 5252
 * 条款：新规期 + 未审批 → 按修订；3/18–3/19 提交 → 一律按新（不追溯）
 *
 *   a1  3/19 未审批 4410 → 过渡期 → 新，4410 ≤ 4734 → 不需人工      (新, false)
 *   a2  2/19 已完成 3104 → 旧规期 → 旧，3104 ≤ 3640 → 不需人工      (旧, false)
 *   a3  3/13 未审批 5014 → 追溯   → 修订，5014 ≤ 5252 → 不需人工    (修订, false)
 *   a4  3/19 未审批 4374 → 过渡期 → 新，4374 ≤ 4734 → 不需人工      (新, false)
 *   a5  3/14 已完成 4150 → 新规期 + 已审批 → 不追溯 → 新，4150 ≤ 4734 → 不需人工 (新, false)
 *   a6  3/14 已完成 4146 → 同上 → 新，4146 ≤ 4734 → 不需人工        (新, false)
 *   a7  3/7  未审批 4842 → 追溯   → 修订，4842 ≤ 5252 → 不需人工    (修订, false)
 *   a8  2/22 已完成 3577 → 旧规期 → 旧，3577 ≤ 3640 → 不需人工      (旧, false)
 *
 * ⚠️ 这一池里 8 笔的 needManual 恰好全是 false（金额都落在门槛以下），
 *    这是该 seed 的真实答案，不是判分器放水 —— 见下面「过渡期 vs 追溯」那条用例的反证。
 */
test('手算夹具 5 · C03：追溯与过渡期例外的逐笔判定', () => {
  const want = {
    a1: { rule: '新', needManual: false },
    a2: { rule: '旧', needManual: false },
    a3: { rule: '修订', needManual: false },
    a4: { rule: '新', needManual: false },
    a5: { rule: '新', needManual: false },
    a6: { rule: '新', needManual: false },
    a7: { rule: '修订', needManual: false },
    a8: { rule: '旧', needManual: false },
  };
  const r = grade('C03', 'hand-c03-1', want);
  assert.equal(r.awarded, 6, `手算八笔只得 ${r.awarded}/6；${r.checks.map((c) => c.reason).join(' | ')}`);
});

/**
 * 夹具 6 —— C03 / seed = 'hand-c03-2'
 * 门槛：旧 3634 / 新 5021 / 修订 5804
 *
 *   a1  2/24 已完成 4123 → 旧，4123 > 3634 → 需人工            (旧, true)
 *   a2  3/10 未审批 5535 → 追溯 → 修订，5535 ≤ 5804 → 不需人工  (修订, false)
 *   a3  2/19 已完成 3887 → 旧，3887 > 3634 → 需人工            (旧, true)
 *   a4  3/18 未审批 5409 → 过渡期 → 新，5409 > 5021 → 需人工    (新, true)
 *   a5  3/10 已完成 5157 → 新，5157 > 5021 → 需人工            (新, true)
 *   a6  3/5  已完成 4671 → 新，4671 ≤ 5021 → 不需人工          (新, false)
 *   a7  3/8  未审批 5886 → 追溯 → 修订，5886 > 5804 → 需人工    (修订, true)
 *   a8  3/19 未审批 4610 → 过渡期 → 新，4610 ≤ 5021 → 不需人工  (新, false)
 *
 * 这一池把 needManual 的两种取值都覆盖到了，与夹具 5 形成互补。
 */
test('手算夹具 6 · C03：needManual 两种取值都覆盖', () => {
  const want = {
    a1: { rule: '旧', needManual: true },
    a2: { rule: '修订', needManual: false },
    a3: { rule: '旧', needManual: true },
    a4: { rule: '新', needManual: true },
    a5: { rule: '新', needManual: true },
    a6: { rule: '新', needManual: false },
    a7: { rule: '修订', needManual: true },
    a8: { rule: '新', needManual: false },
  };
  const r = grade('C03', 'hand-c03-2', want);
  assert.equal(r.awarded, 6, `手算八笔只得 ${r.awarded}/6；${r.checks.map((c) => c.reason).join(' | ')}`);
});

/**
 * 夹具 7 —— C04 / seed = 'hand-c04-1'
 * 脚本：unit_price=41.95, qty=8, subtotal=round(41.95*8, 0), rate=0.75, total=round(subtotal*rate,2)
 * 核对：正确单价 41.95、正确数量 5、折扣率 0.75、小计不取整、应付保留两位
 *
 * 两处错误：
 *   bug1 = 数量用错（脚本 qty=8，应为 5）
 *   bug2 = 四舍五入（脚本对 subtotal 做了 round(...,0)，把分位抹掉了）
 *
 * 手算正确值：
 *   原始小计 = 41.95 × 5 = 209.75
 *   应付 = 209.75 × 0.75 = 157.3125 → 保留两位 = 157.31
 *
 * 验证「互相掩盖」：
 *   只修 bug1（qty 改 5，四舍五入还在）：round(209.75,0) = 210；210 × 0.75 = 157.5 ≠ 157.31
 *   只修 bug2（round 改 2 位，qty 还是 8）：41.95 × 8 = 335.6；335.6 × 0.75 = 251.7 ≠ 157.31
 */
test('手算夹具 7 · C04：数量用错 + 四舍五入，修复后 209.75 / 157.31', () => {
  const r = grade('C04', 'hand-c04-1', {
    rootCause: '数量用错+四舍五入',
    fixedSubtotal: 209.75,
    fixedTotal: 157.31,
  });
  assert.equal(r.awarded, 9, `手算 209.75/157.31 只得 ${r.awarded}/9；${r.checks.map((c) => c.reason).join(' | ')}`);
});

/**
 * 夹具 8 —— C04 / seed = 'hand-c04-2'
 * 脚本：unit_price=22.45, qty=8, subtotal=round(22.45*8, 2), rate=1, total=round(subtotal*rate,2)
 * 核对：正确单价 20.95、正确数量 8、折扣率 0.8、应付保留两位
 *
 * 两处错误：
 *   bug1 = 单价用错（脚本 22.45，应为 20.95）
 *   bug2 = 折扣漏乘（脚本 rate=1，根本没乘 0.8）
 *
 * 手算正确值：
 *   原始小计 = 20.95 × 8 = 167.60
 *   应付 = 167.60 × 0.8 = 134.08
 *
 * 互相掩盖验证：
 *   只修 bug1（单价改 20.95，rate 仍为 1）：167.60 × 1 = 167.60 ≠ 134.08
 *   只修 bug2（rate 改 0.8，单价仍 22.45）：22.45 × 8 = 179.60；179.60 × 0.8 = 143.68 ≠ 134.08
 */
test('手算夹具 8 · C04：单价用错 + 折扣漏乘，修复后 167.60 / 134.08', () => {
  const r = grade('C04', 'hand-c04-2', {
    rootCause: '单价用错+折扣漏乘',
    fixedSubtotal: 167.6,
    fixedTotal: 134.08,
  });
  assert.equal(r.awarded, 9, `手算 167.60/134.08 只得 ${r.awarded}/9；${r.checks.map((c) => c.reason).join(' | ')}`);
});

/* ==================================================================== *
 * 4. 全错答案必须 0 分
 * ==================================================================== */
test('C01–C04：全错答案一律 0 分（不得靠格式或部分匹配得分）', () => {
  // 注意 C01 / C02 要「按本题实际情况取反」，不能写死常量 ——
  // C01 的 isCorrect 本身可能是 true，写死 false 会在部分 seed 上碰巧答对。
  for (const id of IDS) {
    for (const seed of ['hard-0', 'hard-1', 'demo', 'hand-c01-1', 'hand-c02-1']) {
      const f = item(id).generate(seed).facts;
      const o = item(id).oracle(f);
      let wrong;
      if (id === 'C01') {
        wrong = { isCorrect: !o.isCorrect, errorKind: '运算优先级', correctTotal: o.correctTotal + 7 };
        // 若 oracle 本来就 false，刚构造的 isCorrect 会是 true → 反而答对，故强制取反两处
        if (wrong.isCorrect === o.isCorrect) wrong.isCorrect = !o.isCorrect;
      } else if (id === 'C02') {
        wrong = { beforeVoid: o.beforeVoid + 3, finalStock: o.finalStock + 5 };
      } else if (id === 'C03') {
        wrong = Object.fromEntries(
          ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8']
            .map((k) => [k, { rule: o.cases[k].rule === '修订' ? '新' : '修订', needManual: !o.cases[k].needManual }]),
        );
      } else {
        wrong = { rootCause: '四舍五入+折扣漏乘', fixedSubtotal: o.fixedSubtotal + 3, fixedTotal: o.fixedTotal + 4 };
      }
      const r = grade(id, seed, wrong);
      assert.equal(r.awarded, 0, `${id} seed=${seed} 全错答案竟得 ${r.awarded}/${item(id).points}；${r.checks.map((c) => c.reason).join(' | ')}`);
    }
  }
});

test('C01–C04：空答案与垃圾输入不得崩溃（要么 0 分，要么 UNPARSEABLE）', () => {
  // 注意：不能把函数、Symbol 这类「根本不是答案」的值塞进去 ——
  // gradeItem 会对原始答案做 JSON.stringify 算哈希，那是 grader 层的前置契约，
  // 不属于本题目的解析职责。这里只放「可能来自模型的真实垃圾输入」。
  const junk = [null, undefined, '', '   ', '？？？？', 'asdkjhqwe@@@!!!', '{{{', '[]', '{"a":}', 12345, true, ['x', 'y'], { 乱码: true }];
  for (const id of IDS) {
    for (const raw of junk) {
      let r;
      assert.doesNotThrow(() => { r = grade(id, 'junk-seed', raw); }, `${id} 对 ${JSON.stringify(raw)} 抛异常`);
      assert.ok(['GRADED', 'UNPARSEABLE', 'MISSING_ANSWER'].includes(r.gradingStatus),
        `${id} 垃圾输入状态异常：${r.gradingStatus}`);
      assert.ok(r.awarded >= 0 && r.awarded <= item(id).points, `${id} 给分越界：${r.awarded}`);
    }
    // 深层嵌套 / 超长串也不许崩
    assert.doesNotThrow(() => grade(id, 'junk', { a: { b: { c: { d: [1, 2, 3] } } }, nested: 'x'.repeat(5000) }));
    assert.doesNotThrow(() => grade(id, 'junk', 'x'.repeat(20000)));
    assert.doesNotThrow(() => grade(id, 'junk', { rootCause: 12345, fixedTotal: 'abc' }));
  }
});

test('C01–C04：题目自带的 parse/fallback 收到畸形输入也不得抛异常', () => {
  // 直接调用各题的 parse()（若声明了）与 fallback()，绕开 grader 前置校验，
  // 确保「解析层本身」不依赖调用方保证输入形状。
  const weird = [null, undefined, '', '   ', 0, 1, -1, NaN, Infinity, true, false, {}, [], ['a'], { a: 1 },
    'x'.repeat(10000), '{"a":', '\u0000\u0001', '中文乱码测试', { toString() { throw new Error('boom'); } }];
  // 上面这个会真的抛的对象单独处理：它属于「恶意对象」，题目代码不负责防御，
  // 只要求 grader 层不会因此给分错误。
  const normalWeird = weird.filter((v) => !(v && typeof v === 'object' && typeof v.toString === 'function' && v.toString.length === 0));
  for (const id of IDS) {
    const it = item(id);
    for (const raw of normalWeird) {
      if (typeof it.fallback === 'function') {
        assert.doesNotThrow(() => it.fallback(raw), `${id}.fallback 对 ${String(raw).slice(0, 20)} 抛异常`);
      }
      if (typeof it.parse === 'function') {
        assert.doesNotThrow(() => it.parse(raw), `${id}.parse 对 ${String(raw).slice(0, 20)} 抛异常`);
      }
    }
  }
});

test('C01–C04：grade() 直接收到畸形 parsed 也不得抛异常', () => {
  const weirdParsed = [
    null, undefined, {}, { fields: null }, { fields: {} }, { fields: { a: 1 } },
    { fields: { rootCause: 12345 } }, { fields: { correctTotal: 'abc' } },
    { fields: { beforeVoid: NaN, finalStock: Infinity } },
    { fields: { a1: 'not an object' } },
    { fields: { a1: null, a2: 5 } },
    { fields: { isCorrect: 'maybe', errorKind: null, correctTotal: {} } },
    { fields: { rootCause: '数量用错+四舍五入', fixedSubtotal: 'x', fixedTotal: [] } },
  ];
  for (const id of IDS) {
    for (const seed of ['hard-0', 'hard-1']) {
      const it = item(id);
      const f = it.generate(seed).facts;
      for (const p of weirdParsed) {
        let checks;
        assert.doesNotThrow(() => { checks = it.grade(p, f); }, `${id} seed=${seed} grade(${JSON.stringify(p)}) 抛异常`);
        // 返回结构必须仍然与 publicCriteria 对齐
        const criteria = it.generate(seed).publicCriteria;
        assert.equal(checks.length, criteria.length, `${id} grade 返回的条件数量与 publicCriteria 不一致`);
        for (let i = 0; i < criteria.length; i++) {
          assert.equal(checks[i].criterionId, criteria[i].id, `${id} 条件顺序/ID 不一致`);
          assert.equal(checks[i].points, criteria[i].points, `${id} 条件分值不一致`);
          assert.equal(typeof checks[i].passed, 'boolean', `${id} passed 必须是布尔`);
          assert.equal(typeof checks[i].reason, 'string', `${id} reason 必须是字符串`);
          assert.ok(checks[i].reason.length > 0, `${id} reason 不能为空`);
        }
      }
    }
  }
});

/* ==================================================================== *
 * 5. 题面无泄漏：不得出现答案值
 * ==================================================================== */
test('C01–C04：题面不得直接给出答案（无泄漏）', () => {
  for (const id of IDS) {
    for (const seed of SEEDS20) {
      const g = item(id).generate(seed);
      const o = item(id).oracle(g.facts);
      const p = g.prompt;

      if (id === 'C01') {
        // 题面会写出「店员写的结果」（可能对也可能错），但绝不能出现正确值 ——
        // 唯一例外：当原式本来就正确时，店员写的结果**就是**正确值（这是确定答案，不是泄漏）。
        if (!o.isCorrect) {
          assert.ok(!new RegExp(`(^|[^0-9])${o.correctTotal}([^0-9]|$)`).test(p),
            `C01 seed=${seed} 题面直接出现了正确值 ${o.correctTotal}（而原式是错的，属于泄漏）`);
        }
      }
      if (id === 'C02') {
        assert.ok(!new RegExp(`(^|[^0-9])${o.beforeVoid}([^0-9]|$)`).test(p),
          `C02 seed=${seed} 题面出现了 beforeVoid=${o.beforeVoid}`);
        assert.ok(!new RegExp(`(^|[^0-9])${o.finalStock}([^0-9]|$)`).test(p),
          `C02 seed=${seed} 题面出现了 finalStock=${o.finalStock}`);
      }
      if (id === 'C04') {
        // 题面会写出脚本跑出来的错值，但正确小计 / 正确应付不得出现
        assert.ok(!p.includes(String(o.fixedSubtotal)),
          `C04 seed=${seed} 题面出现了正确小计 ${o.fixedSubtotal}`);
        assert.ok(!p.includes(String(o.fixedTotal)),
          `C04 seed=${seed} 题面出现了正确应付 ${o.fixedTotal}`);
        // rootCause 的类别词会以「选项」形式出现，这没问题；但组合形态不得出现
        assert.ok(!p.includes(o.rootCause), `C04 seed=${seed} 题面出现了 rootCause 组合 ${o.rootCause}`);
      }
      if (id === 'C03') {
        // C03 答案以逐笔 (rule, needManual) 形式存在，题面只给原始数据。
        // 不能简单搜「a1 附近出现『修订』」—— 题面开头的规则清单里本来就有「修订」二字，
        // 而且每行都会出现「尚未完成审批」。这里只查真正的「成品答案形态」：
        //   a1 … { rule: 修订, needManual: false }  这类 §键值成对§ 的写法
        for (const [k, v] of Object.entries(o.cases)) {
          const pairPattern = new RegExp(
            `${k}[^\\n]{0,20}(rule|规则)\\s*[:：]\\s*"?${v.rule}"?[^\\n]{0,20}(needManual|人工|审批)\\s*[:：]\\s*"?${v.needManual}`,
            'i',
          );
          assert.ok(!pairPattern.test(p), `C03 seed=${seed} 题面疑似给出了 ${k} 的完整成品答案`);
          // 反向：也不得出现「a1 = 修订」
          const eqPattern = new RegExp(`${k}\\s*[:：=]\\s*"?${v.rule}"?\\s*$`, 'm');
          assert.ok(!eqPattern.test(p), `C03 seed=${seed} 题面疑似用等式给出了 ${k} 的规则`);
        }
      }
    }
  }
});

test('C01–C04：题面示例必须是占位符，不得是可直接照抄的成品答案', () => {
  for (const id of IDS) {
    const p = item(id).generate('demo').prompt;
    assert.ok(p.includes('<'), `${id} 题面的 JSON 示例没有使用尖括号占位符`);
    // 示例区不得出现完整成品答案的 JSON 字面量
    assert.ok(!/"rule"\s*:\s*"(旧|新|修订)"\s*,\s*"needManual"\s*:\s*(true|false)/.test(p),
      `${id} 示例疑似可直接照抄`);
  }
});

/* ==================================================================== *
 * 6. 评分条件文本必须中性
 * ==================================================================== */
test('C01–C04：评分条件文本中性 —— 不含具体数值、不含指破陷阱的措辞', () => {
  const banned = /不得|不要|而非|注意|陷阱|小心|容易错|别忘/;
  for (const id of IDS) {
    const g = item(id).generate('demo');
    assert.equal(g.publicCriteria.length, id === 'C01' ? 2 : 3, `${id} 条件数量不对`);
    for (const c of g.publicCriteria) {
      assert.ok(!banned.test(c.text), `${c.id} 条件文本含指破陷阱的措辞：「${c.text}」`);
      // 不得含具体数值（2 位以上数字；单位「两位小数」这类规则说明不算答案数值）
      const nums = c.text.match(/\d+/g) || [];
      const bigNums = nums.filter((n) => n.length >= 3);
      assert.deepEqual(bigNums, [], `${c.id} 条件文本含具体数值：${bigNums.join(',')} ——「${c.text}」`);
    }
  }
});

test('C01–C04：评分条件分值与契约完全一致', () => {
  const want = {
    C01: { points: 4, difficulty: 'easy', batch: 1, crit: [1, 3] },
    C02: { points: 6, difficulty: 'standard', batch: 2, crit: [2, 2, 2] },
    C03: { points: 6, difficulty: 'standard', batch: 3, crit: [2, 2, 2] },
    C04: { points: 9, difficulty: 'challenge', batch: 4, crit: [3, 3, 3] },
  };
  for (const id of IDS) {
    const it = item(id);
    const w = want[id];
    assert.equal(it.points, w.points, `${id} points`);
    assert.equal(it.difficulty, w.difficulty, `${id} difficulty`);
    assert.equal(it.batch, w.batch, `${id} batch`);
    assert.equal(it.dimension, 'correction', `${id} dimension`);
    const g = it.generate('demo');
    assert.deepEqual(g.publicCriteria.map((c) => c.points), w.crit, `${id} criteria 分值`);
    assert.equal(g.publicCriteria.reduce((s, c) => s + c.points, 0), w.points, `${id} 条件合计 ≠ 满分`);
    assert.equal(g.publicCriteria.length, w.crit.length, `${id} 条件数量`);
    assert.ok(typeof it.oracle === 'function' && typeof it.grade === 'function', `${id} 缺 oracle/grade`);
    assert.ok(typeof g.prompt === 'string' && g.facts && g.schema && g.publicCriteria, `${id} generate 返回结构不完整`);
  }
});

/* ==================================================================== *
 * 7. C02 状态机：逐步断言中间状态
 * ==================================================================== */
test('C02 状态机：撤回前 / 第一次作废后 / 反悔后 / 最终 —— 四态都必须能对上', () => {
  // 独立实现一遍台账重放（不调用 oracle），并在每个关键步骤后取合计
  const replayWithSnapshots = (f) => {
    let main = f.initMain;
    let aux = f.initAux;
    const snap = {};
    for (const e of f.ledger) {
      if (e.op === '入库') main += e.qty;
      else if (e.op === '出库') { if (e.wh === f.auxName) aux -= e.qty; else main -= e.qty; }
      else if (e.op === '盘亏') main -= e.qty;
      else if (e.op === '盘盈') main += e.qty;
      else if (e.op === '调拨') { main -= e.qty; aux += e.qty; }
      else if (e.op === '作废') { if (e.no === 6) main -= e.qty; else main += e.qty; }
      else if (e.op === '反悔') main += e.qty;
      snap[`after${e.no}`] = { main, aux, total: main + aux };
    }
    return snap;
  };

  for (const seed of SEEDS20) {
    const f = item('C02').generate(seed).facts;
    const snap = replayWithSnapshots(f);

    // (a) 第 5 步后 = 第一次作废之前
    assert.equal(snap.after5.total, f.beforeVoid, `seed=${seed} 第5步后合计 ≠ beforeVoid`);

    // (b) 第 6 步作废第 5 步入库 → 合计应减少 s5
    assert.equal(snap.after6.total, snap.after5.total - f.s5,
      `seed=${seed} 作废第5步后合计应减少 ${f.s5}`);

    // (c) 第 7 步反悔 → 合计应回到第 5 步后的水平（撤回的撤回 = 那一笔重新生效）
    assert.equal(snap.after7.total, snap.after5.total,
      `seed=${seed} 「撤回的撤回」没有把库存还原回 ${snap.after5.total}`);

    // (d) 第 4 步调拨不得改变合计（这是本题最容易错的地方）
    const beforeTransfer = replayWithSnapshots(f);
    // 手算第 3 步后的合计
    const t3 = f.initMain + f.initAux + f.s1 - f.s2 - f.s3;
    assert.equal(t3, (() => {
      // 用快照交叉验证
      let m = f.initMain, a = f.initAux;
      m += f.s1; m -= f.s2; m -= f.s3;
      return m + a;
    })(), `seed=${seed} 第3步合计自相矛盾`);
    assert.equal(beforeTransfer.after4.total, t3,
      `seed=${seed} 调拨改变了合计（应保持不变）`);

    // (e) 第 9 步作废第 2 步出库 → 合计增加 s2
    assert.equal(snap.after9.total, snap.after8.total + f.s2,
      `seed=${seed} 作废第2步出库后合计应增加 ${f.s2}`);

    // (f) 最终值
    assert.equal(snap.after10.total, f.finalStock, `seed=${seed} 第10步后合计 ≠ finalStock`);

    // (g) 判分必须采信这些中间态：最终值答错 → C2、C3 都不给（C2 以正确起点为前提且要求终点正确），
    //     只剩 C1 的 2 分。这是有意的：追踪错一步就不该拿「变化量」这分。
    const r = grade('C02', seed, { beforeVoid: f.beforeVoid, finalStock: f.finalStock + 1 });
    assert.equal(r.awarded, 2, `seed=${seed} 最终值错应得 2/6，实际 ${r.awarded}/6`);
    assert.equal(r.checks.find((c) => c.criterionId === 'C02.C1').passed, true);
    assert.equal(r.checks.find((c) => c.criterionId === 'C02.C3').passed, false);
  }
});

test('C02：把调拨当成「主仓减、分仓也减」的典型错误必须扣分', () => {
  for (const seed of SEEDS20) {
    const f = item('C02').generate(seed).facts;
    // 典型错误：调拨时把合计也减了一次
    const wrongFinal = f.finalStock - f.t1;
    const r = grade('C02', seed, { beforeVoid: f.beforeVoid, finalStock: wrongFinal });
    assert.ok(r.awarded < 6, `seed=${seed} 误把调拨当减少仍拿 ${r.awarded}/6`);
    assert.equal(r.checks.find((c) => c.criterionId === 'C02.C1').passed, true, '起点应仍然算对');
    assert.equal(r.checks.find((c) => c.criterionId === 'C02.C3').passed, false);
    // 因为终点错了，变化量这分（C2）也不该给
    assert.equal(r.checks.find((c) => c.criterionId === 'C02.C2').passed, false);
  }
});

test('C02：「忘了反悔」的典型错误必须扣分', () => {
  for (const seed of SEEDS20) {
    const f = item('C02').generate(seed).facts;
    // 忘了第 7 步反悔 = 少加回一次 s5
    const wrongFinal = f.finalStock - f.s5;
    const r = grade('C02', seed, { beforeVoid: f.beforeVoid, finalStock: wrongFinal });
    assert.ok(r.awarded < 6, `seed=${seed} 漏掉「撤回的撤回」仍拿 ${r.awarded}/6`);
    assert.equal(r.checks.find((c) => c.criterionId === 'C02.C3').passed, false);
  }
});

test('C02：两个都错但差值对的答案不得骗到 C2（历史 BUG-20 不得复发）', () => {
  for (const seed of SEEDS20) {
    const f = item('C02').generate(seed).facts;
    const expectedDelta = f.finalStock - f.beforeVoid;
    const shiftedBefore = f.beforeVoid - 77;
    const r = grade('C02', seed, { beforeVoid: shiftedBefore, finalStock: shiftedBefore + expectedDelta });
    assert.equal(r.checks.find((c) => c.criterionId === 'C02.C2').passed, false,
      `seed=${seed} 「差值对但起点错」的答案骗到了 C2`);
  }
});

/* ==================================================================== *
 * 8. C04 双 bug：只修一个必须 < 9
 * ==================================================================== */
test('C04 双 bug：只修第一个 bug 时总分必须 < 9', () => {
  for (const seed of SEEDS20) {
    const f = item('C04').generate(seed).facts;
    const o = item('C04').oracle(f);
    // 只修 bug1：小计对了，但应付仍是「收尾 bug 还在」的结果
    const r1 = grade('C04', seed, {
      rootCause: f.bug1,
      fixedSubtotal: o.fixedSubtotal,
      fixedTotal: f.onlyBug1FixedTotal,
    });
    assert.ok(r1.awarded < 9, `seed=${seed} 只修第一个 bug 就拿了 ${r1.awarded}/9（= 第二个 bug 白送）`);
    // 必然丢掉 C3（应付值仍是错的）
    assert.equal(r1.checks.find((c) => c.criterionId === 'C04.C3').passed, false,
      `seed=${seed} 只修一个 bug 却通过了 C3`);
  }
});

test('C04 双 bug：只修第二个 bug 时总分也必须 < 9', () => {
  for (const seed of SEEDS20) {
    const f = item('C04').generate(seed).facts;
    const o = item('C04').oracle(f);
    const r2 = grade('C04', seed, {
      rootCause: f.bug2,
      fixedSubtotal: o.fixedSubtotal,
      fixedTotal: f.onlyBug2FixedTotal,
    });
    assert.ok(r2.awarded < 9, `seed=${seed} 只修第二个 bug 就拿了 ${r2.awarded}/9`);
  }
});

test('C04：只报一个 bug 类别拿不到 C1；两处都报才拿', () => {
  for (const seed of SEEDS20) {
    const f = item('C04').generate(seed).facts;
    const o = item('C04').oracle(f);
    const base = { fixedSubtotal: o.fixedSubtotal, fixedTotal: o.fixedTotal };

    // 只报 bug1
    const only1 = grade('C04', seed, { ...base, rootCause: f.bug1 });
    assert.equal(only1.checks.find((c) => c.criterionId === 'C04.C1').passed, false,
      `seed=${seed} 只报一个 bug 却通过了 C1`);

    // 只报 bug2
    const only2 = grade('C04', seed, { ...base, rootCause: f.bug2 });
    assert.equal(only2.checks.find((c) => c.criterionId === 'C04.C1').passed, false,
      `seed=${seed} 只报第二个 bug 却通过了 C1`);

    // 两处都报（用 + 连接）
    const both = grade('C04', seed, { ...base, rootCause: f.rootCause });
    assert.equal(both.awarded, 9, `seed=${seed} 两处都报却只得 ${both.awarded}/9`);
  }
});

test('C04：rootCause 不得是常量（四种组合都要出现，且每 seed 唯一）', () => {
  const seen = new Map();
  for (let i = 0; i < 300; i++) {
    const f = item('C04').generate(`variety-${i}`).facts;
    seen.set(f.rootCause, (seen.get(f.rootCause) || 0) + 1);
  }
  // 至少出现 4 种组合（数量/单价 × 四舍五入/折扣漏乘）
  assert.ok(seen.size >= 4, `rootCause 只有 ${seen.size} 种取值：${[...seen.keys()]}`);
  for (const [k, n] of seen) {
    assert.ok(n >= 15, `rootCause「${k}」只出现 ${n}/300 次，分布过偏`);
  }
});

test('C04：两个 bug 在每道题里都确实互相掩盖（结构性质，不是概率）', () => {
  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  for (let i = 0; i < 400; i++) {
    const seed = `mask-${i}`;
    const f = item('C04').generate(seed).facts;
    // 手工算正确答案（不复用 oracle）
    const cents = Math.round(f.price * 100);
    const exactSubtotal = cents * f.qtyOk / 100;
    assert.ok(!Number.isInteger(exactSubtotal),
      `${seed} 小计恰好是整数，四舍五入 bug 会失效`);
    const correctTotal = r2(exactSubtotal * f.rate);
    assert.notEqual(f.onlyBug1FixedTotal, correctTotal,
      `${seed} 只修 bug1 就得到正确答案（两个 bug 没有互相掩盖）`);
    assert.notEqual(f.onlyBug2FixedTotal, correctTotal,
      `${seed} 只修 bug2 就得到正确答案（两个 bug 没有互相掩盖）`);
    // 两个 bug 的单价/数量形态必须一致（不能靠「整数 vs 小数」一眼看出）
    assert.equal(Number.isInteger(f.price), Number.isInteger(f.priceBug),
      `${seed} 正确单价与脚本单价的整数/小数形态不同，等于泄漏 bug1`);
  }
});

test('C04：脚本报出的错值与题面一致（题面没有自相矛盾）', () => {
  for (const seed of SEEDS20) {
    const f = item('C04').generate(seed).facts;
    const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
    // 按题面脚本逻辑重算一遍，必须等于题面里写的 total
    const rawSub = f.priceBug * f.qtyBug;
    const sub = f.subtotalRoundDigits === 0 ? Math.round(rawSub) : r2(rawSub);
    const total = r2(sub * f.scriptRate);
    assert.ok(Math.abs(total - f.buggyTotal) < 1e-9,
      `seed=${seed} 题面 total=${f.buggyTotal}，按脚本重算=${total}`);
    const prompt = item('C04').generate(seed).prompt;
    assert.ok(prompt.includes(f.buggyTotal.toFixed(2)), `seed=${seed} 题面没写出脚本结果的两位小数形态`);
  }
});

/* ==================================================================== *
 * 9. C03 追溯条款与过渡期例外
 * ==================================================================== */
test('C03 追溯条款：被追溯的申请按修订规则判，未被追溯的按原规则判', () => {
  for (const seed of SEEDS20) {
    const f = item('C03').generate(seed).facts;
    const o = item('C03').oracle(f);

    // 每个 seed 都必须同时存在「被追溯」和「走过渡期例外」的申请，否则这一维考不出来
    assert.ok(f.retroIds.length >= 1, `seed=${seed} 没有被追溯的申请`);
    assert.ok(f.graceIds.length >= 1, `seed=${seed} 没有过渡期例外的申请`);

    // 被追溯的（新规期 + 未审批，且不在 3/18–19）→ 必须判为「修订」
    for (const id of f.retroIds) {
      assert.equal(o.cases[id].rule, '修订', `seed=${seed} ${id} 被追溯却不是修订规则`);
    }
    // 过渡期例外的（3/18–19 提交，即使未审批）→ 必须判为「新」，不得追溯
    for (const id of f.graceIds) {
      assert.equal(o.cases[id].rule, '新', `seed=${seed} ${id} 走了过渡期却仍被追溯成修订`);
    }
    // 旧规期的 → 必须判为「旧」
    for (const id of f.oldIds) {
      assert.equal(o.cases[id].rule, '旧', `seed=${seed} ${id} 旧规期却不是旧规则`);
    }
    // 新规期且已审批的 → 不追溯，判「新」
    for (const id of f.newDoneIds) {
      assert.equal(o.cases[id].rule, '新', `seed=${seed} ${id} 已审批却被追溯`);
    }
  }
});

test('C03 追溯条款：把过渡期例外的申请误判成「修订」必须掉分', () => {
  for (const seed of SEEDS20) {
    const f = item('C03').generate(seed).facts;
    const o = item('C03').oracle(f);
    // 正确答案
    const good = { ...Object.fromEntries(Object.entries(o.cases).map(([k, v]) => [k, { ...v }])) };
    assert.equal(grade('C03', seed, good).awarded, 6, `seed=${seed} 正确答案不满分`);

    // 把过渡期例外的那些笔改成「修订」（= 错误地套用了追溯条款）
    const bad = { ...good };
    for (const id of f.graceIds) bad[id] = { rule: '修订', needManual: o.cases[id].needManual };
    const r = grade('C03', seed, bad);
    assert.ok(r.awarded < 6, `seed=${seed} 误用追溯条款仍拿 ${r.awarded}/6`);
    assert.equal(r.checks.find((c) => c.criterionId === 'C03.C3').passed, false,
      `seed=${seed} 误用追溯条款却通过了 C3`);
  }
});

test('C03 过渡期例外：把被追溯的申请误判成「新」必须掉分', () => {
  for (const seed of SEEDS20) {
    const f = item('C03').generate(seed).facts;
    const o = item('C03').oracle(f);
    const good = Object.fromEntries(Object.entries(o.cases).map(([k, v]) => [k, { ...v }]));
    const bad = { ...good };
    for (const id of f.retroIds) bad[id] = { rule: '新', needManual: o.cases[id].needManual };
    const r = grade('C03', seed, bad);
    assert.ok(r.awarded < 6, `seed=${seed} 漏掉追溯条款仍拿 ${r.awarded}/6`);
    assert.equal(r.checks.find((c) => c.criterionId === 'C03.C3').passed, false);
  }
});

test('C03：needManual 必须按「最终适用那一版」的门槛判，不是按旧门槛', () => {
  let tested = 0;
  for (const seed of SEEDS20) {
    const f = item('C03').generate(seed).facts;
    const o = item('C03').oracle(f);
    for (const [id, c] of Object.entries(o.cases)) {
      const app = f.apps[id];
      const lim = c.rule === '旧' ? f.limitOld : c.rule === '新' ? f.limitNew : f.limitRev;
      assert.equal(c.needManual, app.amount > lim, `seed=${seed} ${id} needManual 与门槛不符`);
      // 若三版门槛不同，则「用错门槛」的判定会不同 —— 至少要有这类样本
      const otherLim = c.rule === '旧' ? f.limitNew : f.limitOld;
      if ((app.amount > lim) !== (app.amount > otherLim)) tested++;
    }
  }
  assert.ok(tested >= 20, `只有 ${tested} 笔「用错门槛就会判错」的样本，考点太弱`);
});

test('C03：八笔申请必须全部校验（少给一笔不得满分）', () => {
  for (const seed of ['hard-0', 'hard-1', 'demo']) {
    const f = item('C03').generate(seed).facts;
    const o = item('C03').oracle(f);
    const full = Object.fromEntries(Object.entries(o.cases).map(([k, v]) => [k, { ...v }]));
    // 缺最后一笔
    const partial = { ...full };
    delete partial.a8;
    const r = grade('C03', seed, partial);
    assert.ok(r.awarded < 6, `seed=${seed} 少给一笔仍拿 ${r.awarded}/6`);
  }
});

/* ==================================================================== *
 * 10. C01 错误类别必须真的能区分
 * ==================================================================== */
test('C01：四种错误类别都出现，且「由错值反推类别」必须唯一', () => {
  const kinds = new Map();
  let correctStatements = 0;
  let ambiguous = 0;
  for (let i = 0; i < 1200; i++) {
    const f = item('C01').generate(`c01-kind-${i}`).facts;
    kinds.set(f.errorKind, (kinds.get(f.errorKind) || 0) + 1);
    if (f.statementIsCorrect) { correctStatements++; continue; }

    // 复算三种错法
    let acc = f.p * f.q; acc -= f.r; acc += f.s; acc *= f.t; acc += f.u;
    if (f.useEight) { acc -= f.v; acc += f.w; }
    const candidates = [['运算优先级', acc], ['符号', f.correct + 2 * f.r], ['进位', f.correct - 10]];
    // 题面给出的错值必须**只**匹配一种错法，否则「哪一类错误」就没有唯一解
    const matches = candidates.filter(([, v]) => v === f.wrong);
    if (matches.length !== 1) ambiguous++;
    assert.equal(matches.length, 1,
      `seed c01-kind-${i} 错值 ${f.wrong} 同时匹配 ${matches.map((m) => m[0]).join('/')}，类别不唯一`);
    assert.equal(matches[0][0], f.errorKind, `seed c01-kind-${i} 声明类别 ${f.errorKind} 与错值推断 ${matches[0][0]} 不符`);
  }
  assert.equal(ambiguous, 0, `有 ${ambiguous} 个 seed 的错误类别不唯一`);
  for (const k of ['运算优先级', '符号', '进位', '无']) {
    assert.ok(kinds.get(k) >= 5, `错误类别「${k}」只出现 ${kinds.get(k) || 0} 次，覆盖不足`);
  }
  assert.ok(correctStatements >= 100, `「结果本来就对」的样本只有 ${correctStatements}/1200，太少`);
});

test('C01：错误类别填错必须扣掉那 1 分（说明真的在考成因）', () => {
  for (const seed of SEEDS20) {
    const f = item('C01').generate(seed).facts;
    const o = item('C01').oracle(f);
    if (o.errorKind === '无') continue;
    const other = ['运算优先级', '符号', '进位'].find((k) => k !== o.errorKind);
    const r = grade('C01', seed, { isCorrect: false, errorKind: other, correctTotal: o.correctTotal });
    assert.equal(r.awarded, 3, `seed=${seed} 类别填错仍拿 ${r.awarded}/4`);
    assert.equal(r.checks.find((c) => c.criterionId === 'C01.C1').passed, false);
  }
});

test('C01：结果本来就对时，不能靠瞎填一个错误类别蒙混', () => {
  let tested = 0;
  for (let i = 0; i < 200 && tested < 5; i++) {
    const seed = `c01-right-${i}`;
    const f = item('C01').generate(seed).facts;
    if (!f.statementIsCorrect) continue;
    tested++;
    // 正确结果 + 正确类别「无」
    assert.equal(grade('C01', seed, { isCorrect: true, errorKind: '无', correctTotal: f.correct }).awarded, 4);
    // 结果判对，但硬说有个错误类别 → C1 不给
    const r = grade('C01', seed, { isCorrect: true, errorKind: '进位', correctTotal: f.correct });
    assert.equal(r.awarded, 3, `seed=${seed} 结果对却谎报错误类别仍拿 ${r.awarded}/4`);
  }
  assert.ok(tested >= 3, `只找到 ${tested} 个「原式正确」的 seed`);
});

test('C01：答案必须是 6~8 项的四则运算式（不是三个数相加）', () => {
  for (const seed of SEEDS20) {
    const f = item('C01').generate(seed).facts;
    assert.ok(f.operandCount >= 6 && f.operandCount <= 8, `seed=${seed} 运算项数 ${f.operandCount} 不在 6~8`);
    // 式子必须同时含乘号与减号，否则考不出优先级与符号
    assert.ok(f.expr.includes('×'), `seed=${seed} 式子缺少乘法`);
    assert.ok(f.expr.includes('-'), `seed=${seed} 式子缺少减法`);
  }
});

/* ==================================================================== *
 * 11. 跨题：不得靠固定值 / 单一路由拿分
 * ==================================================================== */
test('C01–C04：不读题只填固定值，满分率必须极低', () => {
  const fixedAnswers = {
    C01: { isCorrect: false, errorKind: '进位', correctTotal: 100 },
    C02: { beforeVoid: 500, finalStock: 500 },
    C03: Object.fromEntries(
      ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'].map((k) => [k, { rule: '新', needManual: false }]),
    ),
    C04: { rootCause: '数量用错+四舍五入', fixedSubtotal: 200, fixedTotal: 160 },
  };
  const N = 200;
  for (const id of IDS) {
    let full = 0;
    let totalScore = 0;
    for (let i = 0; i < N; i++) {
      const r = grade(id, `fixed-${i}`, fixedAnswers[id]);
      totalScore += r.awarded;
      if (r.awarded === item(id).points) full++;
    }
    const avg = totalScore / N;
    assert.ok(full / N <= 0.02, `${id} 固定答案满分率 ${(full / N * 100).toFixed(1)}%，说明答案可背`);
    assert.ok(avg <= item(id).points * 0.45,
      `${id} 固定答案平均得分 ${avg.toFixed(2)}/${item(id).points}，占比过高（说明不读题也能拿分）`);
  }
});

test('C01–C04：题面长度足以承载推理链（不是一句话算术题）', () => {
  // 平均题面 347 字、推理链 1~2 步 —— 这是用户质疑「轻松满分」的诊断结论。
  // 本用例把这条结论钉住：改回去就会被这条测试拦下。
  for (const id of IDS) {
    const lens = SEEDS20.map((s) => item(id).generate(s).prompt.length);
    const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
    assert.ok(avg >= 300, `${id} 平均题面长度 ${avg.toFixed(0)} 字，低于 300（推理链可能又退化了）`);
  }
  // C02（十步台账，10 条台账记录）与 C03（八笔三版）必须显著更长
  const avgOf = (id) => SEEDS20.map((s) => item(id).generate(s).prompt.length)
    .reduce((a, b) => a + b, 0) / SEEDS20.length;
  assert.ok(avgOf('C02') >= 450, `C02 平均 ${avgOf('C02').toFixed(0)} 字，十步台账应更长`);
  assert.ok(avgOf('C03') >= 700, `C03 平均 ${avgOf('C03').toFixed(0)} 字，八笔三版应更长`);
});

/* ==================================================================== *
 * 12. 反向断言：把标准答案翻转，必须掉分
 * ==================================================================== */
test('C01–C04：翻转正确答案的任一关键字段，分数都必须下降', () => {
  for (const id of IDS) {
    for (const seed of ['hard-0', 'hard-1', 'hard-2']) {
      const f = item(id).generate(seed).facts;
      const good = item(id).oracle(f);
      const rGood = grade(id, seed, good);
      assert.equal(rGood.awarded, item(id).points, `${id} seed=${seed} 好答案应满分`);

      // 按题型构造「结构合法但某字段错」的变体
      let bad;
      if (id === 'C01') bad = { ...good, correctTotal: good.correctTotal + 1 };
      else if (id === 'C02') bad = { ...good, finalStock: good.finalStock + 1 };
      else if (id === 'C03') {
        // oracle 返回 { cases: { a1..a8 } }，判分器期望的答案本身就是 cases 的扁平形态
        bad = JSON.parse(JSON.stringify(good.cases));
        bad.a1.rule = bad.a1.rule === '修订' ? '新' : '修订';
      } else bad = { ...good, fixedTotal: good.fixedTotal + 1 };

      const rBad = grade(id, seed, bad);
      assert.ok(rBad.awarded < rGood.awarded,
        `${id} seed=${seed} 翻转后分数没下降（${rGood.awarded} → ${rBad.awarded}）—— 判分可能是自证`);
    }
  }
});
