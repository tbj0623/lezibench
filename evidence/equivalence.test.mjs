/**
 * LeziBench 红队等价答案测试（node --test）
 * ------------------------------------------------------------------
 * 覆盖全部 16 道题。每题：
 *   - ≥5 种「应得满分」的等价表达
 *   - ≥5 种「应当失分」的对抗表达（并断言具体挂掉的 criterion 合理）
 *   - ≥2 个边界用例（空 → 不崩；乱码 → UNPARSEABLE 而非静默 0 分）
 *
 * 纪律：每个断言都必须能在被测代码有 bug 时失败；不使用 assert(true)。
 * 运行：node --test qa/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, instantiateInternal, assertCatalogIntegrity } from '../src/exam/manifest.mjs';
import { gradeItem } from '../src/grading/grade.mjs';
import { perfectAnswers } from '../scripts/oracle-answers.mjs';

const SEED = '42';
const BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

/** 评分入口：统一 stringify 除纯文本外的答案 */
function grade(id, answer, seed = SEED) {
  const item = BY_ID[id];
  assert.ok(item, `未知题号 ${id}`);
  const internal = instantiateInternal(item, seed);
  const raw = typeof answer === 'string' ? answer : JSON.stringify(answer);
  return gradeItem(internal, raw, { seed });
}

function assertFull(id, answer, label, seed = SEED) {
  const item = BY_ID[id];
  const r = grade(id, answer, seed);
  const failed = r.checks.filter((c) => !c.passed).map((c) => `${c.criterionId}(${c.reason})`);
  assert.equal(
    r.gradingStatus,
    'GRADED',
    `${id} · ${label}：状态应为 GRADED，实际 ${r.gradingStatus}；parseNotes=${JSON.stringify(r.parseNotes)}`,
  );
  assert.equal(r.awarded, item.points, `${id} · ${label}：应得满分 ${item.points}，实际 ${r.awarded}；挂掉：${failed.join(' | ')}`);
  // 越界防护：任何情况下 awarded 都必须在 [0, maxPoints] 内
  assert.ok(r.awarded >= 0 && r.awarded <= r.maxPoints, `${id} · ${label}：awarded 越界 ${r.awarded}/${r.maxPoints}`);
}

/**
 * 断言「应当失分」：分数严格小于满分。
 * @param {string[]} expectFailed 期望挂掉的 criterion id（顺序无关的子集）
 */
function assertPartial(id, answer, label, expectFailed, seed = SEED) {
  const item = BY_ID[id];
  const r = grade(id, answer, seed);
  assert.ok(
    r.awarded < item.points,
    `${id} · ${label}：本应失分，却拿了满分 ${r.awarded}/${item.points}`,
  );
  assert.ok(r.awarded >= 0, `${id} · ${label}：awarded 为负 ${r.awarded}`);
  const actuallyFailed = r.checks.filter((c) => !c.passed).map((c) => c.criterionId);
  for (const cid of expectFailed) {
    assert.ok(
      actuallyFailed.includes(cid),
      `${id} · ${label}：期望 ${cid} 挂掉，实际挂掉的是 [${actuallyFailed.join(', ')}]；awarded=${r.awarded}`,
    );
  }
}

/** 期望的满分答案（用题目自己的 oracle，而非硬编码） */
function expected(id, seed = SEED) {
  const item = BY_ID[id];
  return item.oracle(instantiateInternal(item, seed).facts);
}

/** 官方「标准答案」转换器：模拟一个按题面 schema 作答的考生 */
function official(id, seed = SEED) {
  return perfectAnswers(seed)[id];
}

/* ==================================================================== */
test('题库契约与目录完整性', () => {
  assert.equal(ITEMS.length, 16, '题库必须是 16 题');
  assert.equal(assertCatalogIntegrity(), true);
  const total = ITEMS.reduce((s, i) => s + i.points, 0);
  assert.equal(total, 100, '总分必须是 100');
});

test('自洽性门槛：官方标准答案在基准 seed 上必须满分', () => {
  for (const item of ITEMS) {
    assertFull(item.id, official(item.id), '官方标准答案');
  }
});

/* ==================================================================== */
/* I01 —— 最后一条有效通知覆盖原计划                                    */
/* ==================================================================== */
test('I01 等价写法（应满分）', () => {
  const o = expected('I01');
  const answerText = `${o.day}${o.text}`;
  const variants = [
    ['标准 JSON 对象', { deadline: answerText, budgetAttached: false }],
    ['JSON 字符串', JSON.stringify({ deadline: answerText, budgetAttached: false })],
    ['Markdown 代码块', '```json\n' + JSON.stringify({ deadline: answerText, budgetAttached: false }) + '\n```'],
    ['行格式 Q: 值', `deadline: ${answerText}\nbudgetAttached: false`],
    ['带解释文字 + 嵌套代码块', `根据通知2和通知3，最终要求是：\n\`\`\`json\n${JSON.stringify({ deadline: answerText, budgetAttached: false })}\n\`\`\`\n以上就是答案。`],
    ['中文字段名', { 截止时间: answerText, 预算表: '不需要' }],
    ['英文雪花键名', { finalDeadline: answerText, attachBudget: 'no' }],
    ['budget=false 用中文否定词', { deadline: answerText, budgetAttached: '不附' }],
  ];
  for (const [label, ans] of variants) assertFull('I01', ans, label);
});

test('I01 对抗写法（应失分）', () => {
  const o = expected('I01');
  const good = `${o.day}${o.text}`;
  const wrongDay = o.day === '周三' ? '周四' : '周三';
  assertPartial('I01', { deadline: `${wrongDay}${o.text}`, budgetAttached: false }, '日期错', ['I01.C1']);
  assertPartial('I01', { deadline: `${o.day}中午12点`, budgetAttached: false }, '用了通知1的时段', ['I01.C1']);
  assertPartial('I01', { deadline: good, budgetAttached: true }, '附件要求错（仍说附预算表）', ['I01.C2']);
  assertPartial('I01', { deadline: good }, '缺 budgetAttached 字段', ['I01.C2']);
  assertPartial('I01', { deadline: '周二中午12点', budgetAttached: true }, '两条都错', ['I01.C1', 'I01.C2']);
  // 关键：criteria 文本字面说「含周三、上午」，但正确答案可能是周四/下午 —— 见 AMBIGUITY_REPORT I01
});

