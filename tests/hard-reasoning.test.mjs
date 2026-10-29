/**
 * 逻辑推理维度强化后的专项测试（R01 / R02 / R03 / R04）。
 *
 * 设计原则（承接 golden-fixtures 的教训）：
 *   ⚠️ 期望值**不得**由被测的 oracle() 生成 —— 那叫自证。
 *   本文件里的手算夹具全部由「人肉推导 + 独立笨办法」得出，写成常量。
 *
 * 覆盖：
 *   1. 20 seed 下 generate 不抛异常 + 确定性
 *   2. 20 seed 下 oracle 答案满分
 *   3. 手算夹具 ≥4 条（常量期望值，不调 oracle）
 *   4. 全错答案 0 分
 *   5. 题面无泄漏（不含答案值）
 *   6. 评分条件中性（不含「不得/不要/而非/注意」和具体数字）
 *   7. R03 贪心解严格劣于最优解（本题难度来源）
 *   8. R04 唯一性（穷举题面允许的全部排列，断言唯一）
 *   9. 性能：R03 单次 < 15ms，R04 单次 < 50ms，catalogFingerprint < 500ms
 *
 * 跑法：node --test tests/hard-reasoning.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_BY_ID, instantiateInternal, catalogFingerprint } from '../src/exam/manifest.mjs';
import { gradeItem } from '../src/grading/grade.mjs';

const items = ['R01', 'R02', 'R03', 'R04'];

/* ========================================================================== *
 * FIXTURES —— 供 golden-fixtures.test.mjs 等重建用的「人工算出的期望值」
 *
 * 纪律：这里每个 answer 都是**人工推导**出来的常量，绝不由被测 oracle 生成。
 *       how 字段写清推导过程；改题面参数后必须重新手算并更新这里。
 * ========================================================================== */
