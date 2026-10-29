/**
 * 等价写法 / 对抗写法测试（v1.3.0 起为**通用实现**，不依赖任何一道题的具体字段）
 * ------------------------------------------------------------------
 * 这类 bug 的共同点：**答案本身是对的，但换了种写法就被判错**。
 *   · 交 JSON 字符串而不是对象 → 判 0
 *   · 用 ```json 代码块包起来 → 判 0
 *   · 答案前后带解释文字 → 判 0
 *
 * 反过来也要测：**看起来能糊弄的答案不能得分**
 *   · 空对象、只填一个字段、字段值全错 → 必须掉分
 *
 * 为什么改成通用实现：
 *   旧版按题写死了 `veg/chicken/beef`、`startCode/endCode` 这些字段名，
 *   题目一改（R03 从 3 种餐盒变成 6 种模块）整批就失效。
 *   现在只依赖 `perfectAnswers()` 和结构无关的包装方式，
 *   题目怎么改都不用动这个文件。
 *   旧版实现归档在 `evidence/superseded/equivalence-v1_2_0.test.mjs`。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, instantiateInternal } from '../src/exam/manifest.mjs';
import { gradeItem } from '../src/grading/grade.mjs';
import { perfectAnswers } from '../scripts/oracle-answers.mjs';

const SEED = 'equiv-v13';
const byId = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

/** 按 seed 缓存标准答案（perfectAnswers 会生成全部 16 题，不要放在循环里重复调用） */
const ANSWERS = perfectAnswers(SEED);

const grade = (id, answer) => gradeItem(instantiateInternal(byId[id], SEED), answer, { seed: SEED });

/** 把答案包成几种「合法但形式不同」的写法 */
function wrappings(answer) {
  const json = JSON.stringify(answer);
  return [
    ['对象', answer],
    ['JSON 字符串', json],
    ['Markdown 代码块', '```json\n' + json + '\n```'],
    ['前后带解释文字', `我的答案是：\n${json}\n（以上为最终结果）`],
    ['首尾带空白', `   \n${json}\n   `],
  ];
}

/* ==================================================================== *
 * 一、等价写法：只要是同一份答案，换个包装必须照样满分
 * ==================================================================== */

for (const item of ITEMS) {
  test(`${item.id} 等价写法：换包装不得丢分`, () => {
    const correct = ANSWERS[item.id];
    assert.ok(correct, `${item.id} 没有标准答案`);
    for (const [label, wrapped] of wrappings(correct)) {
      const r = grade(item.id, wrapped);
      assert.equal(r.awarded, item.points, `${item.id} 用「${label}」形式提交只拿到 ${r.awarded}/${item.points}`);
    }
  });
}

/* ==================================================================== *
 * 二、对抗写法：糊弄不过去的答案必须掉分
 * ==================================================================== */

function bad(v) {
  if (typeof v === 'number') return v + 1;
  if (typeof v === 'boolean') return !v;
  if (typeof v === 'string') {
    if (/^[A-Z]$/.test(v)) return v === 'Z' ? 'Y' : 'Z';
    if (/^\d+$/.test(v)) return String(Number(v) + 1);
    return '错误值';
  }
  return v;
}

/** 深拷贝 + 把每个标量改成错值 */
function corruptAll(answer) {
  const clone = JSON.parse(JSON.stringify(answer));
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        if (node[i] && typeof node[i] === 'object') walk(node[i]);
        else node[i] = bad(node[i]);
      }
      return;
    }
    if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) {
        if (node[k] && typeof node[k] === 'object') walk(node[k]);
        else node[k] = bad(node[k]);
      }
    }
  };
  walk(clone);
  return clone;
}


for (const item of ITEMS) {
  test(`${item.id} 对抗写法：空对象/全错必须掉分`, () => {
    const correct = ANSWERS[item.id];

    // 空对象必须 0 分
    const empty = grade(item.id, {});
    assert.equal(empty.awarded, 0, `${item.id} 交空对象得了 ${empty.awarded}/${item.points}`);

    // 所有字段都改成错值，必须掉分
    const wrong = grade(item.id, corruptAll(correct));
    assert.ok(wrong.awarded < item.points, `${item.id} 把所有字段改错仍拿满分（${wrong.awarded}/${item.points}）`);

    // 注意：这里**不测「只填一个字段」**。
    // 有些题的答案是单一字段（D01 就只有 list），有些题字段间是冗余等价关系
    //（R02 的 first/last 与 order 的首尾必须一致，只给 order 也算完整作答）。
    // 那种断言会变成「惩罚合法的简洁写法」，不是本书要测的东西。
    // 逐字段破坏的严格检查在 tests/golden-fixtures.test.mjs 的「反自证」一节。
  });
}

/* ==================================================================== *
 * 三、边界：空串 / 乱码 必须被识别成 MISSING / UNPARSEABLE，而不是崩
 * ==================================================================== */

test('边界：空答案标记为 MISSING_ANSWER，乱码标记为 UNPARSEABLE', () => {
  for (const item of ITEMS) {
    const empty = grade(item.id, '');
    assert.equal(empty.gradingStatus, 'MISSING_ANSWER', `${item.id} 空答案状态为 ${empty.gradingStatus}`);
    const junk = grade(item.id, '###??? ###');
    assert.equal(junk.gradingStatus, 'UNPARSEABLE', `${item.id} 乱码状态为 ${junk.gradingStatus}`);
  }
});

test('边界：垃圾输入不得让判分器抛异常', () => {
  const garbage = [null, undefined, [], [1, 2, 3], 'null', '[]', '{"a":', 'x'.repeat(10000), 0, true];
  for (const item of ITEMS) {
    for (const g of garbage) {
      assert.doesNotThrow(() => grade(item.id, g), `${item.id} 对 ${String(g).slice(0, 12)} 抛异常`);
    }
  }
});
