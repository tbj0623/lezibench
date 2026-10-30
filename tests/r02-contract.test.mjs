/**
 * R02 评分契约常驻回归（node --test）
 *
 * v1.4 P0-B 的背景：
 *   修复前，公开条件只承诺「工序代号完整且不重复」，但 `grade()` 里的 C1 还偷偷
 *   要求「链内先后成立」（`hasProgress`），而 C2 的依赖集合又把链内关系算进去了。
 *   结果是：评分与公开条件不符 + C2/C3 互相重叠。
 *   更隐蔽的问题是：跨链/链内怎么划分，答题者从题面根本推不出来 —— 那本身就是隐藏条件。
 *
 * 本文件的设计原则（防止"自证"）：
 *   期望值**不读实现里的 facts.pCodes / facts.chains / facts.crossDeps**，
 *   而是**从题面公开文本里把两条链和跨链要求解析出来**，再用独立实现算真值。
 *   这样一旦「题面写的」和「代码判的」出现分歧，测试立刻红。
 *
 * 覆盖契约要求的五类反例 × 多 seed，另加随机顺序。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_BY_ID, instantiateInternal } from '../src/exam/manifest.mjs';
import { gradeItem } from '../src/grading/grade.mjs';

const SEEDS = [
  'r02c-a', 'r02c-b', 'r02c-c', 'r02c-d', 'r02c-e',
  'r02c-f', 'r02c-g', 'r02c-h', 'r02c-i', 'r02c-j',
];

const R02 = ITEM_BY_ID.get('R02');

/** 判分（唯一被信任的接口） */
function grade(seed, order) {
  return gradeItem(instantiateInternal(R02, seed), { order }, { seed });
}

function checksOf(result) {
  const out = {};
  for (const c of result.checks) out[c.criterionId] = c.passed;
  return out;
}

/**
 * 只从**题面公开文本**解析出评测所需的全部事实。
 * 不 import 任何实现内部字段 —— 这是本测试能发现"题面与代码不一致"的关键。
 */
function parsePublishedPrompt(prompt) {
  const lines = prompt.split('\n');
  const chains = {};
  const chainOf = new Map();

  for (const label of ['P', 'Q']) {
    const i = lines.findIndex((l) => l.includes(`【链 ${label}`));
    assert.ok(i >= 0, `题面缺少【链 ${label}】段`);
    const arrowLine = lines.slice(i + 1).find((l) => l.trim() !== '');
    assert.ok(arrowLine, `链 ${label} 没有工序序列行`);
    const codes = [...arrowLine.matchAll(/([A-Z])（/g)].map((m) => m[1]);
    assert.ok(codes.length >= 2, `链 ${label} 解析失败：「${arrowLine}」`);
    chains[label] = codes;
    for (const c of codes) {
      assert.ok(!chainOf.has(c), `代号 ${c} 同时出现在两条链里`);
      chainOf.set(c, label);
    }
  }

  const ci = lines.findIndex((l) => l.includes('【跨链要求】'));
  assert.ok(ci >= 0, '题面缺少【跨链要求】段');
  const cross = [];
  for (const l of lines.slice(ci + 1)) {
    const m = l.match(/([A-Z])（[^）]*）必须在\s*([A-Z])（[^）]*）完成之后/);
    if (m) cross.push({ task: m[1], need: m[2] });
  }
  // 题面自己声明的条数必须和真解析出来的条数一致
  const declared = lines[ci].match(/以下\s*(\d+)\s*条/);
  if (declared) {
    assert.equal(cross.length, Number(declared[1]), '题面声明的跨链条数与实际列出的条数不一致');
  }
  assert.ok(cross.length >= 2, `跨链要求解析失败，只得到 ${cross.length} 条`);

  for (const r of cross) {
    assert.ok(chainOf.has(r.task) && chainOf.has(r.need), `跨链要求引用了不存在的代号：${r.task}/${r.need}`);
    assert.notEqual(chainOf.get(r.task), chainOf.get(r.need), `跨链要求 ${r.task}→${r.need} 其实在同一条链内`);
  }

  return { chains, chainOf, cross, all: [...chains.P, ...chains.Q] };
}