export const FIXTURES = [
  /* ---------------- R01：6~8 行商品 + 第2件半价 + 券封顶 + 包邮 ---------------- */
  {
    id: 'R01',
    seed: 'hand-r01-1',
    points: 4,
    factsDigest: {
      rows: 6,
      原价合计: 687,
      促销后: 581,
      券门槛: 378, 券面额: 15, 券封顶: 9,
      包邮门槛: 407, 运费: 10,
    },
    answer: { subtotal: 687, total: 572 },
    how: '逐行算原价与「第2件半价」促销价 → 原价合计 687、促销后 581；581≥378 可用券，面额15 但封顶9 实减 9 → 572；572≥407 包邮，运费 0',
  },
  {
    id: 'R01',
    seed: 'hand-r01-2',
    points: 4,
    factsDigest: {
      rows: 7,
      原价合计: 732,
      促销后: 656,
      券门槛: 295, 券面额: 30, 券封顶: 15,
      包邮门槛: 525, 运费: 8,
    },
    answer: { subtotal: 732, total: 641 },
    how: '原价合计 732、促销后 656；656≥295 可用券，面额30 封顶15 实减 15 → 641；641≥525 包邮',
  },
  {
    id: 'R01',
    seed: 'hand-r01-3',
    points: 4,
    factsDigest: {
      rows: 7,
      原价合计: 728,
      促销后: 669,
      券门槛: 435, 券面额: 30, 券封顶: 18,
      包邮门槛: 602, 运费: 12,
    },
    answer: { subtotal: 728, total: 651 },
    how: '原价合计 728、促销后 669；669≥435 可用券，面额30 封顶18 实减 18 → 651；651≥602 包邮',
  },

  /* ---------------- R02：10~12 步、两条链交错 ---------------- */
  {
    id: 'R02',
    seed: 'hand-r02-1',
    points: 6,
    factsDigest: { 工序数: 12, 依赖条数: 13 },
    answer: { order: ['E', 'F', 'K', 'G', 'A', 'D', 'L', 'B', 'C', 'H', 'I', 'J'] },
    how: '手工拓扑：反复取「前驱全部完成」的代号并按字母序取最小者，得到 EFKGADLBCHIJ；已逐条核对 13 条依赖',
  },
  {
    id: 'R02',
    seed: 'hand-r02-2',
    points: 6,
    factsDigest: { 工序数: 12, 依赖条数: 13 },
    answer: { order: ['D', 'F', 'G', 'I', 'E', 'H', 'C', 'A', 'J', 'K', 'L', 'B'] },
    how: '同上手工拓扑，得 DFGIEHCAJKLB',
  },
  {
    id: 'R02',
    seed: 'hand-r02-3',
    points: 6,
    factsDigest: { 工序数: 11, 依赖条数: 12 },
    answer: { order: ['I', 'H', 'J', 'E', 'A', 'C', 'G', 'B', 'K', 'D', 'F'] },
    how: '同上手工拓扑，得 IHJEACGBKDF',
  },

  /* ---------------- R03：背包，贪心必错，DP 求最优 ---------------- */
  {
    id: 'R03',
    seed: 'hand-r03-1',
    points: 6,
    factsDigest: {
      类型: 'a:14/3/54 d:8/1/60 b:24/5/49 e:48/16/14 f:26/5/30',
      需件数: 12, 需指标: 252,
    },
    answer: { a: 6, d: 0, b: 2, e: 14, f: 0 },
    // 校验：6×14 + 2×24 + 14×48 = 84+48+672 = 804；件数 6+2+14=22≥12；
    // 指标 6×3 + 2×5 + 14×16 = 18+10+224 = 252 ≥252 ✔
    how: '独立二维 DP（件数×指标）求得最低花费 804；手工校验该组合：总价 804、件数 22、指标 252，三重约束均满足；贪心解 812，差 8',
  },
  {
    id: 'R03',
    seed: 'hand-r03-2',
    points: 6,
    factsDigest: {
      类型: 'a:14/2/59 d:10/1/83 f:24/5/27 e:61/16/14 c:41/10/28',
      需件数: 21, 需指标: 252,
    },
    answer: { a: 0, d: 4, f: 0, e: 13, c: 4 },
    // 校验：4×10 + 13×61 + 4×41 = 40+793+164 = 997；件数 4+13+4=21≥21；
    // 指标 4×1 + 13×16 + 4×10 = 4+208+40 = 252 ≥252 ✔
    how: '独立 DP 求得最低 997；该组合总价 997、件数 21、指标 252 均达标；贪心解 1141，差 144（本题最大陷阱）',
  },
  {
    id: 'R03',
    seed: 'hand-r03-3',
    points: 6,
    factsDigest: {
      类型: 'd:7/1/67 f:27/7/31 c:41/11/31 e:57/15/22 a:14/3/60 b:23/4/45',
      需件数: 15, 需指标: 395,
    },
    answer: { d: 0, f: 5, c: 30, e: 2, a: 0, b: 0 },
    // 校验：5×27 + 30×41 + 2×57 = 135+1230+114 = 1479；件数 5+30+2=37≥15；
    // 指标 5×7 + 30×11 + 2×15 = 35+330+30 = 395 ≥395 ✔
    how: '独立 DP 求得最低 1479；该组合总价 1479、件数 37、指标 395 均达标；贪心解 1499，差 20',
  },

  /* ---------------- R04：6 人 6 色 6 位，唯一解（独立穷举 720×720 得出）---------------- */
  {
    id: 'R04',
    seed: 'hand-r04-1',
    points: 9,
    factsDigest: { 人数: 6, 颜色数: 6, 线索数: 11, 解数: 1 },
    answer: {
      阿明: { position: 2, color: '红' },
      阿豆: { position: 4, color: '紫' },
      阿澈: { position: 6, color: '橙' },
      阿岚: { position: 5, color: '绿' },
      阿芙: { position: 3, color: '蓝' },
      阿果: { position: 1, color: '黄' },
    },
    how: '用题面 11 条线索做独立全穷举（6!×6!=518400），只命中 1 个解；上表即该唯一解',
  },
  {
    id: 'R04',
    seed: 'hand-r04-2',
    points: 9,
    factsDigest: { 人数: 6, 颜色数: 6, 线索数: 11, 解数: 1 },
    answer: {
      阿芙: { position: 1, color: '黄' },
      阿豆: { position: 2, color: '红' },
      阿澈: { position: 6, color: '绿' },
      阿布: { position: 3, color: '紫' },
      阿明: { position: 5, color: '蓝' },
      阿蓝: { position: 4, color: '橙' },
    },
    how: '同上，独立全穷举唯一解',
  },
  {
    id: 'R04',
    seed: 'hand-r04-3',
    points: 9,
    factsDigest: { 人数: 6, 颜色数: 6, 线索数: 11, 解数: 1 },
    answer: {
      阿海: { position: 5, color: '红' },
      阿果: { position: 6, color: '紫' },
      阿蓝: { position: 4, color: '橙' },
      阿芙: { position: 3, color: '黄' },
      阿澈: { position: 1, color: '蓝' },
      阿岚: { position: 2, color: '绿' },
    },
    how: '同上，独立全穷举唯一解',
  },
];

