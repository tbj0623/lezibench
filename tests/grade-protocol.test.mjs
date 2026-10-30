/**
 * 判分器「评分协议自检」单元测试（node --test）。
 *
 * 背景（v1.4 P0-C 真实缺陷）：
 *   旧实现用 `new Map(checks.map(c => [c.criterionId, c]))` 归一化 item.grade() 的返回，
 *   于是额外条件被静默忽略、重复条件后写覆盖先写、`passed:'true'` 被 `=== true`
 *   悄悄折成 false、空 reason 照收。结果是**判分器自己的程序错误照样产出 GRADED 的可信成绩**，
 *   报告上看起来一切正常 —— 这是最危险的一类假阴性。
 *
 * 本文件锁死的行为：任何不合契约的 grade() 返回都必须变成 SCORER_ERROR、
 * 不得抛未捕获异常、不得产出 GRADED。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeItem, summarize, validateGradingChecks } from '../src/grading/grade.mjs';

/** 最小可用的题目内部对象：parse 恒成功，grade 返回给定 checks */
function stubInternal(checksFactory, criteria = [
  { id: 'AUD.C1', points: 1, text: '条件1' },
  { id: 'AUD.C2', points: 3, text: '条件2' },
]) {
  const item = {
    id: 'AUD',
    points: 4,
    dimension: 'instruction',
    title: '协议自检桩',
    parse: () => ({ fields: { answer: 'hello' }, problems: [], source: 'object' }),
    grade: checksFactory,
  };
  return { item, facts: {}, schema: {}, publicCriteria: criteria };
}

const GOOD = [
  { criterionId: 'AUD.C1', points: 1, passed: true, reason: '明确满足条件1' },
  { criterionId: 'AUD.C2', points: 3, passed: false, reason: '明确不满足条件2' },
];

function run(checks) {
  return gradeItem(stubInternal(() => checks), { answer: 'hello' }, { seed: 'test' });
}

// ── 合规返回：必须正常判分 ────────────────────────────────────────────────

test('grade 协议：合规返回正常判 GRADED 且按公开条件顺序输出', () => {
  const r = run(GOOD);
  assert.equal(r.gradingStatus, 'GRADED');
  assert.equal(r.awarded, 1);
  assert.deepEqual(r.checks.map((c) => c.criterionId), ['AUD.C1', 'AUD.C2']);
  assert.equal(r.checks[0].reason, '明确满足条件1');
});

test('grade 协议：检查项返回顺序打乱不影响得分与输出顺序', () => {
  const r = run([GOOD[1], GOOD[0]]);
  assert.equal(r.gradingStatus, 'GRADED');
  assert.equal(r.awarded, 1);
  assert.deepEqual(r.checks.map((c) => c.criterionId), ['AUD.C1', 'AUD.C2']);
});

test('grade 协议：全对给满分、全错给 0 分，且都是 GRADED', () => {
  const full = gradeItem(
    stubInternal(() => GOOD.map((c) => ({ ...c, passed: true }))),
    { answer: 'hello' }, { seed: 't' });
  assert.equal(full.awarded, 4);
  assert.equal(full.gradingStatus, 'GRADED');

  const zero = gradeItem(
    stubInternal(() => GOOD.map((c) => ({ ...c, passed: false }))),
    { answer: 'hello' }, { seed: 't' });
  assert.equal(zero.awarded, 0);
  assert.equal(zero.gradingStatus, 'GRADED');
});

// ── 不合规返回：一律 SCORER_ERROR，绝不给可信成绩 ────────────────────────

const BAD_CASES = [
  ['额外条件 ID', [...GOOD, { criterionId: 'AUD.X', points: 1, passed: true, reason: '多余的' }]],
  ['重复条件 ID', [...GOOD, GOOD[0]]],
  ['缺少条件 ID', [GOOD[0]]],
  ['分值被篡改', [{ ...GOOD[0], points: 9 }, GOOD[1]]],
  ['空理由', [{ ...GOOD[0], reason: '' }, GOOD[1]]],
  ['只有空白的理由', [{ ...GOOD[0], reason: '   ' }, GOOD[1]]],
  ['passed 是字符串 true', [{ ...GOOD[0], passed: 'true' }, GOOD[1]]],
  ['passed 是 1', [{ ...GOOD[0], passed: 1 }, GOOD[1]]],
  ['passed 是 undefined', [{ ...GOOD[0], passed: undefined }, GOOD[1]]],
  ['reason 不是字符串', [{ ...GOOD[0], reason: 42 }, GOOD[1]]],
  ['points 是非整数', [{ ...GOOD[0], points: 1.5 }, GOOD[1]]],
  ['返回 null', null],
  ['返回 undefined', undefined],
  ['返回对象而非数组', { AUD: GOOD }],
  ['数组里混入 null', [null, GOOD[1]]],
  ['criterionId 为空串', [{ ...GOOD[0], criterionId: '' }, GOOD[1]]],
];

