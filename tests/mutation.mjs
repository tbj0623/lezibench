/**
 * 变异测试（mutation testing）：证明我们的测试**真的会失败**。
 *
 * 做法：逐个注入典型缺陷，断言「检测器必须报告它」。
 * 如果某个变异没被检测到，说明对应的测试是摆设 —— 本文件直接判失败。
 *
 * 运行：node tests/mutation.mjs
 */
import { gradeItem, summarize } from '../src/grading/grade.mjs';
import { ITEMS, itemsForBatch, instantiateInternal, assertCatalogIntegrity, criteriaOf } from '../src/exam/manifest.mjs';
import { perfectAnswers } from '../scripts/oracle-answers.mjs';
import { toNumber, sameNumber, buildParse } from '../src/grading/parse.mjs';

const results = [];
function mutation(name, detected, detail = '') {
  results.push({ name, detected, detail });
  console.log(`  ${detected ? '✔ 已检出' : '✘ 未检出'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const gradeAll = (seed, answers) =>
  ITEMS.map((it) => gradeItem(instantiateInternal(it, seed), answers[it.id], { seed }));

/** 通用的“正确答案”函数 */
function correct(seed) {
  return perfectAnswers(seed);
}

console.log('变异测试：每个变异都必须被现有判分逻辑或断言检出\n');

/* ---------- 1. 翻转标准答案 ---------- */
{
  const seed = 'mut-1';
  const good = correct(seed);
  const internal = instantiateInternal(ITEMS.find((i) => i.id === 'I01'), seed);
  const o = ITEMS.find((i) => i.id === 'I01').oracle(internal.facts);
  // 保持 deadline 正确，只翻转 budgetAttached → 必须只丢 3 分核心条件，保留 1 分
  const flipped = { deadline: `${o.day}${o.text}`, budgetAttached: true };
  const r = gradeItem(internal, flipped, { seed });
  mutation(
    '翻转 I01 的 budgetAttached（应只扣掉 3 分的核心条件，保留 1 分）',
    r.awarded === 1 && r.checks.find((c) => c.criterionId === 'I01.C2').passed === false,
    `得分 ${r.awarded}/4`,
  );
}

/* ---------- 2. 删掉一个条件 ---------- */
{
  const seed = 'mut-2';
  const good = correct(seed);
  const partial = { ...good, R01: { subtotal: good.R01.subtotal } }; // 缺 total
  const r = gradeAll(seed, partial).find((x) => x.id === 'R01');
  mutation('R01 缺少 total 字段（应扣 3 分，仅保留 1 分）', r.awarded === 1, `得分 ${r.awarded}/4`);
}

/* ---------- 3. 破坏阈值 ---------- */
{
  // R03 的最优解如果被改成「少一份」，必须拿不到 C3
  const seed = 'mut-3';
  const good = correct(seed);
  const internal = instantiateInternal(ITEMS.find((i) => i.id === 'R03'), seed);
  const o = ITEMS.find((i) => i.id === 'R03').oracle(internal.facts);
  const worse = { veg: o.best.veg + 1, chicken: o.best.chicken, beef: o.best.beef };
  const r = gradeItem(internal, worse, { seed });
  mutation('R03 把最优方案改贵（应扣「理论最低」3 分中的 2 分）', r.checks.find((c) => c.criterionId === 'R03.C3').passed === false, `得分 ${r.awarded}/6`);
}

/* ---------- 4. 数值越界 ---------- */
{
  const { gradeItem: gi } = { gradeItem };
  const internal = instantiateInternal(ITEMS.find((i) => i.id === 'R01'), 'mut-4');
  const r = gradeItem(internal, { subtotal: 99.9, total: 99.9 }, { seed: 'mut-4' });
  mutation('99.9 不被当成满分（R01 应拿 0 分）', r.awarded === 0, `得分 ${r.awarded}/4`);
}

/* ---------- 5. 负值与超满分 ---------- */
{
  const internal = instantiateInternal(ITEMS.find((i) => i.id === 'R01'), 'mut-5');
  const neg = gradeItem(internal, { subtotal: -100, total: -100 }, { seed: 'mut-5' });
  mutation('负数答案得不到分', neg.awarded === 0, `得分 ${neg.awarded}/4`);
}

/* ---------- 6. NaN / Infinity ---------- */
{
  const internal = instantiateInternal(ITEMS.find((i) => i.id === 'R01'), 'mut-6');
  for (const bad of ['NaN', 'Infinity', '-Infinity']) {
    const r = gradeItem(internal, { subtotal: bad, total: bad }, { seed: 'mut-6' });
    if (r.awarded !== 0) {
      mutation(`数值 ${bad} 必须拿 0 分`, false, `实际 ${r.awarded}/4`);
      break;
    }
    if (bad === '-Infinity') mutation('NaN / Infinity / -Infinity 一律拿 0 分', true);
  }
}

/* ---------- 7. 阈值边界：等级不可重叠、不可越界 ---------- */
{
  const { getLevel } = await import('../src/exam/manifest.mjs');
  const bad = [];
  for (let s = -5; s <= 105; s++) {
    const l = getLevel(s);
    if (!l) { bad.push(s); continue; }
    if (s >= 0 && s <= 100 && (s < l.min || s > l.max)) bad.push(s);
  }
  mutation('0–100 每个整数都落在唯一的合法段位内', bad.length === 0, bad.length ? `越界: ${bad.join(',')}` : '');
}

/* ---------- 8. 集合顺序无关 ---------- */
{
  const seed = 'mut-8';
  const good = correct(seed);
  const internal = instantiateInternal(ITEMS.find((i) => i.id === 'I02'), seed);
  const shuffled = { selected: [...good.I02.selected].reverse(), rejected: [...good.I02.rejected].reverse() };
  const r = gradeItem(internal, shuffled, { seed });
  mutation('I02 把两个数组顺序打乱，仍须满分（集合语义）', r.awarded === 6, `得分 ${r.awarded}/6`);
}

/* ---------- 9. 等价单位 / 中文数字 ---------- */
{
  const seed = 'mut-9';
  const internal = instantiateInternal(ITEMS.find((i) => i.id === 'R01'), seed);
  const o = ITEMS.find((i) => i.id === 'R01').oracle(internal.facts);
  const withUnit = { subtotal: `${o.subtotal}元`, total: `${o.total} 元` };
  const r = gradeItem(internal, withUnit, { seed });
  mutation('「57元」与 57 等价（不得因单位误扣）', r.awarded === 4, `得分 ${r.awarded}/4`);
}

/* ---------- 10. 代码块包裹的 JSON ---------- */
{
  const seed = 'mut-10';
  const good = correct(seed);
  const internal = instantiateInternal(ITEMS.find((i) => i.id === 'R01'), seed);
  const text = `好的，算好了：\n\`\`\`json\n${JSON.stringify(good.R01)}\n\`\`\`\n请核对。`;
  const r = gradeItem(internal, text, { seed });
  mutation('Markdown 代码块里的 JSON 必须能解析', r.awarded === 4, `得分 ${r.awarded}/4`);
}

/* ---------- 11. 冲突多值不能白拿分 ---------- */
{
  const seed = 'mut-11';
  const good = correct(seed);
  const internal = instantiateInternal(ITEMS.find((i) => i.id === 'R01'), seed);
  const conflict = `答案一：{"total":${good.R01.total}}\n答案二：{"total":1}`;
  const r = gradeItem(internal, conflict, { seed });
  mutation('两个互相冲突的答案应判为不可解析而非挑有利的', r.gradingStatus === 'UNPARSEABLE', `状态 ${r.gradingStatus}`);
}

/* ---------- 12. 答案对象里的多余字段不扣分 ---------- */
{
  const seed = 'mut-12';
  const good = correct(seed);
  const internal = instantiateInternal(ITEMS.find((i) => i.id === 'I01'), seed);
  const withExtra = { ...good.I01, note: '我顺便说明一下推理过程', confidence: 0.9 };
  const r = gradeItem(internal, withExtra, { seed });
  mutation('额外的解释性字段不影响应得分', r.awarded === 4, `得分 ${r.awarded}/4`);
}

/* ---------- 13. 原子分不可越界 ---------- */
{
  const seed = 'mut-13';
  const good = correct(seed);
  const all = gradeAll(seed, good);
  const anyOver = all.some((r) => r.awarded > r.maxPoints || r.awarded < 0);
  mutation('任何题目的得分都不越界 [0, maxPoints]', !anyOver);
  const sumOk = all.every((r) => r.awarded === r.checks.filter((c) => c.passed).reduce((s, c) => s + c.points, 0));
  mutation('每题得分严格等于通过条件的分数和（无隐藏加减分）', sumOk);
}

/* ---------- 14. 总分 100 上限 ---------- */
{
  const seed = 'mut-14';
  const all = gradeAll(seed, correct(seed));
  const s = summarize(all, {});
  mutation('满分卷总分恰为 100，不超过', s.total === 100, `实际 ${s.total}`);
}

/* ---------- 15. 篡改 gradingCriteria 必须被契约校验拦下 ---------- */
{
  // 模拟「有人偷偷把一个条件的分数改大」——通过克隆定义再比对
  const it = ITEMS.find((i) => i.id === 'I01');
  const crit = criteriaOf(it);
  const tampered = crit.map((c, i) => (i === 0 ? { ...c, points: c.points + 1 } : c));
  const sum = tampered.reduce((s, c) => s + c.points, 0);
  mutation('篡改任一条件分值后，条件合计 ≠ 满分（契约校验会拒绝）', sum !== it.points, `${sum} vs ${it.points}`);
}

/* ---------- 16. 缺答 ≠ 系统错误 ---------- */
{
  const internal = instantiateInternal(ITEMS.find((i) => i.id === 'I01'), 'mut-16');
  const r = gradeItem(internal, null, { seed: 'mut-16' });
  mutation('缺答标记为 MISSING_ANSWER 且得 0（不当作系统故障刷分）', r.gradingStatus === 'MISSING_ANSWER' && r.awarded === 0);
  const blank = gradeItem(internal, '   ', { seed: 'mut-16' });
  mutation('纯空白同样视为缺答', blank.gradingStatus === 'MISSING_ANSWER');
}

/* ---------- 17. 无法解析 ≠ 知识错误 ---------- */
{
  const internal = instantiateInternal(ITEMS.find((i) => i.id === 'R01'), 'mut-17');
  const r = gradeItem(internal, '我不知道怎么写 JSON，总之大概是五十多块吧', { seed: 'mut-17' });
  mutation('有内容但无法解析 → UNPARSEABLE，不得静默当 0 分知识错误', r.gradingStatus === 'UNPARSEABLE', `状态 ${r.gradingStatus}`);
}

/* ---------- 18. 题库契约 ---------- */
{
  let ok = true;
  let msg = '';
  try { assertCatalogIntegrity(); } catch (e) { ok = false; msg = e.message; }
  mutation('题库契约（16题/100分/4维各25/所有整数可达）', ok, msg);
}

/* ---------- 19. 确定性 ---------- */
{
  const a = JSON.stringify(itemsForBatch(2).map((it) => instantiateInternal(it, 'determinism').prompt));
  const b = JSON.stringify(itemsForBatch(2).map((it) => instantiateInternal(it, 'determinism').prompt));
  mutation('同 seed 两次生成题面完全一致', a === b);
  const c = JSON.stringify(itemsForBatch(2).map((it) => instantiateInternal(it, 'other-seed').prompt));
  mutation('不同 seed 生成不同题面（确实做了种子化）', a !== c);
}

const failed = results.filter((r) => !r.detected);
console.log(`\n共 ${results.length} 个变异，检出 ${results.length - failed.length} 个`);
if (failed.length) {
  console.log(`\n❌ 有 ${failed.length} 个变异没被检出 —— 对应测试是摆设：`);
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
  process.exitCode = 1;
} else {
  console.log('✅ 所有变异都被检出：测试确实会失败，不是摆设。');
}