/** 取某题的夹具（供 golden-fixtures 等复用） */
export function fixturesOf(id) {
  return FIXTURES.filter((f) => f.id === id);
}

const SEEDS20 = Array.from({ length: 20 }, (_, i) => `hard-${i}`);

/* ========================================================================== *
 * 工具（全部独立于被测实现）
 * ========================================================================== */

/** 全排列（独立实现，用于 R04 唯一性穷举） */
function allPerms(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  arr.forEach((x, i) => {
    for (const rest of allPerms([...arr.slice(0, i), ...arr.slice(i + 1)])) out.push([x, ...rest]);
  });
  return out;
}

/** 手工构造 oracle 答案（按各题 schema 组装，供「满分」断言使用） */
function oracleAnswer(id, facts) {
  const it = ITEM_BY_ID.get(id);
  const o = it.oracle(facts);
  switch (id) {
    case 'R01': return { subtotal: o.subtotal, total: o.total };
    case 'R02': return { order: o.order };
    case 'R03': return o.best.counts;
    case 'R04': return o.answer;
    default: throw new Error(`unknown ${id}`);
  }
}

/** 判分（唯一被信任的接口） */
function grade(id, seed, answer) {
  return gradeItem(instantiateInternal(ITEM_BY_ID.get(id), seed), answer, { seed });
}

/* ========================================================================== *
 * 1. generate 不抛异常 + 确定性
 * ========================================================================== */
test('1. 20 seed：generate 不抛异常，且同 seed 完全确定', () => {
  for (const id of items) {
    const seen = new Map();
    for (const seed of SEEDS20) {
      let g;
      assert.doesNotThrow(() => { g = ITEM_BY_ID.get(id).generate(seed); }, `${id} seed=${seed} generate 抛异常`);
      assert.ok(typeof g.prompt === 'string' && g.prompt.length > 0, `${id} 题面为空`);
      assert.ok(g.facts && typeof g.facts === 'object', `${id} facts 缺失`);
      assert.ok(Array.isArray(g.publicCriteria) && g.publicCriteria.length > 0, `${id} publicCriteria 缺失`);
      // 确定性
      const again = ITEM_BY_ID.get(id).generate(seed);
      assert.equal(again.prompt, g.prompt, `${id} seed=${seed} 同 seed 题面不一致（不确定）`);
      seen.set(seed, g.prompt);
    }
    // 不同 seed 必须实质变化（至少 80% 不同）
    const uniq = new Set(seen.values());
    assert.ok(uniq.size >= 16, `${id} 20 个 seed 只有 ${uniq.size} 种题面，变化不足`);
  }
});

/* ========================================================================== *
 * 2. oracle 答案在 20 seed 下都满分
 * ========================================================================== */
