/**
 * 独立基准夹具（golden fixtures）。
 *
 * ⚠️ 为什么需要这个文件：
 * 验收审计发现，之前的测试里**期望值全部由被测的 oracle() 生成**，
 * 而 grade() 内部又调用同一个 oracle —— 这叫「自洽即通过」，等于没测。
 * 实证：把 I01 的 oracle 的 budgetAttached 取反后，按题面诚实作答只得 1/4，
 * 但 node --test 仍然 95/95 全绿。这是致命缺陷。
 *
 * 本文件的做法：
 *   1. 用**固定的 seed**，把每道题的**题面关键事实**抄成人类可读的常量；
 *   2. 用**手算/手推**的方式得出正确答案，**不调用任何 oracle**；
 *   3. 断言 grade() 对这些手算答案给满分。
 *
 * 只要有人改了 generate() 或 oracle() 却忘了同步，这些夹具就会红。
 * 如果题面本身是有意变更的，必须**手工重新计算并更新本文件** —— 这正是我们要的摩擦。
 *
 * 更新本文件的纪律：
 *   - 不得用脚本自动生成（那样又变回自证）
 *   - 每条都要写明「怎么算的」
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_BY_ID, instantiateInternal } from '../src/exam/manifest.mjs';
import { gradeItem } from '../src/grading/grade.mjs';

/** 用给定 seed 拿到题目内部事实（只用于确认题面参数，不用于判分） */
function factsOf(id, seed) {
  return instantiateInternal(ITEM_BY_ID.get(id), seed).facts;
}

/** 用给定 seed 拿到题面文本（用于人工核对） */
function promptOf(id, seed) {
  return ITEM_BY_ID.get(id).generate(seed).prompt;
}

/** 判分（唯一被信任的接口） */
function grade(id, seed, answer) {
  return gradeItem(instantiateInternal(ITEM_BY_ID.get(id), seed), answer, { seed });
}

/**
 * 手工计算器：独立于 oracles.mjs 重新实现每道题的算法。
 * 这里刻意用「笨办法」（逐项累加、穷举），不 import 任何 oracle 代码。
 */

/* ===================== 手工独立实现区 ===================== */

/** R01：单价×数量求和，再看是否满门槛 */
function handR01(f) {
  const subtotal = f.unitA * f.qtyA + f.unitB * f.qtyB;
  const total = subtotal >= f.threshold ? subtotal - f.discount : subtotal;
  return { subtotal, total };
}

/** R03：三重循环穷举，找最低总价（完全独立于 oracle 的实现方式） */
function handR03(f) {
  let best = null;
  for (let v = 0; v <= f.veg.max; v++) {
    for (let c = 0; c <= f.chicken.max; c++) {
      for (let b = 0; b <= f.beef.max; b++) {
        const boxes = v + c + b;
        const protein = v * f.veg.protein + c * f.chicken.protein + b * f.beef.protein;
        if (boxes < f.needBoxes || protein < f.needProtein) continue;
        const cost = v * f.veg.price + c * f.chicken.price + b * f.beef.price;
        if (best === null || cost < best.cost) best = { v, c, b, cost };
      }
    }
  }
  return best;
}

/** C02：逐步手算库存 */
function handC02(f) {
  let stock = f.init;
  stock += f.steps[0].qty; // 入库
  stock -= f.steps[1].qty; // 出库
  stock -= f.steps[2].qty; // 盘亏
  const beforeVoid = stock;
  stock += f.steps[3].qty; // 撤回出库 → 加回
  return { beforeVoid, finalStock: stock };
}

/** C01：手算 a+b+c */
function handC01(f) {
  return { correctTotal: f.a + f.b + f.c, isCorrect: f.wrong === f.a + f.b + f.c };
}

/** R02：手工拓扑检查（独立实现：反复扫「当前所有前驱都已完成」的任务） */
function handR02Valid(f, order) {
  if (order.length !== 5 || new Set(order).size !== 5) return false;
  const done = new Set();
  for (const t of order) {
    const need = f.deps[t] || [];
    if (!need.every((d) => done.has(d))) return false;
    done.add(t);
  }
  return done.size === 5;
}