test('I01 边界：空答案与乱码', () => {
  const empty = grade('I01', '   ');
  assert.equal(empty.gradingStatus, 'MISSING_ANSWER', '空白答案应为 MISSING_ANSWER');
  assert.equal(empty.awarded, 0);
  const junk = grade('I01', 'asdkjhqwe@@@!!!');
  assert.equal(junk.gradingStatus, 'UNPARSEABLE', `乱码应为 UNPARSEABLE，实际 ${junk.gradingStatus}`);
  assert.equal(junk.awarded, 0);
});

/* ==================================================================== */
/* I02 —— 白名单 + 例外 + 状态过滤                                       */
/* ==================================================================== */
test('I02 等价写法（应满分）', () => {
  const o = expected('I02');
  const variants = [
    ['标准 JSON 对象', { selected: o.selected, rejected: o.rejected }],
    ['JSON 字符串', JSON.stringify({ selected: o.selected, rejected: o.rejected })],
    ['Markdown 代码块', '```json\n' + JSON.stringify({ selected: o.selected, rejected: o.rejected }) + '\n```'],
    ['顺序颠倒', { selected: [...o.selected].reverse(), rejected: [...o.rejected].reverse() }],
    ['小写编码 + 空格', { selected: o.selected.map((s) => s.toLowerCase()), rejected: o.rejected.map((s) => ` ${s} `) }],
    ['逗号分隔字符串', { selected: o.selected.join(','), rejected: o.rejected.join('，') }],
    ['中文字段名', { 上架: o.selected, 不上架: o.rejected }],
    ['带解释文字', `按规则筛选后：\n${JSON.stringify({ selected: o.selected, rejected: o.rejected })}\n（顺序不限）`],
  ];
  for (const [label, ans] of variants) assertFull('I02', ans, label);
});

test('I02 对抗写法（应失分）', () => {
  const o = expected('I02');
  assertPartial('I02', { selected: o.selected.slice(1), rejected: o.rejected }, '上架组漏一个', ['I02.C1']);
  assertPartial('I02', { selected: [...o.selected, o.rejected[0]], rejected: o.rejected.slice(1) }, '上架组多放一个', ['I02.C2']);
  assertPartial('I02', { selected: o.selected, rejected: o.rejected.slice(1) }, '不上架组漏一个', ['I02.C3']);
  assertPartial('I02', { selected: o.selected }, '缺 rejected 整组', ['I02.C3']);
  assertPartial('I02', { selected: [], rejected: [] }, '两组都空', ['I02.C1', 'I02.C2', 'I02.C3']);
  // 每个码必须且只能出现在一组 —— 同一码同时出现在两组应失败
  assertPartial('I02', { selected: o.selected, rejected: [...o.rejected, o.selected[0]] }, '同一码重复出现在两组', ['I02.C3']);
});

test('I02 边界：空答案与乱码', () => {
  assert.equal(grade('I02', '').gradingStatus, 'MISSING_ANSWER');
  assert.equal(grade('I02', '随机文字 @@ 没有编码').gradingStatus, 'UNPARSEABLE');
});

/* ==================================================================== */
/* I03 —— 多条件优先级与例外                                            */
/* ==================================================================== */
test('I03 等价写法（应满分）', () => {
  const o = expected('I03');
  const variants = [
    ['标准 JSON 对象', { rule: o.rule, decision: o.decision, escalate: o.escalate }],
    ['JSON 字符串', JSON.stringify({ rule: o.rule, decision: o.decision, escalate: o.escalate })],
    ['Markdown 代码块', '```json\n' + JSON.stringify({ rule: o.rule, decision: o.decision, escalate: o.escalate }) + '\n```'],
    ['规则号小写 + esca 中文布尔', { rule: o.rule.toLowerCase(), decision: o.decision, escalate: o.escalate ? '是' : '否' }],
    ['中文字段名', { 规则: o.rule, 结论: o.decision, 是否需要转人工: o.escalate ? '需要' : '不需要' }],
    ['带解释文字', `命中的是 ${o.rule}。\n${JSON.stringify({ rule: o.rule, decision: o.decision, escalate: o.escalate })}`],
    ['同义结论写法', { rule: o.rule, decision: o.decision === '转人工' ? '转人工复核' : o.decision === '部分批准' ? '部分通过' : '同意', escalate: o.escalate }],
  ];
  for (const [label, ans] of variants) assertFull('I03', ans, label);
});

test('I03 对抗写法（应失分）', () => {
  const o = expected('I03');
  // 找一条不是 o.rule 的规则号
  const allRules = ['R1', 'R2', 'R3', 'R4'];
  const wrongRule = allRules.find((r) => r !== o.rule);
  assertPartial('I03', { rule: wrongRule, decision: o.decision, escalate: o.escalate }, '规则号错', ['I03.C1']);
  assertPartial('I03', { rule: o.rule, decision: o.decision === '批准' ? '转人工' : '批准', escalate: o.escalate }, '结论错', ['I03.C2']);
  assertPartial('I03', { rule: o.rule, decision: o.decision, escalate: !o.escalate }, '转人工判反', ['I03.C3']);
  assertPartial('I03', { rule: o.rule }, '只答规则号', ['I03.C2', 'I03.C3']);
  assertPartial('I03', { decision: o.decision, escalate: o.escalate }, '缺 rule', ['I03.C1']);
  assertPartial('I03', { rule: 'R5', decision: '转人工', escalate: true }, '答成白名单例外条款本身', ['I03.C1']);
});

test('I03 边界：空答案与乱码', () => {
  assert.equal(grade('I03', '').gradingStatus, 'MISSING_ANSWER');
  assert.equal(grade('I03', '?????').gradingStatus, 'UNPARSEABLE');
});