/** 独立真值：完全按公开文本推导，不 import 实现的判分逻辑 */
function expectedFrom(facts, order) {
  const { chains, cross, all } = facts;
  const pos = new Map();
  order.forEach((c, i) => { if (!pos.has(c)) pos.set(c, i); });

  const missing = all.filter((c) => !pos.has(c));
  const dup = [...new Set(order.filter((c, i) => order.indexOf(c) !== i))];
  const extra = [...new Set(order.filter((c) => !all.includes(c)))];
  const setOk = missing.length === 0 && dup.length === 0 && extra.length === 0;

  const crossOk = setOk && cross.every((r) => pos.get(r.need) < pos.get(r.task));
  const chainOk = setOk && Object.values(chains).every(
    (cs) => cs.every((c, i) => i === 0 || pos.get(cs[i - 1]) < pos.get(c)),
  );

  return { 'R02.C1': setOk, 'R02.C2': crossOk, 'R02.C3': chainOk };
}

/** 独立拓扑排序：只用公开文本解析出来的约束（链内相邻 + 跨链），Kahn + 字典序 */
function independentValidOrder(facts) {
  const { chains, cross, all } = facts;
  const indeg = new Map(all.map((c) => [c, 0]));
  const edges = new Map(); // from -> [to]
  const addEdge = (from, to) => {
    if (!edges.has(from)) edges.set(from, []);
    edges.get(from).push(to);
    indeg.set(to, indeg.get(to) + 1);
  };
  for (const cs of Object.values(chains)) {
    for (let i = 1; i < cs.length; i++) addEdge(cs[i - 1], cs[i]);
  }
  for (const r of cross) addEdge(r.need, r.task);

  const out = [];
  const ready = all.filter((c) => indeg.get(c) === 0).sort();
  while (ready.length) {
    const c = ready.shift();
    out.push(c);
    for (const n of (edges.get(c) || [])) {
      indeg.set(n, indeg.get(n) - 1);
      if (indeg.get(n) === 0) { ready.push(n); ready.sort(); }
    }
  }
  assert.equal(out.length, all.length, '公开约束存在环，无法构造合法顺序');
  return out;
}

/* ────────────────────────── 1. 五类反例 × 10 seed ────────────────────────── */

test('R02 契约：十 seed 下五类反例的真值（从题面解析）与实际判分逐条一致', () => {
  let cases = 0;
  for (const seed of SEEDS) {
    const g = R02.generate(seed);
    const facts = parsePublishedPrompt(g.prompt);
    const valid = independentValidOrder(facts);

    const variants = {
      '完整合法': valid,
      '整体倒序': [...valid].reverse(),
      '缺码': valid.slice(1),
      '重复代号': [valid[0], ...valid],
      '多余代号': [...valid, 'Z'],
      '链内相邻互换': (() => {
        const o = [...valid];
        const cs = facts.chains.P;
        const a = o.indexOf(cs[0]);
        const b = o.indexOf(cs[1]);
        [o[a], o[b]] = [o[b], o[a]];
        return o;
      })(),
      '跨链对调': (() => {
        const o = [...valid];
        const r = facts.cross[0];
        const a = o.indexOf(r.task);
        const b = o.indexOf(r.need);
        [o[a], o[b]] = [o[b], o[a]];
        return o;
      })(),
    };

    for (const [label, order] of Object.entries(variants)) {
      const want = expectedFrom(facts, order);
      const got = checksOf(grade(seed, order));
      cases++;
      assert.deepEqual(
        got, want,
        `seed=${seed} 场景「${label}」\n  顺序=${order.join('')}\n  题面推得=${JSON.stringify(want)}\n  实际判分=${JSON.stringify(got)}`,
      );
    }
  }
  assert.equal(cases, SEEDS.length * 7);
});

test('R02 契约：合法顺序必须满分 6，倒序只剩 C1 的 2 分', () => {
  for (const seed of SEEDS) {
    const facts = parsePublishedPrompt(R02.generate(seed).prompt);
    const valid = independentValidOrder(facts);
    assert.equal(grade(seed, valid).awarded, 6, `seed=${seed} 合法顺序应满分`);

    const rev = grade(seed, [...valid].reverse());
    assert.equal(
      rev.awarded, 2,
      `seed=${seed} 倒序只剩 C1（代号集合完整）的 2 分，实际 ${rev.awarded}`,
    );
    const c = checksOf(rev);
    assert.equal(c['R02.C1'], true, '倒序代号集合完整 → C1 必须给分（公开条件只看集合）');
    assert.equal(c['R02.C2'], false, '倒序必然违反跨链要求');
    assert.equal(c['R02.C3'], false, '倒序必然违反链内次序');
  }
});