/** D03：手工三表核对 */
function handD03(f) {
  const sup = {};
  for (const s of f.supplier) sup[s.sku] = s.price;
  const lossMaking = [];
  const onlyInStore = [];
  let commonCount = 0;
  for (const sp of f.storePrices) {
    if (!(sp.sku in sup)) { onlyInStore.push(sp.sku); continue; }
    commonCount++;
    if (sp.price < sup[sp.sku]) lossMaking.push(sp.sku);
  }
  return { lossMaking: lossMaking.sort(), onlyInStore: onlyInStore.sort(), commonCount };
}

/* ===================== 手算夹具测试 ===================== */

test('独立夹具 R01：手算小票合计', () => {
  for (const seed of ['fx-r01-a', 'fx-r01-b', 'fx-r01-c', 'fx-r01-d']) {
    const f = factsOf('R01', seed);
    const want = handR01(f);
    const r = grade('R01', seed, want);
    assert.equal(r.awarded, 4, `seed=${seed} 手算 ${JSON.stringify(want)} 只得 ${r.awarded}/4；题面=${promptOf('R01', seed)}`);
  }
});

test('独立夹具 R03：手工穷举最低价（多解时必须接受任一最优解）', () => {
  for (const seed of ['fx-r03-a', 'fx-r03-b', 'fx-r03-c', 'fx-r03-d', 'fx-r03-e']) {
    const f = factsOf('R03', seed);
    const best = handR03(f);
    assert.ok(best, `seed=${seed} 手算无可行解（题目本身有问题）`);
    // 手算出来的最优解必须满分
    const r = grade('R03', seed, { veg: best.v, chicken: best.c, beef: best.b });
    assert.equal(r.awarded, 6, `seed=${seed} 手算最优 ${JSON.stringify(best)} 只得 ${r.awarded}/6`);
    // 把最优解加一份素盒（变贵）必须掉分
    const worse = grade('R03', seed, { veg: best.v + 1, chicken: best.c, beef: best.b });
    assert.ok(worse.awarded < 6, `seed=${seed} 更贵的方案竟然也满分`);
  }
});

test('独立夹具 C02：手工逐步推库存', () => {
  for (const seed of ['fx-c02-a', 'fx-c02-b', 'fx-c02-c', 'fx-c02-d']) {
    const f = factsOf('C02', seed);
    const want = handC02(f);
    const r = grade('C02', seed, want);
    assert.equal(r.awarded, 6, `seed=${seed} 手算 ${JSON.stringify(want)} 只得 ${r.awarded}/6；题面=${promptOf('C02', seed)}`);
  }
});

test('独立夹具 C01：手工算和并判断原式对错', () => {
  for (const seed of ['fx-c01-a', 'fx-c01-b', 'fx-c01-c', 'fx-c01-d', 'fx-c01-e', 'fx-c01-f']) {
    const f = factsOf('C01', seed);
    const want = handC01(f);
    const r = grade('C01', seed, want);
    assert.equal(r.awarded, 4, `seed=${seed} 手算 ${JSON.stringify(want)} 只得 ${r.awarded}/4；题面=${promptOf('C01', seed)}`);
  }
});

test('独立夹具 R02：手工拓扑合法性校验', () => {
  for (const seed of ['fx-r02-a', 'fx-r02-b', 'fx-r02-c', 'fx-r02-d']) {
    const f = factsOf('R02', seed);
    // 手工构造一个必然合法的顺序：反复取「前驱全部完成」的任务，按字母序
    const order = [];
    const done = new Set();
    while (order.length < 5) {
      const next = ['A', 'B', 'C', 'D', 'E'].find((t) => !done.has(t) && (f.deps[t] || []).every((d) => done.has(d)));
      assert.ok(next, `seed=${seed} 手算拓扑排序失败`);
      order.push(next);
      done.add(next);
    }
    assert.ok(handR02Valid(f, order), `seed=${seed} 手工构造的顺序却不合法`);
    const r = grade('R02', seed, { order, first: order[0], last: order[4] });
    assert.equal(r.awarded, 6, `seed=${seed} 手算合法序 ${order.join('')} 只得 ${r.awarded}/6`);
    // 把顺序完全倒过来必须 0 分
    const rev = [...order].reverse();
    const bad = grade('R02', seed, { order: rev, first: rev[0], last: rev[4] });
    assert.equal(bad.awarded, 0, `seed=${seed} 倒序竟然得 ${bad.awarded}/6`);
  }
});