/* ==================================================================== */
/* I04 —— 四步指令更新后的一致状态                                      */
/* ==================================================================== */
test('I04 等价写法（应满分）', () => {
  const o = expected('I04');
  const variants = [
    ['标准 JSON 对象', { status: o.status, owner: o.owner, deadline: o.deadline }],
    ['JSON 字符串', JSON.stringify({ status: o.status, owner: o.owner, deadline: o.deadline })],
    ['Markdown 代码块', '```json\n' + JSON.stringify({ status: o.status, owner: o.owner, deadline: o.deadline }) + '\n```'],
    ['中文字段名', { 状态: o.status, 负责人: o.owner, 截止时间: o.deadline }],
    ['英文驼峰', { finalStatus: o.status, finalOwner: o.owner, finalDeadline: o.deadline }],
    ['带推导过程', `第4条同时改状态和截止时间。\n${JSON.stringify({ status: o.status, owner: o.owner, deadline: o.deadline })}`],
  ];
  for (const [label, ans] of variants) assertFull('I04', ans, label);
});

test('I04 对抗写法（应失分）', () => {
  const o = expected('I04');
  const otherStatus = ['待审核', '审核中', '已通过', '已驳回'].find((s) => s !== o.status);
  const otherDay = ['周三', '周四', '周五', '下周一'].find((d) => d !== o.deadline);
  assertPartial('I04', { status: otherStatus, owner: o.owner, deadline: o.deadline }, '状态停在中间态', ['I04.C1']);
  assertPartial('I04', { status: o.status, owner: '不存在的人', deadline: o.deadline }, '负责人错', ['I04.C2']);
  assertPartial('I04', { status: o.status, owner: o.owner, deadline: otherDay }, '忘了恢复截止时间', ['I04.C3']);
  assertPartial('I04', { status: o.status }, '只答状态', ['I04.C2', 'I04.C3']);
  assertPartial('I04', { owner: o.owner, deadline: o.deadline }, '缺状态', ['I04.C1']);
});

test('I04 边界：空答案与乱码', () => {
  assert.equal(grade('I04', '').gradingStatus, 'MISSING_ANSWER');
  assert.equal(grade('I04', 'zzzz 没有任何字段').gradingStatus, 'UNPARSEABLE');
});

/* ==================================================================== */
/* R01 —— 购物小票的真实合计                                            */
/* ==================================================================== */
test('R01 等价写法（应满分）', () => {
  const o = expected('R01');
  const variants = [
    ['标准 JSON 对象', { subtotal: o.subtotal, total: o.total }],
    ['JSON 字符串', JSON.stringify({ subtotal: o.subtotal, total: o.total })],
    ['Markdown 代码块', '```json\n' + JSON.stringify({ subtotal: o.subtotal, total: o.total }) + '\n```'],
    ['带单位后缀', { subtotal: `${o.subtotal}元`, total: `${o.total} 元` }],
    ['中文字段名', { 原价: o.subtotal, 应付款: o.total }],
    ['行格式', `原价合计: ${o.subtotal}\n实际应付款: ${o.total}`],
    ['带计算过程', `甲 ${o.subtotal} 元合计，满减后实付。\n${JSON.stringify({ subtotal: o.subtotal, total: o.total })}`],
  ];
  for (const [label, ans] of variants) assertFull('R01', ans, label);
});

test('R01 对抗写法（应失分）', () => {
  const o = expected('R01');
  assertPartial('R01', { subtotal: o.subtotal + 1, total: o.total }, '原价算错 + 应付款对（说明该分项独立）', ['R01.C1']);
  assertPartial('R01', { subtotal: o.subtotal, total: o.subtotal }, '忘了满减', ['R01.C2']);
  assertPartial('R01', { subtotal: o.subtotal, total: o.total + 1 }, '应付款差 1 元', ['R01.C2']);
  assertPartial('R01', { subtotal: o.subtotal }, '只答原价', ['R01.C2']);
  assertPartial('R01', { total: o.total }, '只答应付款', ['R01.C1']);
});

test('R01 边界：空答案与乱码', () => {
  assert.equal(grade('R01', '').gradingStatus, 'MISSING_ANSWER');
  assert.equal(grade('R01', '完全无法解析的乱码 !!!').gradingStatus, 'UNPARSEABLE');
});

/* ==================================================================== */
/* R02 —— 依赖关系与可行顺序                                            */
/* ==================================================================== */
test('R02 等价写法（应满分）', () => {
  const internal = instantiateInternal(BY_ID.R02, SEED);
  const o = BY_ID.R02.oracle(internal.facts);
  assert.ok(o.validOrders.length >= 2, '本题应有多解，用于验证「任选其一」');
  const variants = [];
  for (const ord of o.validOrders.slice(0, 3)) {
    variants.push([`合法顺序 ${ord.join('')}`, { order: ord, first: ord[0], last: ord[ord.length - 1] }]);
  }
  const ord = o.validOrders[0];
  variants.push(['JSON 字符串', JSON.stringify({ order: ord, first: ord[0], last: ord[ord.length - 1] })]);
  variants.push(['Markdown 代码块', '```json\n' + JSON.stringify({ order: ord, first: ord[0], last: ord[ord.length - 1] }) + '\n```']);
  variants.push(['中文字段名', { 顺序: ord, 第一步: ord[0], 最后一步: ord[ord.length - 1] }]);
  variants.push(['带解释文字', `按拓扑排序：\n${JSON.stringify({ order: ord, first: ord[0], last: ord[ord.length - 1] })}`]);
  for (const [label, ans] of variants) assertFull('R02', ans, label);
});

test('R02 对抗写法（应失分）', () => {
  const internal = instantiateInternal(BY_ID.R02, SEED);
  const o = BY_ID.R02.oracle(internal.facts);
  const valid = o.validOrders[0];
  // 明确违反依赖：E 排在 C 之前
  assertPartial('R02', { order: ['A', 'B', 'E', 'C', 'D'], first: 'A', last: 'D' }, '违反 E 依赖 C/D', ['R02.C2', 'R02.C3']);
  assertPartial('R02', { order: ['B', 'A', 'C', 'D', 'E'], first: 'B', last: 'E' }, 'B 在 A 之前', ['R02.C2']);
  assertPartial('R02', { order: ['A', 'B', 'C', 'D'], first: 'A', last: 'D' }, '少一个步骤', ['R02.C1', 'R02.C2', 'R02.C3']);
  assertPartial('R02', { order: ['A', 'B', 'C', 'D', 'E', 'E'], first: 'A', last: 'E' }, '重复一步', ['R02.C1', 'R02.C2', 'R02.C3']);
  assertPartial('R02', { order: valid, first: valid[0], last: valid[0] }, 'last 字段与 order 不一致', ['R02.C3']);
  assertPartial('R02', { order: valid }, '只给顺序不给 first/last', ['R02.C3']);
});