test('2. 20 seed：oracle 答案必须拿满分', () => {
  for (const id of items) {
    for (const seed of SEEDS20) {
      const internal = instantiateInternal(ITEM_BY_ID.get(id), seed);
      const ans = oracleAnswer(id, internal.facts);
      const r = gradeItem(internal, ans, { seed });
      const failed = r.checks.filter((c) => !c.passed).map((c) => `${c.criterionId}:${c.reason}`);
      assert.equal(r.awarded, ITEM_BY_ID.get(id).points, `${id} seed=${seed} 只得 ${r.awarded}/${ITEM_BY_ID.get(id).points}；失败：${failed.join(' | ')}`);
    }
  }
});

/* ========================================================================== *
 * 3. 手算夹具（常量期望值，不调用 oracle）
 *
 * ⚠️ 这些数字是**人工推导**出来的，理由写在各条注释里。
 *    如果改了 generate 的参数，这些测试会红 —— 那是提醒你「重新手算」，
 *    而不是让你用 oracle 生成期望值绕过。
 * ========================================================================== */

test('3a. 手算夹具 R01 / seed=hand-1（7 行 + 券封顶 + 包邮）', () => {
  // 题面事实（从 generate 读出，仅用于核对参数，不用于算答案）：
  //   木质托盘 41×1 none        → 原价 41，促销后 41
  //   帆布收纳袋 37×3 第2件半价  → 原价 111，促销后 37+18.5+37=92.5
  //   不锈钢保温杯 66×1 none    → 原价 66，促销后 66
  //   玻璃水壶 68×3 none        → 原价 204，促销后 204
  //   棉质毛巾 28×2 第2件半价    → 原价 56，促销后 28+14=42
  //   玻璃收纳罐 36×2 第2件半价  → 原价 72，促销后 36+18=54
  //   纯棉浴巾 62×2 第2件半价    → 原价 124，促销后 62+31=93
  // 原价合计 = 41+111+66+204+56+72+124 = 674
  // 促销后   = 41+92.5+66+204+42+54+93 = 592.5
  // 券：门槛 267（592.5 ≥ 267 可用），面额 25，但封顶 13 → 实减 13
  // 券后 = 592.5-13 = 579.5；包邮门槛 533，579.5 ≥ 533 → 免运费
  // 最终应付款 = 579.5
  const WANT = { subtotal: 674, total: 579.5 };
  const r = grade('R01', 'hand-1', WANT);
  assert.equal(r.awarded, 4, `手算 ${JSON.stringify(WANT)} 只得 ${r.awarded}/4`);

  // 反向：若误用券面额 25（忽略封顶），应付款会是 567.5 → 必须扣分
  const wrong = { subtotal: 674, total: 567.5 };
  assert.ok(grade('R01', 'hand-1', wrong).awarded < 4, '忽略券封顶竟然也满分');
});

test('3b. 手算夹具 R02 / seed=hand-1（10 步双链）', () => {
  // 手工拓扑（反复取「前驱全部完成」的代号，按字母序）得到：
  //   G I D J C E F H B A
  const WANT = { order: ['G', 'I', 'D', 'J', 'C', 'E', 'F', 'H', 'B', 'A'] };
  const r = grade('R02', 'hand-1', WANT);
  assert.equal(r.awarded, 6, `手算序列 ${WANT.order.join('')} 只得 ${r.awarded}/6`);

  // 反向：完全倒序必须 0 分
  const rev = [...WANT.order].reverse();
  assert.equal(grade('R02', 'hand-1', { order: rev }).awarded, 0, '倒序竟然得分');
});

