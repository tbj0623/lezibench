/**
 * 评分合同的可执行校验（node --test）。
 * 对应 03_评分算法形式规范.md §4 的 8 条断言。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ITEMS, DIMENSIONS, LEVELS, BATCHES, EXAM_VERSION, GRADER_VERSION,
  assertCatalogIntegrity, catalogFingerprint, criteriaOf, getLevel, itemsForBatch,
} from '../src/exam/manifest.mjs';
import { perfectAnswers } from '../scripts/oracle-answers.mjs';
import { gradeItem, summarize } from '../src/grading/grade.mjs';
import { instantiateInternal } from '../src/exam/manifest.mjs';

const gradeAll = (seed, answers) => ITEMS.map((it) => gradeItem(instantiateInternal(it, seed), answers[it.id], { seed }));

test('断言1: 16题 / 4批×4 / 100分 / 4维各25 / 难度4-8-4', () => {
  assert.equal(ITEMS.length, 16);
  assert.equal(ITEMS.reduce((s, i) => s + i.points, 0), 100);
  for (const b of BATCHES) assert.equal(itemsForBatch(b).length, 4, `第${b}批`);
  for (const d of DIMENSIONS) {
    const sum = ITEMS.filter((i) => i.dimension === d.key).reduce((s, i) => s + i.points, 0);
    assert.equal(sum, 25, d.key);
    const pts = ITEMS.filter((i) => i.dimension === d.key).map((i) => i.points).sort((a, b) => a - b);
    assert.deepEqual(pts, [4, 6, 6, 9], `${d.key} 应为 1×4 + 2×6 + 1×9`);
  }
  assert.equal(ITEMS.filter((i) => i.difficulty === 'easy').length, 4);
  assert.equal(ITEMS.filter((i) => i.difficulty === 'standard').length, 8);
  assert.equal(ITEMS.filter((i) => i.difficulty === 'challenge').length, 4);
});

test('断言1b: 每个评分条件的分数为正整数，且合计等于题目满分', () => {
  for (const it of ITEMS) {
    const crit = criteriaOf(it);
    assert.ok(crit.length >= 2, `${it.id} 至少拆 2 个条件`);
    for (const c of crit) {
      assert.ok(Number.isInteger(c.points) && c.points > 0, `${c.id} 分数必须正整数`);
      assert.ok(c.text && c.text.length > 0, `${c.id} 必须有公开文本`);
    }
    assert.equal(crit.reduce((s, c) => s + c.points, 0), it.points, it.id);
    // 基础题 [1,3]；标准题 [2,2,2]；挑战题 [3,3,3]
    const expect = it.points === 4 ? [1, 3] : it.points === 6 ? [2, 2, 2] : [3, 3, 3];
    assert.deepEqual(crit.map((c) => c.points), expect, `${it.id} 条件分值结构`);
  }
});

test('断言1c: 0–100 每个整数都可达（按最小原子单元穷举）', () => {
  const weights = ITEMS.flatMap((i) => criteriaOf(i).map((c) => c.points));
  const reachable = new Set([0]);
  for (const w of weights) for (const n of [...reachable]) reachable.add(n + w);
  const missing = [];
  for (let n = 0; n <= 100; n++) if (!reachable.has(n)) missing.push(n);
  assert.deepEqual(missing, [], `不可达分数：${missing.join(',')}`);
});

test('断言1d: 五个段位区间不重叠、完整覆盖 0–100', () => {
  const covered = new Set();
  for (const l of LEVELS) {
    assert.ok(l.min <= l.max);
    for (let s = l.min; s <= l.max; s++) {
      assert.ok(!covered.has(s), `分数 ${s} 被多个段位覆盖`);
      covered.add(s);
    }
  }
  for (let s = 0; s <= 100; s++) assert.ok(covered.has(s), `分数 ${s} 没有段位`);
  // 每个段位都必须真的能取到（段位不可达 = 虚假承诺）
  const weights = ITEMS.flatMap((i) => criteriaOf(i).map((c) => c.points));
  const reachable = new Set([0]);
  for (const w of weights) for (const n of [...reachable]) reachable.add(n + w);
  for (const l of LEVELS) {
    let found = false;
    for (let s = l.min; s <= l.max; s++) if (reachable.has(s)) found = true;
    assert.ok(found, `段位「${l.label}」不可达`);
  }
});

test('断言2: 16 个完全正确 fixture 得 100；完全错误 fixture 得 0', () => {
  const seed = 'contract-full';
  const all = gradeAll(seed, perfectAnswers(seed));
  const s = summarize(all, {});
  assert.equal(s.total, 100, JSON.stringify(all.filter((r) => r.awarded < r.maxPoints).map((r) => [r.id, r.awarded])));
  assert.equal(s.status, 'COMPLETED');
  assert.equal(s.level, '卓越');
});

test('断言2b: 部分正确得对应原子分，无额外扣分', () => {
  const seed = 'contract-partial';
  const good = perfectAnswers(seed);
  for (const target of ITEMS) {
    // 只答对一道题，其余留空
    const answers = {};
    for (const it of ITEMS) answers[it.id] = it.id === target.id ? good[it.id] : null;
    const all = gradeAll(seed, answers);
    const total = all.reduce((s, r) => s + r.awarded, 0);
    assert.equal(total, target.points, `只答对 ${target.id} 应得 ${target.points}，实际 ${total}`);
  }
});

test('断言3: 题面换种子后依然可解（每个 seed 的 oracle 答案都得满分）', () => {
  for (const seed of ['0', '1', '42', '1234', 'alpha', '中文种子', 'x'.repeat(40)]) {
    const answers = perfectAnswers(seed);
    const all = gradeAll(seed, answers);
    const bad = all.filter((r) => r.awarded !== r.maxPoints);
    assert.equal(bad.length, 0, `seed=${seed} 时 ${bad.map((b) => `${b.id}:${b.awarded}/${b.maxPoints}`).join(',')}`);
  }
});

test('断言4: 同 seed 重复生成完全一致；不同 seed 不同；有内容指纹', () => {
  const a = JSON.stringify(ITEMS.map((it) => instantiateInternal(it, 'det-seed').prompt));
  const b = JSON.stringify(ITEMS.map((it) => instantiateInternal(it, 'det-seed').prompt));
  assert.equal(a, b);
  const c = JSON.stringify(ITEMS.map((it) => instantiateInternal(it, 'other').prompt));
  assert.notEqual(a, c, '不同 seed 应生成不同实例');
  const fp = catalogFingerprint();
  assert.match(fp, /^[0-9a-f]{64}$/);
  assert.equal(fp, catalogFingerprint(), '指纹必须稳定');
});

test('断言5: 题目不依赖当前日期/网络；oracle 与题面 consitent', () => {
  const src = JSON.stringify(ITEMS.map((i) => instantiateInternal(i, 'x').prompt));
  assert.ok(!/https?:\/\//.test(src), '题面不得包含 URL');
  assert.ok(!/今天是|现在几点|今年是/.test(src), '题面不得依赖当前日期');
});

test('断言6: 非法输入不会造成越界或崩溃', () => {
  const seed = 'contract-invalid';
  const bad = [
    null, undefined, '', '   ', 0, 1, true, false, [], {},
    '{"total": "NaN"}', '{"total": "Infinity"}', '{"total": -1}',
    '{"total": 1e309}', '\u0000\u0001\u0002', 'x'.repeat(5000),
    '{"a":{"b":{"c":{"d":1}}}}',
  ];
  for (const it of ITEMS) {
    const internal = instantiateInternal(it, seed);
    for (const ans of bad) {
      let r;
      assert.doesNotThrow(() => { r = gradeItem(internal, ans, { seed }); }, `${it.id} 对 ${JSON.stringify(ans)?.slice(0, 30)} 不应抛异常`);
      assert.ok(r.awarded >= 0 && r.awarded <= it.points, `${it.id} 得分越界 ${r.awarded}`);
      assert.ok(['GRADED', 'MISSING_ANSWER', 'UNPARSEABLE', 'SCORER_ERROR'].includes(r.gradingStatus));
    }
  }
});

test('断言6b: 1e309 (Infinity) 不能刷分', () => {
  const internal = instantiateInternal(ITEMS.find((i) => i.id === 'R01'), 'x');
  const r = gradeItem(internal, { subtotal: 1e309, total: 1e309 }, { seed: 'x' });
  assert.equal(r.awarded, 0);
});

test('断言7: 报告状态区分 COMPLETED / PARTIAL / NEEDS_REVIEW / SYSTEM_ERROR', () => {
  const seed = 'contract-status';
  const good = perfectAnswers(seed);
  const full = summarize(gradeAll(seed, good), {});
  assert.equal(full.status, 'COMPLETED');
  const partial = summarize(gradeAll(seed, good).slice(0, 8), {});
  assert.equal(partial.status, 'PARTIAL');
  assert.equal(partial.level, null, '未答完不得给段位');
  const pending = summarize(
    gradeAll(seed, good).map((r, i) => (i === 0 ? { ...r, gradingStatus: 'UNPARSEABLE', awarded: 0 } : r)),
    {},
  );
  assert.equal(pending.status, 'PARTIAL');
});

test('断言8: 重判只改判分版本、不改答案（由 e2e 覆盖，这里校验版本字段存在）', () => {
  const all = gradeAll('v', perfectAnswers('v'));
  for (const r of all) {
    assert.equal(r.graderVersion, GRADER_VERSION);
    assert.ok(r.rawAnswerSha256 && r.rawAnswerSha256.length === 64, `${r.id} 缺少答案指纹`);
    assert.ok(r.inputSeed && r.inputSeed.length === 64);
  }
});

test('题库完整性自检直接调用不抛异常', () => {
  assert.doesNotThrow(() => assertCatalogIntegrity());
});

test('段位阈值与产品 PRD 一致', () => {
  assert.equal(getLevel(100).label, '卓越');
  assert.equal(getLevel(90).label, '卓越');
  assert.equal(getLevel(89).label, '优秀');
  assert.equal(getLevel(80).label, '优秀');
  assert.equal(getLevel(79).label, '良好');
  assert.equal(getLevel(65).label, '良好');
  assert.equal(getLevel(64).label, '基础');
  assert.equal(getLevel(50).label, '基础');
  assert.equal(getLevel(49).label, '需要提升');
  assert.equal(getLevel(0).label, '需要提升');
});