test('R02 边界：空答案与乱码', () => {
  assert.equal(grade('R02', '').gradingStatus, 'MISSING_ANSWER');
  assert.equal(grade('R02', '@@@ qqq').gradingStatus, 'UNPARSEABLE');
});

/* ==================================================================== */
/* R03 —— 满足多条件的最低成本方案                                      */
/* ==================================================================== */
test('R03 等价写法（应满分）', () => {
  const internal = instantiateInternal(BY_ID.R03, SEED);
  const o = BY_ID.R03.oracle(internal.facts);
  const best = o.best;
  const variants = [
    ['标准 JSON 对象', { veg: best.veg, chicken: best.chicken, beef: best.beef }],
    ['JSON 字符串', JSON.stringify({ veg: best.veg, chicken: best.chicken, beef: best.beef })],
    ['Markdown 代码块', '```json\n' + JSON.stringify({ veg: best.veg, chicken: best.chicken, beef: best.beef }) + '\n```'],
    ['带单位后缀', { veg: `${best.veg}份`, chicken: `${best.chicken}份`, beef: `${best.beef}份` }],
    ['中文字段名', { 素盒: best.veg, 鸡盒: best.chicken, 牛盒: best.beef }],
    ['带解释文字', `最低总价 ${o.minCost} 元。\n${JSON.stringify({ veg: best.veg, chicken: best.chicken, beef: best.beef })}`],
  ];
  for (const [label, ans] of variants) assertFull('R03', ans, label);
});

test('R03 全量最优解都必须被接受（题面只要求「总价最低」，未要求唯一方案）', () => {
  const internal = instantiateInternal(BY_ID.R03, SEED);
  const f = internal.facts;
  const opts = [];
  for (let v = 0; v <= f.veg.max; v++) {
    for (let c = 0; c <= f.chicken.max; c++) {
      for (let b = 0; b <= f.beef.max; b++) {
        const boxes = v + c + b;
        const protein = v * f.veg.protein + c * f.chicken.protein + b * f.beef.protein;
        if (boxes < f.needBoxes || protein < f.needProtein) continue;
        opts.push({ v, c, b, cost: v * f.veg.price + c * f.chicken.price + b * f.beef.price });
      }
    }
  }
  const min = Math.min(...opts.map((o) => o.cost));
  const optimums = opts.filter((o) => o.cost === min);
  assert.ok(optimums.length >= 1, '至少应有一个可行方案');
  for (const opt of optimums) {
    assertFull('R03', { veg: opt.v, chicken: opt.c, beef: opt.b }, `最优解 ${opt.v}/${opt.c}/${opt.b} (cost=${opt.cost})`);
  }
});

test('R03 对抗写法（应失分）', () => {
  const internal = instantiateInternal(BY_ID.R03, SEED);
  const f = internal.facts;
  const o = BY_ID.R03.oracle(f);
  const best = o.best;

  // 不满足蛋白质下限（份数够但全是素盒）
  assertPartial('R03', { veg: f.needBoxes, chicken: 0, beef: 0 }, '份数够但蛋白质不足', ['R03.C1', 'R03.C3']);
  // 满足条件但不是最低价（多加一个牛盒）
  assertPartial('R03', { veg: best.veg, chicken: best.chicken, beef: Math.min(best.beef + 1, f.beef.max) }, '可行但非最低价', ['R03.C3']);
  // 超过上限
  assertPartial('R03', { veg: f.veg.max + 1, chicken: 0, beef: 0 }, '超过素盒上限', ['R03.C2']);
  // 负数
  assertPartial('R03', { veg: -1, chicken: 2, beef: 2 }, '负数份数', ['R03.C2']);
  // 只答一种
  assertPartial('R03', { veg: best.veg }, '只答素盒', ['R03.C1', 'R03.C2', 'R03.C3']);
});

test('R03 边界：空答案与乱码', () => {
  assert.equal(grade('R03', '').gradingStatus, 'MISSING_ANSWER');
  assert.equal(grade('R03', '###???').gradingStatus, 'UNPARSEABLE');
});

/* ==================================================================== */
/* R04 —— 六线索排除推理（唯一解）                                      */
/* ==================================================================== */
test('R04 等价写法（应满分）', () => {
  const o = expected('R04');
  const ans = o.answer;
  const names = Object.keys(ans);
  const variants = [
    ['标准 JSON 对象', ans],
    ['JSON 字符串', JSON.stringify(ans)],
    ['Markdown 代码块', '```json\n' + JSON.stringify(ans) + '\n```'],
    ['键顺序颠倒', Object.fromEntries([...names].reverse().map((n) => [n, ans[n]]))],
    ['position 用字符串 + 中文键', Object.fromEntries(names.map((n) => [n, { 位置: String(ans[n].position), 颜色: ans[n].color }]))],
    ['pos 短键名', Object.fromEntries(names.map((n) => [n, { pos: ans[n].position, color: ans[n].color }]))],
    ['带解释文字', `逐条排除后：\n${JSON.stringify(ans)}`],
  ];
  for (const [label, a] of variants) assertFull('R04', a, label);
});

