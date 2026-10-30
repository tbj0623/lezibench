/**
 * 评分理由「诚实性」守卫（node --test）
 *
 * 背景（v1.4 实测抓到的真实缺陷）：
 *   我拿一份故意乱填的答案跑 CLI，看到这样一条失分理由：
 *
 *       ✘ I01.C2 附件要求判断错误：应为 不附，实际为 不附
 *
 *   「应为 X，实际为 X」却判不通过 —— 用户看到这条会直接怀疑判分器。
 *   根因是 `toBool()` 对「字段缺失」返回 `null`，而代码里用 `b === undefined` 判断缺失，
 *   那个分支永远不会命中，于是掉进了「值不等」的措辞里，把 null 渲染成「不附」。
 *
 * 这个文件不看具体某道题，而是**对全部 16 题 × 多个 seed × 逐个删除字段**做泛化检查：
 *   1. 理由不能出现 `null` / `undefined` / `NaN` 这类内部实现泄漏；
 *   2. 理由不能自相矛盾（「应为 A，实际为 A」但判失败）；
 *   3. 无论怎么缺字段，判分都不得抛异常，且必须给出可读理由。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, instantiateInternal } from '../src/exam/manifest.mjs';
import { gradeItem } from '../src/grading/grade.mjs';
import { perfectAnswers } from '../scripts/oracle-answers.mjs';

const SEEDS = ['reason-a', 'reason-b', 'reason-c'];

/** 从完美答案里删掉一个字段，制造「部分字段缺失」的答卷 */
function dropField(answer, key) {
  if (Array.isArray(answer)) return answer;
  if (answer === null || typeof answer !== 'object') return answer;
  const copy = { ...answer };
  delete copy[key];
  return copy;
}

/** 把任意值改成明显错误但类型合法的值 */
function corrupt(v) {
  if (typeof v === 'number') return v + 987;
  if (typeof v === 'boolean') return !v;
  if (typeof v === 'string') return '错误值';
  if (Array.isArray(v)) return v.length ? [] : ['错误项'];
  if (v && typeof v === 'object') return {};
  return '错误值';
}

const LEAK = /\b(undefined|null|NaN)\b/;
const CONTRADICTION = /应为\s*([^，,。；;]+)[，,]\s*实际为\s*([^，,。；;）)]+)/;

test('评分理由：任何缺字段/乱填都不得泄漏 undefined/null/NaN', () => {
  let checked = 0;
  for (const seed of SEEDS) {
    const answers = perfectAnswers(seed);
    for (const item of ITEMS) {
      const base = answers[item.id];
      const variants = [];

      // ① 全字段缺失：逐字段删
      if (base && typeof base === 'object' && !Array.isArray(base)) {
        for (const k of Object.keys(base)) variants.push(dropField(base, k));
        // ② 逐字段乱填
        for (const k of Object.keys(base)) {
          variants.push({ ...base, [k]: corrupt(base[k]) });
        }
      }
      // ③ 整体乱填
      variants.push(corrupt(base));

      for (const answer of variants) {
        const internal = instantiateInternal(item, seed);
        let r;
        assert.doesNotThrow(
          () => { r = gradeItem(internal, answer, { seed }); },
          `${item.id}/${seed} 判分抛异常`,
        );
        for (const c of r.checks) {
          checked++;
          assert.ok(
            typeof c.reason === 'string' && c.reason.trim().length > 0,
            `${item.id}.${c.criterionId} 理由为空`,
          );
          assert.ok(
            !LEAK.test(c.reason),
            `${item.id}.${c.criterionId} 理由泄漏内部值：「${c.reason}」  （输入 ${JSON.stringify(answer)}）`,
          );
          const m = c.reason.match(CONTRADICTION);
          if (m) {
            assert.notEqual(
              m[1].trim(), m[2].trim(),
              `${item.id}.${c.criterionId} 理由自相矛盾：「${c.reason}」（应为与实际相同却判不通过）`,
            );
          }
        }
      }
    }
  }
  assert.ok(checked > 500, `检查量过小（只有 ${checked} 条），守卫可能没生效`);
});

test('评分理由：字段缺失时必须说「缺少/未提供/未解析」，不能假装做了比较', () => {
  const item = ITEMS.find((i) => i.id === 'I01');
  const internal = instantiateInternal(item, 'reason-a');
  // 只给 deadline，不给 budgetAttached
  const r = gradeItem(internal, { deadline: '周二下午3点' }, { seed: 'reason-a' });
  const c2 = r.checks.find((c) => c.criterionId === 'I01.C2');
  assert.equal(c2.passed, false);
  assert.match(
    c2.reason, /缺少|未提供|未解析/,
    `字段缺失时理由必须说明是"缺少/未提供"，实际是：「${c2.reason}」`,
  );
  assert.doesNotMatch(c2.reason, /实际为 不附|实际为 需要附/, '字段缺失时不得编造"实际值"');
  assert.match(c2.reason, /budgetAttached/, '理由里要指出是哪个字段');
});

test('评分理由：字段写了但值无法识别时，要说是「无法解析」，不能说成「未提供」', () => {
  const item = ITEMS.find((i) => i.id === 'I01');
  const internal = instantiateInternal(item, 'reason-a');
  // 用户**确实**给了 budgetAttached，只是值没法识别 → 不能把责任说成「你没提供」
  const r = gradeItem(internal, { deadline: '周二下午3点', budgetAttached: '看情况吧' }, { seed: 'reason-a' });
  const c2 = r.checks.find((c) => c.criterionId === 'I01.C2');
  assert.equal(c2.passed, false);
  assert.doesNotMatch(
    c2.reason, /未提供/,
    `字段其实提供了（只是无法解析），不得说成"未提供"：「${c2.reason}」`,
  );
  assert.match(c2.reason, /无法解析|无法判定/, `应说明无法解析，实际：「${c2.reason}」`);
  assert.match(c2.reason, /budgetAttached/, '理由里要指出是哪个字段，便于复核');
  assert.doesNotMatch(c2.reason, /实际为 不附|实际为 需要附/, '不得编造"实际值"');
});