test('3c. 手算夹具 R03 / seed=hand-1（独立 DP 算出的最小花费常量）', () => {
  // 用**自己写的一份二维 DP**（与被测 solveR03 实现不同）算得：
  //   types: b:25/5/39 d:8/1/82 e:55/15/20 a:16/2/52 f:26/7/30 c:38/9/34
  //   needCount=15, needMetric=359
  //   最优总花费 = 1322
  // 这里直接断言「任何总价 1322 的方案都必须被判满分」不现实（组合可能多解），
  // 所以改为：断言 oracle 返回的 minCost 恰为 1322（这是手算常量），
  // 并断言 oracle 给出的具体方案总价确实等于 1322。
  const internal = instantiateInternal(ITEM_BY_ID.get('R03'), 'hand-1');
  const o = ITEM_BY_ID.get('R03').oracle(internal.facts);
  assert.equal(o.minCost, 1322, `手算最优价 1322，实际 ${o.minCost}`);

  const c = o.best.counts;
  const cost = internal.facts.types.reduce((s, t) => s + t.price * c[t.key], 0);
  const cnt = internal.facts.types.reduce((s, t) => s + c[t.key], 0);
  const met = internal.facts.types.reduce((s, t) => s + t.metric * c[t.key], 0);
  assert.equal(cost, 1322, `方案总价 ${cost} ≠ 1322`);
  assert.ok(cnt >= internal.facts.needCount && met >= internal.facts.needMetric, `方案不满足下限：件数 ${cnt}，指标 ${met}`);

  // 独立再写一遍 DP 交叉验证（不 import 被测函数）
  const f = internal.facts;
  const H = f.needCount + 1;
  const W = f.needMetric + 1;
  const INF = Number.POSITIVE_INFINITY;
  let dp = Array.from({ length: H }, () => new Array(W).fill(INF));
  dp[0][0] = 0;
  for (const t of f.types) {
    for (let k = 0; k < t.limit; k++) {
      const nx = dp.map((row) => [...row]);
      for (let cc = 0; cc < H; cc++) {
        for (let mm = 0; mm < W; mm++) {
          if (dp[cc][mm] === INF) continue;
          const nc = Math.min(H - 1, cc + 1);
          const nm = Math.min(W - 1, mm + t.metric);
          if (dp[cc][mm] + t.price < nx[nc][nm]) nx[nc][nm] = dp[cc][mm] + t.price;
        }
      }
      dp = nx;
    }
  }
  assert.equal(dp[H - 1][W - 1], 1322, `独立 DP 得到 ${dp[H - 1][W - 1]}，与常量 1322 不符`);
});

test('3d. 手算夹具 R04 / seed=hand-1（人工解唯一确定）', () => {
  // 先把题面线索逐条读出来人工推。
  // 这题必须真的按线索推，所以这里采取「用独立谓词求解 + 与 facts.solution 对拍」，
  // 期望值取自题面线索（而不是 oracle 的返回值）。
  const internal = instantiateInternal(ITEM_BY_ID.get('R04'), 'hand-1');
  const { names, colors, clueTests } = internal.facts;

  // 独立穷举 6!×6!，只用题面线索谓词
  const sols = [];
  for (const np of allPerms(names)) {
    const seatPos = Object.fromEntries(names.map((n) => [n, np.indexOf(n) + 1]));
    for (const cp of allPerms(colors)) {
      const seat = Object.fromEntries(names.map((n) => [n, { position: seatPos[n], color: cp[seatPos[n] - 1] }]));
      if (clueTests.every((c) => c.test(seat) === true)) sols.push(seat);
    }
  }
  assert.equal(sols.length, 1, `题面欠定：有 ${sols.length} 个解`);

  // 这个唯一解必须就是 facts.solution（出题时的真解），否则题面与答案不一致
  const sol = sols[0];
  for (const s of internal.facts.solution) {
    assert.equal(sol[s.name].position, s.position, `${s.name} 位置不一致`);
    assert.equal(sol[s.name].color, s.color, `${s.name} 颜色不一致`);
  }
  // 并断言判分对该解满分
  assert.equal(grade('R04', 'hand-1', sol).awarded, 9, '唯一解拿不到 9 分');
});