test('R04 对抗写法（应失分）', () => {
  const o = expected('R04');
  const ans = o.answer;
  const names = Object.keys(ans);
  const n0 = names[0];
  const swapped = { ...ans, [n0]: { ...ans[n0], position: ans[n0].position === 1 ? 2 : 1 } };
  // 位置错一人
  assertPartial('R04', swapped, '一人位置错', ['R04.C1', 'R04.C3']);
  const wrongColor = { ...ans, [n0]: { ...ans[n0], color: ans[n0].color === '红' ? '蓝' : '红' } };
  assertPartial('R04', wrongColor, '一人颜色错', ['R04.C2', 'R04.C3']);
  // 只答一半的人
  const half = Object.fromEntries(names.slice(0, 2).map((n) => [n, ans[n]]));
  assertPartial('R04', half, '只答两个人', ['R04.C1', 'R04.C2', 'R04.C3']);
  // 把位置和颜色整体互换（两人对调）
  const permuted = { ...ans };
  const [a, b] = names;
  permuted[a] = ans[b];
  permuted[b] = ans[a];
  assertPartial('R04', permuted, '两人位置颜色对调', ['R04.C1', 'R04.C2', 'R04.C3']);
  // 空 seats
  assertPartial('R04', { seats: {} }, 'seats 为空对象', ['R04.C1', 'R04.C2', 'R04.C3']);
});

test('R04 边界：空答案与乱码', () => {
  assert.equal(grade('R04', '').gradingStatus, 'MISSING_ANSWER');
  assert.equal(grade('R04', 'not a json at all').gradingStatus, 'UNPARSEABLE');
});

/* ==================================================================== */
/* D01 —— 去重并按规定排序                                              */
/* ==================================================================== */
test('D01 等价写法（应满分）', () => {
  const o = expected('D01');
  const list = o.unique;
  const variants = [
    ['标准 JSON 对象', { list }],
    ['JSON 字符串', JSON.stringify({ list })],
    ['Markdown 代码块', '```json\n' + JSON.stringify({ list }) + '\n```'],
    ['中文字段名', { 名单: list }],
    ['带引号的名称', { list: list.map((x) => `「${x}」`) }],
    ['带解释文字', `去重后共 ${list.length} 个：\n${JSON.stringify({ list })}`],
    ['逗号分隔字符串', { list: list.join(',') }],
  ];
  for (const [label, ans] of variants) assertFull('D01', ans, label);
});

test('D01 对抗写法（应失分）', () => {
  const o = expected('D01');
  const list = o.unique;
  // 顺序错（反转）
  assertPartial('D01', { list: [...list].reverse() }, '集合对但顺序错（除非本身对称）', ['D01.C2']);
  // 有重复
  assertPartial('D01', { list: [...list, list[0]] }, '保留了重复项', ['D01.C1']);
  // 少一个
  assertPartial('D01', { list: list.slice(1) }, '漏掉一个摊位', ['D01.C1', 'D01.C2']);
  // 多一个不在清单里的
  assertPartial('D01', { list: [...list, '北京'] }, '多出不在登记的摊位', ['D01.C1']);
  // 空
  assertPartial('D01', { list: [] }, '空名单', ['D01.C1', 'D01.C2']);
});

test('D01 边界：空答案与乱码', () => {
  assert.equal(grade('D01', '').gradingStatus, 'MISSING_ANSWER');
  assert.equal(grade('D01', '%%%^^^').gradingStatus, 'UNPARSEABLE');
});

/* ==================================================================== */
/* D02 —— 区分事实、推断与信息不足                                      */
/* ==================================================================== */
test('D02 等价写法（应满分）', () => {
  const internal = instantiateInternal(BY_ID.D02, SEED);
  const o = BY_ID.D02.oracle(internal.facts);
  const f = internal.facts;
  // 答案已随 seed 随机化（A/B/C），按 oracle 构造对应的正确理由
  const rightReason = o.answer === 'C'
    ? '甲项目的最终实际支出这一栏是空的，报告里没有给出，信息不足，无法确定。'
    : `甲实际支出 ${f.projectA_Final} 万元，${o.answer === 'A' ? '比乙的' : '比乙的'} ${f.projectB_Final} 万元${o.answer === 'A' ? '少' : '多'}。`;
  const answerText = o.answer === 'C' ? '信息不足，无法确定' : o.answer;
  const variants = [
    ['标准 JSON 对象', { answer: o.answer, reason: rightReason }],
    ['中文键', { 答案: o.answer, 理由: rightReason }],
    ['JSON 字符串', JSON.stringify({ answer: o.answer, reason: rightReason })],
    ['Markdown 代码块', '```json\n' + JSON.stringify({ answer: o.answer, reason: rightReason }) + '\n```'],
    ['行格式', `answer: ${o.answer}\nreason: ${rightReason}`],
  ];
  if (o.answer === 'C') {
    variants.push(['选项原文', { answer: answerText, reason: rightReason }]);
  }
  for (const [label, ans] of variants) assertFull('D02', ans, label);
});

test('D02 正确理由但含「甲…少于…乙」比较句不应被判为「把预算当支出」', () => {
  // 这是一句正确的推理：明确说了「未知」，只是复述了原问题里的比较关系
  // 仅在 oracle 答案为 C（甲支出缺失）的 seed 上适用
  const internal = instantiateInternal(BY_ID.D02, SEED);
  const o = BY_ID.D02.oracle(internal.facts);
  if (o.answer !== 'C') return; // 该 seed 甲支出已给出，本用例不适用
  assertFull(
    'D02',
    { answer: 'C', reason: '甲项目的最终支出未知，因此无法判断甲是否少于乙项目的实际支出。' },
    '正确理由含比较句式',
  );
});

test('D02 对抗写法（应失分）', () => {
  const internal = instantiateInternal(BY_ID.D02, SEED);
  const o = BY_ID.D02.oracle(internal.facts);
  const f = internal.facts;
  const wrongAnswer = o.answer === 'A' ? 'B' : 'A';
  assertPartial('D02', { answer: wrongAnswer, reason: '随便' }, '答案选错', ['D02.C1', 'D02.C3']);
  assertPartial('D02', { answer: o.answer, reason: '不知道' }, '理由太含糊', ['D02.C2']);
  assertPartial('D02', { answer: o.answer }, '只有结论没有理由', ['D02.C2']);
  // 答案对但理由与事实相反（甲支出已给出却说没给出）
  if (o.answer !== 'C') {
    assertPartial(
      'D02',
      { answer: o.answer, reason: '甲项目的最终实际支出没有给出' },
      '答案对但理由声称数据缺失（与事实相反）',
      ['D02.C2'],
    );
  }
  assertPartial(
    'D02',
    { answer: 'C', reason: '因为甲预算更低所以更省。' },
    '把预算当最终支出',
    ['D02.C2', 'D02.C3'],
  );
  assertPartial('D02', { answer: 'C, A 项目数据缺失', reason: '甲的最终支出没有给出' }, '答案自相矛盾（同时写了 A 和 C）', ['D02.C1', 'D02.C3']);
});

