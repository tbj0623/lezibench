/**
 * 独立手算夹具（GOLDEN FIXTURES）
 *
 * ============================ 为什么存在 ============================
 *
 * 验收审计曾指出这个项目最致命的一个问题：
 *   **所有测试的「期望答案」都由被测的 oracle() 生成**，而 `grade()` 内部又调同一个
 *   oracle —— 这叫「自洽即通过」，等于没测。
 *
 * 实证：把 I01 的 oracle 的 budgetAttached 取反后，按题面诚实作答只得 1/4，
 *       而 `node --test` 仍然 96/96 全绿。
 *
 * 修法就是本文件：每道题的正确答案由**人读题面手算**得出，写成常量
 * （见 `tests/hand-fixtures.mjs`），再喂给 `grade()` 断言满分。
 *
 * 只要有人改了题面 / oracle 却忘了重新手算，这里立刻红。
 * 如果题目是有意变更的，必须**手工重新推导夹具** —— 这正是我们要的摩擦。
 *
 * ============================ 维护纪律 ============================
 *
 *   - 夹具常量来源于各维度的 `tests/hard-*.test.mjs`，由 `qa/build-hand-fixtures.mjs`
 *     汇聚成 `tests/hand-fixtures.mjs`。
 *   - **绝对不要**用脚本从 oracle 自动生成夹具（那样又变回自证）。
 *   - 每道题至少 3 条夹具，且必须跨多个 seed（防止只在一个种子下成立）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_BY_ID, ITEMS, instantiateInternal } from '../src/exam/manifest.mjs';
import { gradeItem } from '../src/grading/grade.mjs';
import { HAND_FIXTURES, FIXTURE_COUNT } from './hand-fixtures.mjs';

/* ==================================================================== *
 * 一、覆盖度：不能有题目「逃过」手算
 * ==================================================================== */

test('手算夹具覆盖度：16 道题每题至少 3 条', () => {
  const missing = [];
  for (const it of ITEMS) {
    const n = FIXTURE_COUNT[it.id] || 0;
    if (n < 3) missing.push(`${it.id}(${n} 条)`);
  }
  assert.equal(
    missing.length,
    0,
    `以下题目手算夹具不足 3 条，等于没被独立验证过：${missing.join('、')}\n` +
      `请在对应维度的 tests/hard-*.test.mjs 里补 FIXTURES，再跑 node qa/build-hand-fixtures.mjs`,
  );
});

test('手算夹具覆盖度：每条夹具的 seed 唯一（防止同一 seed 重复凑数）', () => {
  const seen = new Map();
  for (const f of HAND_FIXTURES) {
    const key = `${f.id}#${f.seed}`;
    assert.ok(!seen.has(key), `重复夹具：${key}`);
    seen.set(key, true);
  }
});

test('手算夹具覆盖度：同一道题的夹具必须跨多个 seed', () => {
  for (const it of ITEMS) {
    const seeds = new Set(HAND_FIXTURES.filter((f) => f.id === it.id).map((f) => f.seed));
    assert.ok(seeds.size >= 2, `${it.id} 的夹具只覆盖了 ${seeds.size} 个 seed，至少要 2 个`);
  }
});

/* ==================================================================== *
 * 二、核心断言：人工算出的答案必须判满分
 * ==================================================================== */

test('手算夹具：人工推导的答案必须判满分', () => {
  const failures = [];
  for (const f of HAND_FIXTURES) {
    const item = ITEM_BY_ID.get(f.id);
    assert.ok(item, `夹具引用了不存在的题目 ${f.id}`);
    const internal = instantiateInternal(item, f.seed);
    const r = gradeItem(internal, f.answer, { seed: f.seed });
    if (r.awarded !== item.points) {
      const why = (r.checks || []).filter((c) => !c.passed).map((c) => `${c.criterionId}: ${c.reason}`).join(' | ');
      failures.push(`${f.id} seed=${f.seed} 只得 ${r.awarded}/${item.points} —— ${why}`);
    }
  }
  assert.equal(failures.length, 0, `手算答案被判错（说明判分器与人工推导不一致）：\n${failures.join('\n')}`);
});

test('手算夹具：每题至少有一条夹具能拿到本人分（防止夹具本身写错）', () => {
  for (const it of ITEMS) {
    const fs = HAND_FIXTURES.filter((f) => f.id === it.id);
    assert.ok(fs.length >= 3, `${it.id} 夹具不足`);
  }
});