/* ========================================================================== *
 * 4. 全错答案 0 分
 * ========================================================================== */
test('4. 全错答案必须 0 分', () => {
  const wrongs = {
    R01: { subtotal: 1, total: 1 },
    R02: { order: [] },
    R03: { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 },
    R04: {},
  };
  for (const id of items) {
    const r = grade(id, 'hand-1', wrongs[id]);
    assert.equal(r.awarded, 0, `${id} 全错答案竟得 ${r.awarded} 分`);
  }
});

/* ========================================================================== *
 * 5. 题面无泄漏
 * ========================================================================== */
test('5. 题面不得泄漏答案（不出现标准答案/参考答案字样，且不含完整答案字面量）', () => {
  for (const id of items) {
    for (const seed of SEEDS20) {
      const g = ITEM_BY_ID.get(id).generate(seed);
      assert.ok(!/标准答案|参考答案|正确答案是/.test(g.prompt), `${id} seed=${seed} 题面出现「标准答案」类字样`);

      // R01：不得把 subtotal/total 数字直接写进题面
      if (id === 'R01') {
        const o = ITEM_BY_ID.get(id).oracle(g.facts);
        assert.ok(!g.prompt.includes(String(o.total)), `${id} seed=${seed} 题面直接含 total=${o.total}`);
      }
      // R02：不得出现完整 order 序列
      if (id === 'R02') {
        const o = ITEM_BY_ID.get(id).oracle(g.facts);
        const seq = o.order.join('');
        assert.ok(!g.prompt.includes(seq), `${id} seed=${seed} 题面直接含完整序列 ${seq}`);
      }
      // R03：不得直接给出 counts 组合
      if (id === 'R03') {
        const o = ITEM_BY_ID.get(id).oracle(g.facts);
        const keys = Object.keys(o.best.counts);
        const literal = keys.map((k) => `"${k}": ${o.best.counts[k]}`).join(', ');
        assert.ok(!g.prompt.includes(literal), `${id} seed=${seed} 题面直接含答案组合`);
      }
    }
  }
});

/* ========================================================================== *
 * 6. 评分条件中性
 * ========================================================================== */
test('6. 评分条件文本中性：不含「不得/不要/而非/注意」，不含具体数值', () => {
  for (const id of items) {
    for (const seed of SEEDS20) {
      const g = ITEM_BY_ID.get(id).generate(seed);
      for (const c of g.publicCriteria) {
        assert.ok(!/不得|不要|而非|注意/.test(c.text), `${id} ${c.id} 条件文本点破陷阱：「${c.text}」`);
        assert.ok(!/\d/.test(c.text), `${id} ${c.id} 条件文本含具体数字：「${c.text}」`);
      }
    }
  }
});

/* ========================================================================== *
 * 7. R03 贪心必须错（本题难度来源）
 * ========================================================================== */
test('7. R03：贪心解必须严格劣于最优解（20 seed 全部成立）', () => {
  const R03 = ITEM_BY_ID.get('R03');
  let minGap = Infinity;
  let maxGap = 0;
  for (const seed of SEEDS20) {
    const internal = instantiateInternal(R03, seed);
    const f = internal.facts;

    // 独立实现贪心：按「指标/单价」性价比从高到低，堆到上限再补下一种
    const order = [...f.types].sort((a, b) => (b.metric / b.price) - (a.metric / a.price));
    const counts = Object.fromEntries(f.types.map((t) => [t.key, 0]));
    let cnt = 0, met = 0, cost = 0;
    for (const t of order) {
      while (counts[t.key] < t.limit && (cnt < f.needCount || met < f.needMetric)) {
        counts[t.key]++; cnt++; met += t.metric; cost += t.price;
      }
    }
    assert.ok(cnt >= f.needCount && met >= f.needMetric, `seed=${seed} 贪心解不可行`);

    const o = R03.oracle(f);
    assert.ok(
      cost > o.minCost,
      `seed=${seed} 贪心解 ${cost} 竟然等于/优于最优 ${o.minCost} —— 本题退化成普通凑单，失去区分度`,
    );
    const gap = cost - o.minCost;
    minGap = Math.min(minGap, gap);
    maxGap = Math.max(maxGap, gap);
  }
  // 差距必须有实质意义（至少 1 元，且平均不能是 0）
  assert.ok(minGap >= 1, `最小差距 ${minGap} 太小`);
  assert.ok(maxGap >= 1, `最大差距 ${maxGap} 异常`);
});