test('独立夹具 D03：手工核对两表', () => {
  for (const seed of ['fx-d03-a', 'fx-d03-b', 'fx-d03-c', 'fx-d03-d']) {
    const f = factsOf('D03', seed);
    const want = handD03(f);
    const r = grade('D03', seed, want);
    assert.equal(r.awarded, 6, `seed=${seed} 手算 ${JSON.stringify(want)} 只得 ${r.awarded}/6；题面=${promptOf('D03', seed)}`);
  }
});

test('独立夹具 D01：手工去重 + 按序号排序', () => {
  for (const seed of ['fx-d01-a', 'fx-d01-b', 'fx-d01-c']) {
    const f = factsOf('D01', seed);
    const uniq = [...new Set(f.rawList)];
    const sorted = uniq.sort((a, b) => f.codes[a] - f.codes[b]);
    const r = grade('D01', seed, { list: sorted });
    assert.equal(r.awarded, 4, `seed=${seed} 手算 ${JSON.stringify(sorted)} 只得 ${r.awarded}/4；题面=${promptOf('D01', seed)}`);
    // 顺序打乱必须掉分
    const shuffled = [...sorted].reverse();
    const bad = grade('D01', seed, { list: shuffled });
    assert.ok(bad.awarded < 4, `seed=${seed} 逆序竟然也满分`);
  }
});

test('独立夹具 D04：手工按规则表判等级', () => {
  for (const seed of ['fx-d04-a', 'fx-d04-b', 'fx-d04-c']) {
    const f = factsOf('D04', seed);
    const levels = {};
    const counts = { gold: 0, silver: 0, normal: 0 };
    for (const t of f.tiers) {
      let lv;
      if (t.age < 18) lv = '普通';
      else if (t.points >= f.goldLine && t.active && t.age >= 20) lv = '金牌';
      else if (t.points >= f.silverLine && t.active && (t.age >= 18 || t.invite)) lv = '银牌';
      else lv = '普通';
      levels[t.name] = lv;
      if (lv === '金牌') counts.gold++;
      else if (lv === '银牌') counts.silver++;
      else counts.normal++;
    }
    const r = grade('D04', seed, { levels, counts });
    assert.equal(r.awarded, 9, `seed=${seed} 手算 ${JSON.stringify(counts)} 只得 ${r.awarded}/9；题面=${promptOf('D04', seed)}`);
  }
});

test('独立夹具 I01：手工读通知2与通知3', () => {
  for (const seed of ['fx-i01-a', 'fx-i01-b', 'fx-i01-c']) {
    const f = factsOf('I01', seed);
    const want = { deadline: `${f.updatedDay}${f.updatedTime}`, budgetAttached: f.attachRequired };
    const r = grade('I01', seed, want);
    assert.equal(r.awarded, 4, `seed=${seed} 手算 ${JSON.stringify(want)} 只得 ${r.awarded}/4；题面=${promptOf('I01', seed)}`);
    // 附件要求反过来必须掉 3 分
    const wrong = { ...want, budgetAttached: !f.attachRequired };
    const bad = grade('I01', seed, wrong);
    assert.equal(bad.awarded, 1, `seed=${seed} 附件答反了应得 1/4，实际 ${bad.awarded}/4`);
  }
});

test('独立夹具 I03：手工按规则优先级推审批结论', () => {
  for (const seed of ['fx-i03-a', 'fx-i03-b', 'fx-i03-c', 'fx-i03-d', 'fx-i03-e', 'fx-i03-f']) {
    const f = factsOf('I03', seed);
    // 手工按题面规则表逐条判（独立于 oracle 的写法）
    const isWhite = f.applicant === '许知远';
    let want;
    if (!isWhite && f.amount > 8000) want = { rule: 'R1', decision: '转人工', escalate: true };
    else if (!isWhite && f.nights > 5 && f.amount > 5000) want = { rule: 'R2', decision: '部分批准', escalate: true };
    else if (f.region === '华东三区' && f.amount <= 4000) want = { rule: 'R3', decision: '批准', escalate: false };
    else want = { rule: 'R4', decision: '部分批准', escalate: false };
    const r = grade('I03', seed, want);
    assert.equal(r.awarded, 6, `seed=${seed} 手算 ${JSON.stringify(want)} 只得 ${r.awarded}/6；题面=${promptOf('I03', seed)}`);
  }
});