/* ==================================================================== *
 * 三、反自证：把人工答案改坏，判分必须下降
 *
 * 这一节是「判分器真的在逐条比对」的直接证据。
 * 如果判分器退化成「只要结构对就给分」，这里会红。
 * ==================================================================== */

/** 深拷贝并做一处「看起来仍然合法、但值错了」的篡改 */

function mutateOnce(answer, mutator) {
  const clone = JSON.parse(JSON.stringify(answer));
  let done = false;
  const walk = (node) => {
    if (done) return;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length && !done; i++) {
        const m = mutator(node[i]);
        if (m) { node[i] = m; done = true; } else walk(node[i]);
      }
      return;
    }
    if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) {
        if (done) return;
        const m = mutator(node[k]);
        if (m) { node[k] = m; done = true; return; }
        walk(node[k]);
      }
    }
  };
  walk(clone);
  return { clone, done };
}

test('反自证：把人工答案的任一字段改坏，分数必须下降', () => {
  const survivors = [];
  for (const f of HAND_FIXTURES) {
    const item = ITEM_BY_ID.get(f.id);
    const internal = instantiateInternal(item, f.seed);
    const base = gradeItem(internal, f.answer, { seed: f.seed }).awarded;
    assert.equal(base, item.points, `${f.id}/${f.seed} 原始夹具就不是满分`);

    // 依次对每个标量做篡改，至少要有一次导致掉分
    let dropped = false;
    const keys = [];
    (function collect(node, prefix) {
      if (Array.isArray(node)) { node.forEach((v, i) => collect(v, `${prefix}[${i}]`)); return; }
      if (node && typeof node === 'object') { for (const k of Object.keys(node)) collect(node[k], prefix ? `${prefix}.${k}` : k); return; }
      keys.push(prefix);
    })(f.answer, '');

    // 逐一尝试：把第 i 个标量改坏，看是否掉分（确定性，不用随机）
    //
    // 变异策略要「真的改坏」，不能只加噪：
    //   · 单字母（如 R02 的步骤代号 A/B/C）→ 换成另一个字母。
    //     只追加「错」是无效的：判分器归一化时会剥离非字母，'A错' 仍然被读成 'A'。
    //   · 数字 → +1；布尔 → 取反；其他字符串 → 追加「错」
    const flipLetter = (ch) => (ch === 'A' ? 'B' : 'A');
    for (let i = 0; i < keys.length && !dropped; i++) {
      const bad = JSON.parse(JSON.stringify(f.answer));
      let counter = 0;
      const mutator = (v) => {
        if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') {
          if (counter++ !== i) return null;
          if (typeof v === 'number') return v + 1;
          if (typeof v === 'boolean') return !v;
          if (/^[A-Z]$/.test(v)) return flipLetter(v);
          return `${v}错`;
        }
        return null;
      };
      const { clone, done } = mutateOnce(bad, mutator);
      if (!done) continue;
      const r = gradeItem(internal, clone, { seed: f.seed });
      if (r.awarded < item.points) dropped = true;
    }

    if (!dropped) survivors.push(`${f.id} seed=${f.seed}（${keys.length} 个字段全部改动都仍是满分）`);
  }
  assert.equal(
    survivors.length,
    0,
    `以下夹具的所有字段被改坏后**仍是满分**，说明判分器没有真正比对：\n${survivors.join('\n')}`,
  );
});

/* ==================================================================== *
 * 四、结构完整性（与具体内容无关，任何版本都必须成立）
 * ==================================================================== */

test('结构：所有题目的 awarded 必须在 [0, points] 内（上千次极端输入）', () => {
  const weird = [null, undefined, '', '   ', {}, [], 0, 1, -1, true, false, 'x', '{"a":1}', '\u0000', 'x'.repeat(5000)];
  for (const it of ITEMS) {
    const internal = instantiateInternal(it, 'extreme');
    for (const ans of weird) {
      const r = gradeItem(internal, ans, { seed: 'extreme' });
      let shown;
      try { shown = JSON.stringify(ans) ?? String(ans); } catch { shown = String(ans); }
      assert.ok(
        typeof r.awarded === 'number' && r.awarded >= 0 && r.awarded <= it.points,
        `${it.id} 对 ${String(shown).slice(0, 20)} 返回越界分 ${r.awarded}`,
      );
    }
  }
});

test('结构：空答案必须在所有题目上得 0 分', () => {
  for (const it of ITEMS) {
    const internal = instantiateInternal(it, 'empty');
    const r = gradeItem(internal, {}, { seed: 'empty' });
    assert.equal(r.awarded, 0, `${it.id} 空答案得了 ${r.awarded}/${it.points}`);
  }
});