/* ────────────────────── 2. 跨链违约但链内合法（C2 单独失效） ────────────────────── */

test('R02 契约：链内全对但跨链违约 → C2 失分、C3 满分（三条件不重叠）', () => {
  for (const seed of SEEDS) {
    const facts = parsePublishedPrompt(R02.generate(seed).prompt);

    // 最干净的构造：两条链各自整段拼接。链内次序必然完全正确，
    // 而跨链要求必然被破坏（不管哪条链在前，都至少有一条跨链要求不满足）。
    const pThenQ = [...facts.chains.P, ...facts.chains.Q];
    const qThenP = [...facts.chains.Q, ...facts.chains.P];

    for (const [label, o] of [['先P后Q', pThenQ], ['先Q后P', qThenP]]) {
      const want = expectedFrom(facts, o);
      const got = checksOf(grade(seed, o));
      assert.equal(want['R02.C1'], true, `${label} 代号集合完整 → C1 真值应为 true`);
      assert.equal(want['R02.C3'], true, `${label} 两链各自整段拼接 → 链内次序真值应为 true`);
      assert.equal(want['R02.C2'], false, `${label} 整段拼接必然破坏跨链要求`);
      assert.deepEqual(got, want, `seed=${seed} ${label} 判分与题面真值不一致`);
      assert.equal(got['R02.C2'], false, `seed=${seed} ${label} 跨链违约 → C2 必须失分`);
      assert.equal(got['R02.C3'], true, `seed=${seed} ${label} 链内仍合法 → C3 必须给分`);
      assert.equal(grade(seed, o).awarded, 4, `${seed} ${label} 应得 C1+C3 的 4 分`);
    }
  }
});

/* ────────────────────────── 3. 随机顺序 × 多 seed ────────────────────────── */

test('R02 契约：随机顺序（200 例）真值与判分完全一致，且不倒挂', () => {
  // 确定性伪随机，避免 flaky
  let s = 0x9e3779b9;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  let checked = 0;
  for (const seed of SEEDS) {
    const facts = parsePublishedPrompt(R02.generate(seed).prompt);
    const valid = independentValidOrder(facts);
    for (let k = 0; k < 20; k++) {
      const order = shuffle(valid);
      const want = expectedFrom(facts, order);
      const got = checksOf(grade(seed, order));
      assert.deepEqual(got, want, `seed=${seed} 随机序 ${order.join('')} 不一致`);
      checked++;
    }
  }
  assert.equal(checked, SEEDS.length * 20);
});

/* ────────────── 4. 第 1 批/批次归属与「C2/C3 以 C1 为前提」的公开性 ────────────── */

test('R02 契约：C2/C3 在 C1 未通过时必须标为「前提未满足」而不是谎称校验过', () => {
  for (const seed of ['r02c-a', 'r02c-b']) {
    const facts = parsePublishedPrompt(R02.generate(seed).prompt);
    const valid = independentValidOrder(facts);
    const r = grade(seed, valid.slice(1)); // 缺码
    const byId = Object.fromEntries(r.checks.map((c) => [c.criterionId, c]));
    assert.equal(byId['R02.C1'].passed, false);
    assert.equal(byId['R02.C2'].passed, false);
    assert.equal(byId['R02.C3'].passed, false);
    assert.match(byId['R02.C2'].reason, /前提未满足/, 'C2 必须说明是前提未满足，不能假装检查过');
    assert.match(byId['R02.C3'].reason, /前提未满足/, 'C3 必须说明是前提未满足，不能假装检查过');
  }
});

test('R02 契约：公开条件文案必须写明 C2/C3 以 C1 为前提', () => {
  const g = R02.generate('r02c-a');
  const byId = Object.fromEntries(g.publicCriteria.map((c) => [c.id, c]));
  assert.equal(g.publicCriteria.length, 3);
  assert.deepEqual(g.publicCriteria.map((c) => c.points), [2, 2, 2]);
  assert.match(byId['R02.C1'].text, /代号/, 'C1 文案必须点明只考代号集合');
  assert.match(byId['R02.C2'].text, /前提/, 'C2 文案必须写明以 C1 为前提');
  assert.match(byId['R02.C3'].text, /前提/, 'C3 文案必须写明以 C1 为前提');
});