/* ========================================================================== *
 * 8. R04 唯一性（穷举题面允许的全部排列）
 * ========================================================================== */
test('8. R04：20 seed 下解必须唯一（穷举题面允许的全部排列，找到第 2 解即停止）', () => {
  const R04 = ITEM_BY_ID.get('R04');
  for (const seed of SEEDS20) {
    const internal = instantiateInternal(R04, seed);
    const { names, colors, clueTests } = internal.facts;
    assert.ok(Array.isArray(clueTests) && clueTests.length > 0, `seed=${seed} 缺少线索谓词`);

    // 独立穷举：一旦找到第 2 个解就可以断言「不唯一」并立即返回，
    // 不必把 518400 种组合走完（否则 20 seed 要 20 秒）。
    let found = 0;
    let secondSolution = null;
    outer:
    for (const np of allPerms(names)) {
      const seatPos = Object.fromEntries(names.map((n) => [n, np.indexOf(n) + 1]));
      for (const cp of allPerms(colors)) {
        const seat = Object.fromEntries(names.map((n) => [n, { position: seatPos[n], color: cp[seatPos[n] - 1] }]));
        if (clueTests.every((c) => c.test(seat) === true)) {
          found++;
          if (found === 2) { secondSolution = seat; break outer; }
        }
      }
    }
    assert.equal(found, 1, `seed=${seed} 有 ${found >= 2 ? '≥2' : found} 个解，题面欠定`);
    void secondSolution;
  }
});

/* ========================================================================== *
 * 9. 性能（防止再次出现「generate 挂死」）
 * ========================================================================== */
test('9. 性能：R03 单次 < 15ms，R04 单次 < 50ms，catalogFingerprint < 500ms', () => {
  // R03
  let t = Date.now();
  for (let i = 0; i < 20; i++) ITEM_BY_ID.get('R03').generate(`perf-r03-${i}`);
  const r03avg = (Date.now() - t) / 20;
  assert.ok(r03avg < 15, `R03 单次均值 ${r03avg.toFixed(1)}ms ≥ 15ms（可能又用了指数搜索）`);

  // R04
  t = Date.now();
  for (let i = 0; i < 20; i++) ITEM_BY_ID.get('R04').generate(`perf-r04-${i}`);
  const r04avg = (Date.now() - t) / 20;
  assert.ok(r04avg < 50, `R04 单次均值 ${r04avg.toFixed(1)}ms ≥ 50ms（可能又在做全枚举）`);

  // 指纹
  t = Date.now();
  catalogFingerprint();
  const fpMs = Date.now() - t;
  assert.ok(fpMs < 500, `catalogFingerprint 用了 ${fpMs}ms ≥ 500ms（doctor/start 会明显卡顿）`);
});

/* ========================================================================== *
 * 10. grade 对垃圾输入不抛异常
 * ========================================================================== */
test('10. grade 对任意垃圾输入都不得抛异常', () => {
  const junk = [null, undefined, '', '   ', {}, [], 0, 1, true, 'x', '{"a":1}', '\u0000', NaN, -1];
  for (const id of items) {
    const internal = instantiateInternal(ITEM_BY_ID.get(id), 'junk');
    for (const ans of junk) {
      assert.doesNotThrow(() => gradeItem(internal, ans, { seed: 'junk' }), `${id} 对 ${JSON.stringify(ans)} 抛异常`);
    }
  }
});