for (const [label, checks] of BAD_CASES) {
  test(`grade 协议：${label} → SCORER_ERROR，不得 GRADED`, () => {
    const r = run(checks);
    assert.equal(r.gradingStatus, 'SCORER_ERROR', `${label} 必须被识别为评分器协议错误`);
    assert.equal(r.awarded, 0, `${label} 不得发放任何分数`);
    assert.ok(Array.isArray(r.scorerProblems) && r.scorerProblems.length > 0, '必须留下可复核的问题清单');
    assert.ok(r.checks.every((c) => c.passed === false), '不给分时所有条件都应为未通过');
    assert.ok(r.checks.every((c) => c.reason.trim().length > 0), '即便不给分，每条也要有可读理由');
  });
}

test('grade 协议：grade() 抛异常 → SCORER_ERROR，且不向上抛', () => {
  const internal = stubInternal(() => { throw new Error('内部炸了'); });
  let r;
  assert.doesNotThrow(() => { r = gradeItem(internal, { answer: 'hello' }, { seed: 't' }); });
  assert.equal(r.gradingStatus, 'SCORER_ERROR');
  assert.equal(r.awarded, 0);
  assert.match(r.parseNotes.join(' '), /内部炸了/);
});

test('grade 协议：一条非法就整体作废，不许「其余合法条件照拿分」', () => {
  // C1 完全正确、C2 正确，但多出一条非法 ID —— 也不能给分
  const r = run([...GOOD, { criterionId: 'AUD.HACK', points: 0, passed: true, reason: '偷偷加一条' }]);
  assert.equal(r.gradingStatus, 'SCORER_ERROR');
  assert.equal(r.awarded, 0);
});

// ── 与 summarize 的联动：协议错误必须阻断正式段位 ────────────────────────

test('summarize：出现 SCORER_ERROR 时整体 SYSTEM_ERROR，不给段位', () => {
  const bad = run([GOOD[0]]); // 缺条件 → SCORER_ERROR
  const goodInternal = stubInternal(() => GOOD);
  const good = gradeItem(goodInternal, { answer: 'hello' }, { seed: 't' });
  assert.equal(good.gradingStatus, 'GRADED');

  const s = summarize([bad, good], { expectTotal: 2, examVersion: 'test', seed: 't', runId: 'r' });
  assert.equal(s.status, 'SYSTEM_ERROR');
  assert.equal(s.completed, false);
  assert.equal(s.level, null, '系统异常不得给出正式段位');
});

// ── validateGradingChecks 直接单测（导出的公共契约函数） ──────────────────

test('validateGradingChecks：合规返回问题数为 0', () => {
  const criteria = [{ id: 'A', points: 2 }, { id: 'B', points: 2 }];
  assert.deepEqual(validateGradingChecks([
    { criterionId: 'A', points: 2, passed: true, reason: 'ok' },
    { criterionId: 'B', points: 2, passed: false, reason: 'no' },
  ], criteria), []);
});

test('validateGradingChecks：能同时报出多个问题，而不是只报第一个', () => {
  const criteria = [{ id: 'A', points: 2 }, { id: 'B', points: 2 }];
  const problems = validateGradingChecks([
    { criterionId: 'A', points: 5, passed: 'yes', reason: '' },
    { criterionId: 'C', points: 2, passed: true, reason: 'x' },
  ], criteria);
  assert.ok(problems.length >= 5, `应报出多个问题，实际 ${problems.length}: ${problems.join(' | ')}`);
  assert.ok(problems.some((p) => /分值被篡改/.test(p)));
  assert.ok(problems.some((p) => /passed 不是布尔值/.test(p)));
  assert.ok(problems.some((p) => /缺少非空的可读理由/.test(p)));
  assert.ok(problems.some((p) => /公开条件之外/.test(p)));
  assert.ok(problems.some((p) => /缺少公开条件 B/.test(p)));
});