test('D02 边界：空答案与乱码必须区分对待', () => {
  assert.equal(grade('D02', '').gradingStatus, 'MISSING_ANSWER', '空白答案应为 MISSING_ANSWER');
  // 乱码不应被当作「知识错误」静默 0 分，必须标 UNPARSEABLE/NEEDS_REVIEW
  const junk = grade('D02', 'asdkjhqwe@@@!!!');
  assert.equal(
    junk.gradingStatus,
    'UNPARSEABLE',
    `乱码答案应为 UNPARSEABLE（待复核），实际 ${junk.gradingStatus}，awarded=${junk.awarded}`,
  );
});

/* ==================================================================== */
/* D03 —— 两表合并与冲突检测                                            */
/* ==================================================================== */
test('D03 等价写法（应满分）', () => {
  const o = expected('D03');
  const variants = [
    ['标准 JSON 对象', { lossMaking: o.lossMaking, onlyInStore: o.onlyInStore, commonCount: o.commonCount }],
    ['JSON 字符串', JSON.stringify({ lossMaking: o.lossMaking, onlyInStore: o.onlyInStore, commonCount: o.commonCount })],
    ['Markdown 代码块', '```json\n' + JSON.stringify({ lossMaking: o.lossMaking, onlyInStore: o.onlyInStore, commonCount: o.commonCount }) + '\n```'],
    ['小写 SKU', { lossMaking: o.lossMaking.map((s) => s.toLowerCase()), onlyInStore: o.onlyInStore.map((s) => s.toLowerCase()), commonCount: o.commonCount }],
    ['中文字段名', { 亏本: o.lossMaking, 仅门店: o.onlyInStore, 共同数量: o.commonCount }],
    ['列表顺序颠倒', { lossMaking: [...o.lossMaking].reverse(), onlyInStore: [...o.onlyInStore].reverse(), commonCount: o.commonCount }],
    ['带解释文字', `共 ${o.commonCount} 个 SKU 重叠。\n${JSON.stringify({ lossMaking: o.lossMaking, onlyInStore: o.onlyInStore, commonCount: o.commonCount })}`],
  ];
  for (const [label, ans] of variants) assertFull('D03', ans, label);
});

test('D03 对抗写法（应失分）', () => {
  const o = expected('D03');
  assertPartial('D03', { lossMaking: [], onlyInStore: o.onlyInStore, commonCount: o.commonCount }, '漏报亏本 SKU', ['D03.C1']);
  assertPartial('D03', { lossMaking: o.lossMaking, onlyInStore: [], commonCount: o.commonCount }, '漏报仅门店 SKU', ['D03.C2']);
  assertPartial('D03', { lossMaking: o.lossMaking, onlyInStore: o.onlyInStore, commonCount: o.commonCount + 1 }, '共同数量错', ['D03.C3']);
  assertPartial('D03', { lossMaking: o.lossMaking, onlyInStore: o.onlyInStore }, '缺 commonCount', ['D03.C3']);
  assertPartial('D03', { lossMaking: ['F-660'], onlyInStore: o.onlyInStore, commonCount: o.commonCount }, '把仅门店 SKU 当成亏本', ['D03.C1']);
});

test('D03 边界：空答案与乱码', () => {
  assert.equal(grade('D03', '').gradingStatus, 'MISSING_ANSWER');
  assert.equal(grade('D03', 'no sku here').gradingStatus, 'UNPARSEABLE');
});

/* ==================================================================== */
/* D04 —— 规则化条件匹配与例外                                          */
/* ==================================================================== */
test('D04 等价写法（应满分）', () => {
  const o = expected('D04');
  const variants = [
    ['标准 JSON 对象', { levels: o.levels, counts: o.counts }],
    ['JSON 字符串', JSON.stringify({ levels: o.levels, counts: o.counts })],
    ['Markdown 代码块', '```json\n' + JSON.stringify({ levels: o.levels, counts: o.counts }) + '\n```'],
    ['等级用简称', { levels: Object.fromEntries(Object.entries(o.levels).map(([k, v]) => [k, v === '金牌' ? '金' : v === '银牌' ? '银' : '普通'])), counts: o.counts }],
    ['counts 用中文键', { levels: o.levels, counts: { 金牌: o.counts.gold, 银牌: o.counts.silver, 普通: o.counts.normal } }],
    ['带解释文字', `按规则逐人判定：\n${JSON.stringify({ levels: o.levels, counts: o.counts })}`],
  ];
  for (const [label, ans] of variants) assertFull('D04', ans, label);
});

test('D04 对抗写法（应失分）', () => {
  const o = expected('D04');
  const names = Object.keys(o.levels);
  // 把一个普通人误判成金牌（最常见：用了 <18 岁例外之外的错误优先级）
  const wrongLevels = { ...o.levels, [names[0]]: o.levels[names[0]] === '金牌' ? '普通' : '金牌' };
  assertPartial('D04', { levels: wrongLevels, counts: o.counts }, '一人等级错', ['D04.C1']);
  // 统计错
  assertPartial('D04', { levels: o.levels, counts: { gold: o.counts.gold + 1, silver: o.counts.silver, normal: o.counts.normal - 1 } }, '金牌数多算一人', ['D04.C2', 'D04.C3']);
  // 只给 levels
  assertPartial('D04', { levels: o.levels }, '缺 counts', ['D04.C2', 'D04.C3']);
  // 只给 counts
  assertPartial('D04', { counts: o.counts }, '缺 levels', ['D04.C1']);
  // 三项之和不等于总人数
  assertPartial('D04', { levels: o.levels, counts: { gold: 0, silver: 0, normal: 0 } }, '统计全 0、与 levels 矛盾', ['D04.C2', 'D04.C3']);
});