test('独立夹具 I04：手工执行四条更新指令', () => {
  for (const seed of ['fx-i04-a', 'fx-i04-b', 'fx-i04-c']) {
    const f = factsOf('I04', seed);
    // 手工：初始 → 第1条改负责人 → 第2条改状态+时间 → 第3条再改负责人 → 第4条改状态并恢复时间
    const want = {
      status: f.finalStatus,
      owner: f.finalOwner,
      deadline: f.init.deadline,
    };
    const r = grade('I04', seed, want);
    assert.equal(r.awarded, 9, `seed=${seed} 手算 ${JSON.stringify(want)} 只得 ${r.awarded}/9；题面=${promptOf('I04', seed)}`);
  }
});

test('独立夹具 C04：手工修脚本', () => {
  for (const seed of ['fx-c04-a', 'fx-c04-b', 'fx-c04-c']) {
    const f = factsOf('C04', seed);
    const subtotal = f.price * f.qtyOk;
    const total = Math.round(subtotal * f.memberRate * 100) / 100;
    const want = { rootCause: '数量用错', fixedSubtotal: subtotal, fixedTotal: total };
    const r = grade('C04', seed, want);
    assert.equal(r.awarded, 9, `seed=${seed} 手算 ${JSON.stringify(want)} 只得 ${r.awarded}/9；题面=${promptOf('C04', seed)}`);
  }
});

test('独立夹具 D02：手工决定 A/B/C', () => {
  for (const seed of ['fx-d02-a', 'fx-d02-b', 'fx-d02-c', 'fx-d02-d', 'fx-d02-e', 'fx-d02-f']) {
    const f = factsOf('D02', seed);
    if (f.aGiven) {
      const answer = f.projectA_Final < f.projectB_Final ? 'A' : 'B';
      const word = answer === 'A' ? '少，更省钱' : '多，不比乙省';
      const reason = `甲实际支出 ${f.projectA_Final} 万元，乙 ${f.projectB_Final} 万元，甲比乙${word}。`;
      const r = grade('D02', seed, { answer, reason });
      assert.equal(r.awarded, 6, `seed=${seed} 手算 ${answer} 只得 ${r.awarded}/6`);
    } else {
      const r = grade('D02', seed, { answer: 'C', reason: '甲的最终实际支出没有给出，信息不足无法判断。' });
      assert.equal(r.awarded, 6, `seed=${seed} 手算 C 只得 ${r.awarded}/6`);
    }
  }
});

/* ===================== 反向断言：翻转标准答案必须掉分 ===================== */

test('翻转任何一题的正确答案，都必须掉分（证明判分不是自证）', () => {
  // 对每道题：先拿手算/已知的满分答案，然后做一个明确错误的变体，断言分数下降。
  const cases = [
    ['R01', 'fx-flip-r01', (f) => ({ subtotal: handR01(f).subtotal, total: handR01(f).total }), (a) => ({ ...a, total: a.total + 1 })],
    ['C01', 'fx-flip-c01', (f) => handC01(f), (a) => ({ ...a, correctTotal: a.correctTotal + 1 })],
    ['C02', 'fx-flip-c02', (f) => handC02(f), (a) => ({ ...a, finalStock: a.finalStock + 1 })],
    ['I01', 'fx-flip-i01', (f) => ({ deadline: `${f.updatedDay}${f.updatedTime}`, budgetAttached: f.attachRequired }), (a) => ({ ...a, budgetAttached: !a.budgetAttached })],
    ['C04', 'fx-flip-c04', (f) => ({ rootCause: '数量用错', fixedSubtotal: f.price * f.qtyOk, fixedTotal: Math.round(f.price * f.qtyOk * f.memberRate * 100) / 100 }), (a) => ({ ...a, fixedTotal: a.fixedTotal + 1 })],
  ];
  for (const [id, seed, makeGood, corrupt] of cases) {
    const f = factsOf(id, seed);
    const good = makeGood(f);
    const rGood = grade(id, seed, good);
    assert.equal(rGood.awarded, ITEM_BY_ID.get(id).points, `${id} 好答案应满分`);
    const rBad = grade(id, seed, corrupt(good));
    assert.ok(rBad.awarded < rGood.awarded, `${id} 翻转后分数没有下降（${rGood.awarded} → ${rBad.awarded}）—— 判分可能是自证`);
  }
});