test('D04 边界：空答案与乱码', () => {
  assert.equal(grade('D04', '').gradingStatus, 'MISSING_ANSWER');
  assert.equal(grade('D04', 'xyz').gradingStatus, 'UNPARSEABLE');
});

/* ==================================================================== */
/* C01 —— 指出算式中的错误并纠正                                        */
/* ==================================================================== */
test('C01 等价写法（应满分）', () => {
  const o = expected('C01');
  const facts = instantiateInternal(BY_ID.C01, SEED).facts;
  // isCorrect 已随 seed 随机化（原等式可能本来就是对的），按 oracle 取值
  const ic = o.isCorrect;
  const icCn = ic ? '是' : '否';
  const variants = [
    ['标准 JSON 对象', { isCorrect: ic, correctTotal: o.correctTotal }],
    ['JSON 字符串', JSON.stringify({ isCorrect: ic, correctTotal: o.correctTotal })],
    ['Markdown 代码块', '```json\n' + JSON.stringify({ isCorrect: ic, correctTotal: o.correctTotal }) + '\n```'],
    ['布尔用中文字符串', { isCorrect: icCn, correctTotal: o.correctTotal }],
    ['中文字段名', { 原式正确: String(ic), 正确结果: o.correctTotal }],
    ['带单位', { isCorrect: ic, correctTotal: `${o.correctTotal}元` }],
    ['带解释文字', `核对结果如下。\n${JSON.stringify({ isCorrect: ic, correctTotal: o.correctTotal })}`],
  ];
  for (const [label, ans] of variants) assertFull('C01', ans, label);
});

test('C01 对抗写法（应失分）', () => {
  const o = expected('C01');
  const facts = instantiateInternal(BY_ID.C01, SEED).facts;
  // 把 isCorrect 判反
  assertPartial('C01', { isCorrect: !o.isCorrect, correctTotal: o.correctTotal }, '把原式对错判反', ['C01.C1']);
  assertPartial('C01', { isCorrect: o.isCorrect, correctTotal: o.correctTotal + 1 }, '正确和的数值错', ['C01.C2']);
  assertPartial('C01', { isCorrect: o.isCorrect }, '只判定不纠错', ['C01.C2']);
  assertPartial('C01', { correctTotal: o.correctTotal }, '缺 isCorrect', ['C01.C1']);
  // 若原式本来是错的，把错和当答案抄回去
  if (facts.wrong !== facts.correct) {
    assertPartial('C01', { isCorrect: o.isCorrect, correctTotal: facts.wrong }, '把错和照抄回去', ['C01.C2']);
  }
});

test('C01 边界：空答案与乱码', () => {
  assert.equal(grade('C01', '').gradingStatus, 'MISSING_ANSWER');
  assert.equal(grade('C01', 'garbage ###').gradingStatus, 'UNPARSEABLE');
});

/* ==================================================================== */
/* C02 —— 四步修改后的最新库存状态                                      */
/* ==================================================================== */
test('C02 等价写法（应满分）', () => {
  const o = expected('C02');
  const variants = [
    ['标准 JSON 对象', { beforeVoid: o.beforeVoid, finalStock: o.finalStock }],
    ['JSON 字符串', JSON.stringify({ beforeVoid: o.beforeVoid, finalStock: o.finalStock })],
    ['Markdown 代码块', '```json\n' + JSON.stringify({ beforeVoid: o.beforeVoid, finalStock: o.finalStock }) + '\n```'],
    ['中文字段名', { 撤回前: o.beforeVoid, 最终库存: o.finalStock }],
    ['带单位', { beforeVoid: `${o.beforeVoid} 件`, finalStock: `${o.finalStock}件` }],
    ['带解释文字', `盘亏后是 ${o.beforeVoid}，撤回出库单后回到 ${o.finalStock}。\n${JSON.stringify({ beforeVoid: o.beforeVoid, finalStock: o.finalStock })}`],
  ];
  for (const [label, ans] of variants) assertFull('C02', ans, label);
});

test('C02 对抗写法（应失分）', () => {
  const o = expected('C02');
  const steps = instantiateInternal(BY_ID.C02, SEED).facts.steps;
  assertPartial('C02', { beforeVoid: o.beforeVoid + 1, finalStock: o.finalStock + 1 }, '撤回前算错且最终也错', ['C02.C1', 'C02.C2', 'C02.C3']);
  // 「撤回」理解成再扣一次出库
  assertPartial('C02', { beforeVoid: o.beforeVoid, finalStock: o.beforeVoid - steps[3].qty }, '把撤回理解成再出库一次', ['C02.C2', 'C02.C3']);
  assertPartial('C02', { beforeVoid: o.beforeVoid }, '只答撤回前', ['C02.C2', 'C02.C3']);
  assertPartial('C02', { finalStock: o.finalStock }, '只答最终库存', ['C02.C1', 'C02.C2']);
  assertPartial('C02', { beforeVoid: o.beforeVoid, finalStock: o.finalStock + 1 }, '最终库存差 1', ['C02.C2', 'C02.C3']);
});

test('C02 边界：空答案与乱码', () => {
  assert.equal(grade('C02', '').gradingStatus, 'MISSING_ANSWER');
  assert.equal(grade('C02', '???').gradingStatus, 'UNPARSEABLE');
});

/* ==================================================================== */
/* C03 —— 新旧规则更迭后的合法操作                                      */
/* ==================================================================== */
test('C03 等价写法（应满分）', () => {
  const o = expected('C03');
  const cases = o.cases;
  const variants = [
    ['标准 JSON 对象（a1..a4 平铺）', cases],
    ['包在 cases 里', { cases }],
    ['JSON 字符串', JSON.stringify(cases)],
    ['Markdown 代码块', '```json\n' + JSON.stringify(cases) + '\n```'],
    ['中文字段名', Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, { 规则: v.rule, 需要人工: v.needManual ? '需要' : '不需要' }]))],
    ['布尔用中文字符串', Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, { rule: v.rule, needManual: v.needManual ? '是' : '否' }]))],
    ['带解释文字', `按提交时间判断：\n${JSON.stringify(cases)}`],
  ];
  for (const [label, ans] of variants) assertFull('C03', ans, label);
});

test('C03 对抗写法（应失分）', () => {
  const o = expected('C03');
  const cases = o.cases;
  const flipRule = (k) => ({ ...cases, [k]: { ...cases[k], rule: cases[k].rule === '旧' ? '新' : '旧' } });
  const flipManual = (k) => ({ ...cases, [k]: { ...cases[k], needManual: !cases[k].needManual } });
  assertPartial('C03', flipRule('a1'), 'a1 用错规则版本', ['C03.C1']);
  assertPartial('C03', flipManual('a1'), 'a1 人工判断错', ['C03.C2']);
  assertPartial('C03', flipRule('a2'), 'a2 误用旧规则门槛（正是 C3 要抓的误解）', ['C03.C1', 'C03.C3']);
  assertPartial('C03', { a1: cases.a1, a2: cases.a2, a3: cases.a3 }, '缺 a4', ['C03.C1', 'C03.C2']);
  assertPartial('C03', { a1: cases.a1 }, '只答第一笔', ['C03.C1', 'C03.C2', 'C03.C3']);
});

test('C03 边界：空答案与乱码', () => {
  assert.equal(grade('C03', '').gradingStatus, 'MISSING_ANSWER');
  assert.equal(grade('C03', 'nonsense').gradingStatus, 'UNPARSEABLE');
});

/* ==================================================================== */
/* C04 —— 找出错误根源、修复并算最终结果                                */
/* ==================================================================== */
test('C04 等价写法（应满分）', () => {
  const o = expected('C04');
  const variants = [
    ['标准 JSON 对象', { rootCause: '数量用错', fixedSubtotal: o.fixedSubtotal, fixedTotal: o.fixedTotal }],
    ['JSON 字符串', JSON.stringify({ rootCause: '数量用错', fixedSubtotal: o.fixedSubtotal, fixedTotal: o.fixedTotal })],
    ['Markdown 代码块', '```json\n' + JSON.stringify({ rootCause: '数量用错', fixedSubtotal: o.fixedSubtotal, fixedTotal: o.fixedTotal }) + '\n```'],
    ['中文字段名', { 错误根源: '数量用错', 正确小计: o.fixedSubtotal, 正确应付: o.fixedTotal }],
    ['带单位', { rootCause: '数量用错', fixedSubtotal: `${o.fixedSubtotal}元`, fixedTotal: `${o.fixedTotal} 元` }],
    ['带解释文字', `qty 写错了。\n${JSON.stringify({ rootCause: '数量用错', fixedSubtotal: o.fixedSubtotal, fixedTotal: o.fixedTotal })}`],
  ];
  for (const [label, ans] of variants) assertFull('C04', ans, label);
});

test('C04 带排除说明的正确根源不应被误杀', () => {
  const o = expected('C04');
  // 单选的语境下，「数量用错（不是单价问题）」是最自然的防歧义写法，应判对
  assertFull(
    'C04',
    { rootCause: '数量用错（不是单价问题）', fixedSubtotal: o.fixedSubtotal, fixedTotal: o.fixedTotal },
    'rootCause 附带排除说明',
  );
});

test('C04 对抗写法（应失分）', () => {
  const o = expected('C04');
  assertPartial('C04', { rootCause: '单价用错', fixedSubtotal: o.fixedSubtotal, fixedTotal: o.fixedTotal }, '根源选错', ['C04.C1']);
  assertPartial('C04', { rootCause: '数量用错', fixedSubtotal: o.fixedSubtotal + 1, fixedTotal: o.fixedTotal }, '小计错', ['C04.C2']);
  assertPartial('C04', { rootCause: '数量用错', fixedSubtotal: o.fixedSubtotal, fixedTotal: o.fixedTotal + 1 }, '总额错', ['C04.C3']);
  assertPartial('C04', { rootCause: '数量用错', fixedSubtotal: o.fixedSubtotal }, '缺总额', ['C04.C3']);
  assertPartial('C04', { fixedSubtotal: o.fixedSubtotal, fixedTotal: o.fixedTotal }, '缺根源', ['C04.C1']);
});

test('C04 边界：空答案与乱码', () => {
  assert.equal(grade('C04', '').gradingStatus, 'MISSING_ANSWER');
  assert.equal(grade('C04', '%%%%').gradingStatus, 'UNPARSEABLE');
});

/* ==================================================================== */
/* 跨题统一检查                                                         */
/* ==================================================================== */
test('跨题：全部 16 题的 awarded 恒在 [0, maxPoints] 内（对 5 类极端输入）', () => {
  const extremeInputs = [
    { name: 'null', value: null },
    { name: '空串', value: '' },
    { name: '超长乱码', value: 'x'.repeat(5000) },
    { name: 'JSON null', value: 'null' },
    { name: '空对象', value: {} },
    { name: '数字', value: 12345 },
    { name: '数组', value: [1, 2, 3] },
  ];
  for (const item of ITEMS) {
    for (const inp of extremeInputs) {
      const internal = instantiateInternal(item, SEED);
      const raw = typeof inp.value === 'string' ? inp.value : inp.value;
      let r;
      assert.doesNotThrow(() => {
        r = gradeItem(internal, raw, { seed: SEED });
      }, `${item.id} 在输入「${inp.name}」时抛异常`);
      assert.ok(
        Number.isFinite(r.awarded) && r.awarded >= 0 && r.awarded <= item.points,
        `${item.id} 输入「${inp.name}」：awarded 越界 ${r.awarded}/${item.points}`,
      );
      assert.ok(
        typeof r.gradingStatus === 'string' && r.gradingStatus.length > 0,
        `${item.id} 输入「${inp.name}」：缺少 gradingStatus`,
      );
    }
  }
});

test('跨题：每个 criterion 都必须有可复核的 reason', () => {
  for (const item of ITEMS) {
    for (const ans of [official(item.id), {}, 'garbage!!']) {
      const r = grade(item.id, typeof ans === 'string' ? ans : JSON.stringify(ans));
      for (const c of r.checks) {
        assert.equal(typeof c.reason, 'string', `${item.id}/${c.criterionId} 的 reason 不是字符串`);
        assert.ok(c.reason.length > 0, `${item.id}/${c.criterionId} 的 reason 为空`);
      }
    }
  }
});
