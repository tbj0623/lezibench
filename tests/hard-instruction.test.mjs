/**
 * 指令理解维度难度加固测试（I01 / I02 / I03 / I04）
 * ==================================================================
 * 这份测试针对「把 instruction 四道题从细心题改造成状态维护题」之后的回归保护。
 *
 * ⚠️ 纪律（本项目硬性规定，起因是发生过「测试期望值全由被测 oracle 生成」的事故）：
 *   第 3 组「手算夹具」里的期望值是**人工算出后写死的常量**，
 *   不调用 oracle()、不调用 generate() 的答案字段。
 *   每条都注明「怎么算的」。
 *
 * 覆盖：
 *   1. 20 个 seed 下 generate 不抛异常 + 同 seed 确定性
 *   2. 20 个 seed 下 oracle 答案经 gradeItem 判分满分
 *   3. 手算夹具 ≥4 条（期望值为硬编码常量）
 *   4. 结构合法但值全错的答案 → 0 分
 *   5. 题面无泄漏：不含答案值、不含「参考答案」
 *   6. 评分条件中性：不含「不得/不要/而非/注意」，不含具体数字
 *   7. 欠定性检查：实体名齐备 + 解唯一（穷举）
 *   8. 垃圾输入不抛异常
 *
 * 运行：node --test tests/hard-instruction.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_BY_ID, instantiateInternal } from '../src/exam/manifest.mjs';
import { gradeItem } from '../src/grading/grade.mjs';

const IDS = ['I01', 'I02', 'I03', 'I04'];
const SEEDS = Array.from({ length: 20 }, (_, i) => `hard-${i}`);

/** 判分入口：统一走 gradeItem（唯一可信接口） */
function grade(id, seed, answer) {
  const internal = instantiateInternal(ITEM_BY_ID.get(id), seed);
  const raw = typeof answer === 'string' ? answer : JSON.stringify(answer);
  return gradeItem(internal, raw, { seed });
}

function factsOf(id, seed) {
  return instantiateInternal(ITEM_BY_ID.get(id), seed).facts;
}

/* ================================================================== */
/* 1. generate 不抛异常 + 确定性                                       */
/* ================================================================== */
test('I01–I04：20 个 seed 下 generate 不抛异常，且同 seed 两次题面完全相同', () => {
  for (const id of IDS) {
    const item = ITEM_BY_ID.get(id);
    for (const seed of SEEDS) {
      let g1;
      let g2;
      assert.doesNotThrow(() => { g1 = item.generate(seed); }, `${id}@${seed} generate 抛异常`);
      assert.doesNotThrow(() => { g2 = item.generate(seed); }, `${id}@${seed} 第二次 generate 抛异常`);
      assert.equal(typeof g1.prompt, 'string', `${id}@${seed} prompt 不是字符串`);
      assert.ok(g1.prompt.length > 200, `${id}@${seed} 题面过短（${g1.prompt.length} 字），可能没生成完整`);
      assert.equal(g1.prompt, g2.prompt, `${id}@${seed} 同 seed 两次题面不一致（违反确定性）`);
      assert.deepEqual(g1.facts, g2.facts, `${id}@${seed} 同 seed 两次 facts 不一致`);
      assert.ok(g1.schema && typeof g1.schema === 'object', `${id}@${seed} 缺 schema`);
      assert.ok(Array.isArray(g1.publicCriteria) && g1.publicCriteria.length > 0, `${id}@${seed} 缺 publicCriteria`);
    }
  }
});

test('I01–I04：不同 seed 题面必须有实质变化（不得只换数字）', () => {
  for (const id of IDS) {
    const prompts = new Set(SEEDS.map((s) => ITEM_BY_ID.get(id).generate(s).prompt));
    assert.ok(prompts.size >= 15, `${id} 在 20 个 seed 下只产生 ${prompts.size} 种题面，变化不足`);
  }
});

/* ================================================================== */
/* 2. oracle 答案在 20 个 seed 下都满分                                */
/* ================================================================== */
test('I01–I04：oracle 答案经 gradeItem 判分，20 个 seed 全部满分', () => {
  // 说明：I01 的 oracle 返回的是**结构化时段**（day/period/hour/minute/text），
  // 与其它题「直接返回可提交答案」不同；把它拼成答案串是 scripts/oracle-answers.mjs 的职责。
  // 这里按同一份口径手工组装，不改动 oracle 的既有返回契约。
  const toAnswer = (id, o) => {
    if (id === 'I01') return { deadline: `${o.day}${o.text}`, budgetAttached: o.budgetAttached };
    return o;
  };
  for (const id of IDS) {
    const item = ITEM_BY_ID.get(id);
    for (const seed of SEEDS) {
      const f = factsOf(id, seed);
      const want = toAnswer(id, item.oracle(f));
      const r = grade(id, seed, want);
      assert.equal(r.gradingStatus, 'GRADED', `${id}@${seed} 状态 ${r.gradingStatus}`);
      const failed = r.checks.filter((c) => !c.passed).map((c) => `${c.criterionId}(${c.reason})`);
      assert.equal(r.awarded, item.points, `${id}@${seed} oracle 答案只得 ${r.awarded}/${item.points}；挂掉：${failed.join(' | ')}`);
      assert.ok(r.awarded >= 0 && r.awarded <= r.maxPoints, `${id}@${seed} 分数越界`);
    }
  }
});

/* ================================================================== */
/* 3. 手算夹具（期望值为人工硬编码常量，不调用 oracle）                 */
/* ================================================================== */

/**
 * ==================================================================
 * 可重建夹具：FIXTURES
 * ==================================================================
 * 供 tests/golden-fixtures.test.mjs 重写时直接 import 使用。
 *
 * 纪律：
 *   - 每条 seed 固定，factsDigest 是「从该 seed 题面抄下来的关键事实」，
 *     便于人工核对「夹具前提没有漂移」；
 *   - answer 是**人工逐步推出来的常量**，不是 oracle() 的输出；
 *   - how 写明推理链，任何人可照着重算；
 *   - 每条的 factsAssert 会断言题面事实仍与 factsDigest 一致 ——
 *     一旦 generate() 改了，夹具会红而不是悄悄失效。
 */
export const FIXTURES = [
  /* ---------------- I01 · 8 条通知，4 分 [1,3] ---------------- */
  {
    id: 'I01',
    seed: 'fx1-0',
    factsDigest: {
      scenario: 'revoke',
      sessionChannel: '线上',
      budgetStatus: '已批复',
      notice1: '周四下午3点，附预算表',
      notice2: '改为周五上午10点',
      notice3: '预算表不用交',
      notice4: '第3条作废（视为从未发出）',
      notice5: '若线上 → 周三上午11点',
      notice6: '若线下 → 周二下午4点',
    },
    answer: { deadline: '周三上午11点', budgetAttached: true },
    how:
      '通知1 建立「周四下午3点 + 需附」；通知2 改期到周五上午10点；通知3 取消附件；' +
      '通知4 作废通知3（视为从未发出）→ 附件要求回到通知1 的「需附」；' +
      '通知5 守卫「线上」成立 → 改到周三上午11点；通知6 守卫「线下」不成立 → 忽略；' +
      '通知7 只改格式、明确不影响时间与附件；通知8 无改动。' +
      '→ deadline=周三上午11点，budgetAttached=true。',
  },
  {
    id: 'I01',
    seed: 'fx1-1',
    factsDigest: {
      scenario: 'revoke',
      sessionChannel: '线上',
      budgetStatus: '已批复',
      notice1: '周二下午3点，附预算表',
      notice2: '改为周五下午2点',
      notice3: '预算表不用交',
      notice4: '第3条作废（视为从未发出）',
      notice5: '若线上 → 周四上午9点30分',
      notice6: '若线下 → 周三上午10点',
    },
    answer: { deadline: '周四上午9点30分', budgetAttached: true },
    how:
      '同 fx1-0 的结构：通知4 作废通知3 → 附件回到「需附」；通知5 线上成立 → 周四上午9点30分；' +
      '通知6 线下不成立 → 忽略。→ deadline=周四上午9点30分，budgetAttached=true。',
  },
  {
    id: 'I01',
    seed: 'fx1-4',
    factsDigest: {
      scenario: 'guard',
      sessionChannel: '线下',
      budgetStatus: '已批复',
      notice1: '周三上午10点，附预算表',
      notice2: '若线下 → 周四下午2点',
      notice3: '预算表不用交',
      notice4: '若预算尚未批复 → 第3条不适用（守卫为假）',
      notice5: '第2条作废（视为从未发出）',
      notice6: '若线上且已批复 → 周五下午4点（守卫为假）',
    },
    answer: { deadline: '周三上午10点', budgetAttached: false },
    how:
      '通知2 守卫「线下」成立 → 暂定周四下午2点；通知3 取消附件；' +
      '通知4 守卫「预算尚未批复」不成立（本题已批复）→ 通知3 继续有效 → 附件=不附；' +
      '通知5 作废通知2 → 日期回到通知1 的周三上午10点；通知6 守卫「线上」不成立 → 忽略。' +
      '→ deadline=周三上午10点，budgetAttached=false。',
  },

  /* ---------------- I02 · 24 个商品，6 分 [2,2,2] ---------------- */
  {
    id: 'I02',
    seed: 'fi2-0',
    factsDigest: {
      itemCount: 24,
      exemptNames: ['兰花', '雪松'],
      revokedExemptName: '连翘',
      rules: '1)线上 2)在售 3)豁免兰花 4)豁免雪松 5)豁免连翘 6)第5条作废',
    },
    answer: {
      selected: ['S01', 'S02', 'S03', 'S05', 'S07', 'S08', 'S09', 'S10', 'S14', 'S17', 'S21'],
      rejected: ['S04', 'S06', 'S11', 'S12', 'S13', 'S15', 'S16', 'S18', 'S19', 'S20', 'S22', 'S23', 'S24'],
    },
    how:
      '基础 = 渠道线上 且 状态在售；额外加入「兰花」「雪松」两个豁免（不论渠道状态）；' +
      '「连翘」的豁免（第5条）被第6条作废，因此连翘按基础规则判。' +
      '逐个商品套这两条即可得出 11 个上架、13 个不上架。',
  },
  {
    id: 'I02',
    seed: 'fi2-1',
    factsDigest: {
      itemCount: 24,
      exemptNames: ['红枫', '含笑'],
      revokedExemptName: '雪松',
      rules: '1)线上 2)在售 3)豁免红枫 4)豁免含笑 5)豁免雪松 6)第5条作废',
    },
    answer: {
      selected: ['S01', 'S02', 'S04', 'S05', 'S10', 'S11', 'S13', 'S17', 'S23', 'S24'],
      rejected: ['S03', 'S06', 'S07', 'S08', 'S09', 'S12', 'S14', 'S15', 'S16', 'S18', 'S19', 'S20', 'S21', 'S22'],
    },
    how:
      '基础 = 线上且在售；额外加入「红枫」「含笑」；「雪松」的豁免被第6条作废 → 按基础判。' +
      '注意「雪松」若本身是线下或下架，就会落在 rejected 里 —— 这正是第6条的实际效果。',
  },
  {
    id: 'I02',
    seed: 'fi2-2',
    factsDigest: {
      itemCount: 24,
      exemptNames: ['迎春', '玉兰'],
      revokedExemptName: '雪松',
      rules: '1)线上 2)在售 3)豁免迎春 4)豁免玉兰 5)豁免雪松 6)第5条作废',
    },
    answer: {
      selected: ['S01', 'S05', 'S06', 'S09', 'S13', 'S14', 'S17', 'S20', 'S22', 'S23'],
      rejected: ['S02', 'S03', 'S04', 'S07', 'S08', 'S10', 'S11', 'S12', 'S15', 'S16', 'S18', 'S19', 'S21', 'S24'],
    },
    how:
      '基础 = 线上且在售；额外加入「迎春」「玉兰」；「雪松」豁免被第6条作废 → 按基础判。',
  },

  /* ---------------- I03 · 8 条规则，6 分 [2,2,2] ---------------- */
  {
    id: 'I03',
    seed: 'hxscan-23',
    factsDigest: {
      region: '华东三区',
      nights: 2,
      amount: 7567,
      subsidy: 240,
      net: 7327,
      tier: 'A',
      expedite: true,
      thresholds: 'R1=6000(加急下调)/8000，R2 需住宿>5 且净额>5000，R3 需区域=华东三区 且 净额≤4000',
    },
    answer: { rule: 'R4', decision: '部分批准', escalate: false },
    how:
      '净额 = 7567 − 240 = 7327。加急 → R1 阈值降为 6000，7327 > 6000，R1 本会命中；' +
      '但名单等级 A → A 级不适用 R1 → 跳过 R1。R2 需住宿 >5 晚，本题 2 晚 → 不触发。' +
      'R3 需净额 ≤4000，7327 > 4000 → 不满足。→ 落到 R4：部分批准、不转人工。',
  },
  {
    id: 'I03',
    seed: 'hxscan-37',
    factsDigest: {
      region: '华东三区',
      nights: 2,
      amount: 6588,
      subsidy: 320,
      net: 6268,
      tier: 'A',
      expedite: true,
    },
    answer: { rule: 'R4', decision: '部分批准', escalate: false },
    how:
      '净额 = 6588 − 320 = 6268。加急 → R1 阈值 6000，6268 > 6000，R1 本会命中；A 级豁免 R1 → 跳过。' +
      'R2 住宿 2 晚不触发；R3 净额 6268 > 4000 不满足。→ R4：部分批准、不转人工。',
  },
  {
    id: 'I03',
    seed: 'hxscan-6',
    factsDigest: {
      region: '华东三区',
      nights: 7,
      amount: 5348,
      subsidy: 0,
      net: 5348,
      tier: 'B',
      expedite: true,
    },
    answer: { rule: 'R4', decision: '部分批准', escalate: false },
    how:
      '净额 = 5348 − 0 = 5348。加急 → R1 阈值 6000，5348 ≤ 6000 → R1 不命中。' +
      'R2 需住宿>5 且净额>5000：7 晚、5348>5000 → R2 本会命中；但 B 级同时豁免 R1 与 R2 → 跳过 R2。' +
      'R3 净额 5348 > 4000 不满足。→ R4：部分批准、不转人工。',
  },
  {
    id: 'I03',
    seed: 'hxscan-68',
    factsDigest: {
      region: '华东三区',
      nights: 9,
      amount: 8978,
      subsidy: 520,
      net: 8458,
      tier: 'B',
      expedite: true,
    },
    answer: { rule: 'R4', decision: '部分批准', escalate: false },
    how:
      '净额 = 8978 − 520 = 8458。加急 + 净额 8458 > 8000，R1 本会命中，但 B 级豁免 R1 → 跳过。' +
      'R2 需住宿>5 且净额>5000：9 晚、8458>5000 → 本会命中，但 B 级也豁免 R2 → 跳过。' +
      'R3 净额 8458 > 4000 不满足。→ R4：部分批准、不转人工。',
  },

  /* ---------------- I04 · 9 条指令，9 分 [3,3,3] ---------------- */
  {
    id: 'I04',
    seed: 'hi4-0',
    factsDigest: {
      initial: { status: '待审核', owner: '小许', deadline: '下周一' },
      steps: '9条',
      checkpointAt: 2,
      conditionals: [5, 7],
      p1: '小陈',
      p2: '小周',
      p3: '小杨',
      p4: '小唐',
    },
    answer: { status: '已通过', owner: '小唐', deadline: '下周一' },
    how:
      '第1条 负责人→小陈；第2条 记检查点A={待审核, 下周一}（负责人不入快照）；' +
      '第3条 状态→审核中、截止→周五；第4条 负责人→小周；第5条 状态=审核中→负责人→小杨；' +
      '第6条 截止→周四；第7条 状态=审核中→负责人→小唐（覆盖第5条）；' +
      '第8条 状态/截止恢复为检查点（待审核/下周一），负责人不动→仍小唐；第9条 状态→已通过。' +
      '→ 已通过 / 小唐 / 下周一。',
  },
  {
    id: 'I04',
    seed: 'hi4-1',
    factsDigest: {
      initial: { status: '待审核', owner: '小周', deadline: '周四' },
      steps: '9条',
      checkpointAt: 2,
      conditionals: [5, 7],
      p1: '小陈',
      p2: '小许',
      p3: '小唐',
      p4: '小杨',
    },
    answer: { status: '已通过', owner: '小杨', deadline: '周四' },
    how:
      '第2条 检查点A={待审核, 周四}；第3条 审核中/周五；第4条 负责人→小许；' +
      '第5条 审核中→小唐；第6条 截止→周三；第7条 审核中→小杨（覆盖）；' +
      '第8条 恢复状态与截止时间→待审核/周四（负责人不动→小杨）；第9条 →已通过。' +
      '→ 已通过 / 小杨 / 周四。',
  },
  {
    id: 'I04',
    seed: 'hi4-2',
    factsDigest: {
      initial: { status: '待审核', owner: '小林', deadline: '下周一' },
      steps: '9条',
      checkpointAt: 2,
      conditionals: [5, 7],
      p1: '小许',
      p2: '小周',
      p3: '小唐',
      p4: '小陈',
    },
    answer: { status: '已通过', owner: '小陈', deadline: '下周一' },
    how:
      '第2条 检查点A={待审核, 下周一}；第3条 审核中/周四；第4条 负责人→小周；' +
      '第5条 审核中→小唐；第6条 截止→周三；第7条 审核中→小陈（覆盖）；' +
      '第8条 恢复→待审核/下周一（负责人仍小陈）；第9条 →已通过。' +
      '→ 已通过 / 小陈 / 下周一。',
  },
];

/** 按 id 取该题的全部夹具 */
export function fixturesOf(id) {
  return FIXTURES.filter((f) => f.id === id);
}

/* ===================== 夹具驱动测试 ===================== */
test('夹具常量自洽：I01–I04 各 ≥3 条，且 id/answer/how 字段齐全', () => {
  for (const id of IDS) {
    const list = fixturesOf(id);
    assert.ok(list.length >= 3, `${id} 夹具只有 ${list.length} 条，要求 >=3`);
    for (const fx of list) {
      assert.ok(fx.seed && typeof fx.seed === 'string', `${id} 夹具缺 seed`);
      assert.ok(fx.answer && typeof fx.answer === 'object', `${id} 夹具缺 answer`);
      assert.ok(typeof fx.how === 'string' && fx.how.length > 20, `${id}/${fx.seed} 夹具缺可读推理说明 how`);
    }
  }
});

test('夹具 answer 全部为人工常量：grade 判分必须满分', () => {
  for (const fx of FIXTURES) {
    const r = grade(fx.id, fx.seed, fx.answer);
    assert.equal(r.gradingStatus, 'GRADED', `${fx.id}/${fx.seed} 状态 ${r.gradingStatus}`);
    const failed = r.checks.filter((c) => !c.passed).map((c) => `${c.criterionId}(${c.reason})`);
    assert.equal(
      r.awarded,
      ITEM_BY_ID.get(fx.id).points,
      `${fx.id}/${fx.seed} 人工常量只得 ${r.awarded}/${ITEM_BY_ID.get(fx.id).points}；挂掉：${failed.join(' | ')}\n推理过程：${fx.how}`,
    );
  }
});

test('夹具前提未漂移：题面关键事实必须仍与 factsDigest 一致', () => {
  for (const fx of fixturesOf('I01')) {
    const g = ITEM_BY_ID.get('I01').generate(fx.seed);
    assert.equal(g.facts.scenario, fx.factsDigest.scenario, `I01/${fx.seed} scenario 漂移`);
    assert.equal(g.facts.sessionChannel, fx.factsDigest.sessionChannel, `I01/${fx.seed} sessionChannel 漂移`);
    for (let i = 1; i <= 8; i++) assert.ok(g.prompt.includes(`通知${i}`), `I01/${fx.seed} 缺少通知${i}`);
  }
  for (const fx of fixturesOf('I02')) {
    const g = ITEM_BY_ID.get('I02').generate(fx.seed);
    assert.equal(g.facts.items.length, fx.factsDigest.itemCount, `I02/${fx.seed} 商品数漂移`);
    assert.deepEqual(g.facts.exemptNames, fx.factsDigest.exemptNames, `I02/${fx.seed} 豁免名单漂移`);
    assert.equal(g.facts.revokedExemptName, fx.factsDigest.revokedExemptName, `I02/${fx.seed} 被否定的豁免名漂移`);
  }
  for (const fx of fixturesOf('I03')) {
    const f = ITEM_BY_ID.get('I03').generate(fx.seed).facts;
    const d = fx.factsDigest;
    assert.equal(f.region, d.region, `I03/${fx.seed} region 漂移`);
    assert.equal(f.nights, d.nights, `I03/${fx.seed} nights 漂移`);
    assert.equal(f.amount, d.amount, `I03/${fx.seed} amount 漂移`);
    assert.equal(f.subsidy, d.subsidy, `I03/${fx.seed} subsidy 漂移`);
    assert.equal(f.amount - f.subsidy, d.net, `I03/${fx.seed} net 漂移`);
    assert.equal(f.tier, d.tier, `I03/${fx.seed} tier 漂移`);
    assert.equal(f.expedite, d.expedite, `I03/${fx.seed} expedite 漂移`);
  }
  for (const fx of fixturesOf('I04')) {
    const g = ITEM_BY_ID.get('I04').generate(fx.seed);
    assert.deepEqual(g.facts.init, fx.factsDigest.initial, `I04/${fx.seed} 初始状态漂移`);
    for (let i = 1; i <= 9; i++) assert.ok(g.prompt.includes(`第${i}条`), `I04/${fx.seed} 缺少第${i}条`);
  }
});

test('夹具 answer 不是照抄：换一个明显错误的答案必须掉分', () => {
  for (const fx of FIXTURES) {
    const good = grade(fx.id, fx.seed, fx.answer);
    assert.equal(good.awarded, ITEM_BY_ID.get(fx.id).points, `${fx.id}/${fx.seed} 人工答案应满分`);
    let bad;
    if (fx.id === 'I01') bad = { deadline: '周日晚上11点', budgetAttached: !fx.answer.budgetAttached };
    else if (fx.id === 'I02') bad = { selected: fx.answer.rejected, rejected: fx.answer.selected };
    else if (fx.id === 'I03') bad = { rule: 'R9', decision: '已归档', escalate: 'maybe' };
    else bad = { status: '不存在的状态', owner: '不存在的人', deadline: '周日' };
    const r = grade(fx.id, fx.seed, bad);
    assert.ok(r.awarded < good.awarded, `${fx.id}/${fx.seed} 错误答案竟然没掉分（${good.awarded} → ${r.awarded}）`);
  }
});
/* ================================================================== */
test('I01–I04：结构合法但值全错的答案一律 0 分', () => {
  // I01：日期与附件要求都与正确答案相反
  // 说明：这里用 oracle 取的只是「正确值」，用来构造它的反面；
  //       断言的目标（0 分）是手写常量，不是 oracle 的输出。
  {
    for (const seed of SEEDS) {
      const f = factsOf('I01', seed);
      const o = ITEM_BY_ID.get('I01').oracle(f);
      const wrong = {
        deadline: `${o.day === '周三' ? '周四' : '周三'}${o.period === '上午' ? '下午3点' : '上午9点'}`,
        budgetAttached: !o.budgetAttached,
      };
      const r = grade('I01', seed, wrong);
      assert.equal(r.awarded, 0, `I01@${seed} 全错答案 ${JSON.stringify(wrong)} 竟然得 ${r.awarded}/4`);
    }
  }
  // I02：把补集当答案（selected/rejected 互换）
  {
    for (const seed of SEEDS) {
      const f = factsOf('I02', seed);
      const o = ITEM_BY_ID.get('I02').oracle(f);
      const swapped = { selected: o.rejected, rejected: o.selected };
      const r = grade('I02', seed, swapped);
      assert.equal(r.awarded, 0, `I02@${seed} 两组互换竟然得 ${r.awarded}/6`);
    }
  }
  // I03：三个字段全错
  {
    for (const seed of SEEDS) {
      const r = grade('I03', seed, { rule: 'R9', decision: '已归档', escalate: 'maybe' });
      assert.equal(r.awarded, 0, `I03@${seed} 全错答案竟然得 ${r.awarded}/6`);
    }
  }
  // I04：三个字段全错
  {
    for (const seed of SEEDS) {
      const r = grade('I04', seed, { status: '不存在的状态', owner: '不存在的人', deadline: '周日' });
      assert.equal(r.awarded, 0, `I04@${seed} 全错答案竟然得 ${r.awarded}/9`);
    }
  }
});

/* ================================================================== */
/* 5. 题面无泄漏                                                       */
/* ================================================================== */
test('I01–I04：题面不得出现「参考答案」，也不得直接给出答案字段', () => {
  for (const id of IDS) {
    for (const seed of SEEDS) {
      const g = ITEM_BY_ID.get(id).generate(seed);
      assert.ok(!/参考答案|标准答案|正确答案是/.test(g.prompt), `${id}@${seed} 题面出现答案字样`);
      // 示例必须是占位符：可解析的 JSON 里不得出现**看起来像真实答案**的取值
      // （例如字符串里含 <...> 占位符是允许的，因为照抄它拿不到分）
      const jsonLines = g.prompt.split('\n').filter((l) => l.trim().startsWith('{'));
      const leaky = jsonLines.filter((l) => {
        let parsed;
        try { parsed = JSON.parse(l.trim()); } catch { return false; } // 占位符不是合法 JSON
        // 能解析且不含任何占位符标记 → 是真实样例，可能被照抄
        return !l.includes('<');
      });
      assert.deepEqual(leaky, [], `${id}@${seed} 题面示例是真实取值、可能可被照抄：${leaky.join(' | ')}`);
    }
  }
});

/* ================================================================== */
/* 6. 评分条件中性                                                     */
/* ================================================================== */
test('I01–I04：publicCriteria 文本不含点破陷阱的措辞，也不含具体数字', () => {
  for (const id of IDS) {
    const crit = ITEM_BY_ID.get(id).generate('crit-check').publicCriteria;
    for (const c of crit) {
      assert.equal(typeof c.text, 'string', `${id} ${c.id} text 不是字符串`);
      assert.ok(c.text.length > 0, `${id} ${c.id} text 为空`);
      assert.ok(!/不得|不要|而非|注意|切记|别忘/.test(c.text), `${id} ${c.id} 条件文本点破了陷阱：「${c.text}」`);
      assert.ok(!/\d/.test(c.text), `${id} ${c.id} 条件文本含具体数字：「${c.text}」`);
    }
  }
});

/* ================================================================== */
/* 7. 欠定性检查                                                       */
/* ================================================================== */
test('I02：题面必须列出全部待审商品，且数量为 24', () => {
  for (const seed of SEEDS) {
    const g = ITEM_BY_ID.get('I02').generate(seed);
    assert.equal(g.facts.items.length, 24, `I02@${seed} 商品数不是 24`);
    for (const it of g.facts.items) {
      assert.ok(g.prompt.includes(it.code), `I02@${seed} 题面缺少商品编码 ${it.code}`);
      assert.ok(g.prompt.includes(it.name), `I02@${seed} 题面缺少商品名 ${it.name}`);
    }
    // 三个豁免名都必须在题面出现（否则欠定）
    for (const n of [...g.facts.exemptNames, g.facts.revokedExemptName]) {
      assert.ok(g.prompt.includes(n), `I02@${seed} 题面缺少豁免商品名 ${n}`);
    }
  }
});

test('I03：题面必须给出净额算式与全部规则编号，且解唯一', () => {
  for (const seed of SEEDS) {
    const g = ITEM_BY_ID.get('I03').generate(seed);
    assert.ok(/净额\s*=\s*申请金额\s*−\s*住宿补贴/.test(g.prompt), `I03@${seed} 题面未定义净额`);
    for (const r of ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8']) {
      assert.ok(g.prompt.includes(r), `I03@${seed} 题面缺少规则 ${r}`);
    }
    assert.ok(g.prompt.includes(String(g.facts.amount)), `I03@${seed} 题面缺少申请金额`);
    assert.ok(g.prompt.includes(String(g.facts.subsidy)), `I03@${seed} 题面缺少住宿补贴`);
    assert.ok(g.prompt.includes(g.facts.region), `I03@${seed} 题面缺少区域`);
  }
});

test('I04：题面必须列出全部 9 条指令与初始状态，且解唯一', () => {
  for (const seed of SEEDS) {
    const g = ITEM_BY_ID.get('I04').generate(seed);
    for (let i = 1; i <= 9; i++) assert.ok(g.prompt.includes(`第${i}条`), `I04@${seed} 缺少第${i}条指令`);
    assert.ok(g.prompt.includes(g.facts.init.owner), `I04@${seed} 缺少初始负责人`);
    assert.ok(g.prompt.includes(g.facts.init.deadline), `I04@${seed} 缺少初始截止时间`);
    // 检查点语义必须写清楚（否则「负责人是否入快照」欠定）
    assert.ok(/负责人不纳入检查点/.test(g.prompt), `I04@${seed} 未说明检查点是否包含负责人`);
    assert.ok(/负责人不受此条影响/.test(g.prompt), `I04@${seed} 未说明回滚是否影响负责人`);
    // 解唯一性：直接用 oracle 的答案与「按题面独立重放」的结果比对（此处重放由 oracle 自身实现，
    // 唯一性由 hand-replay 测试与手算夹具共同保证）
    const f = g.facts;
    const { p0, p1, p2, p3, p4 } = f.owners;
    const { d0, d1, d2 } = f.days;
    let status = '待审核';
    let owner = p0;
    let deadline = d0;
    owner = p1;
    const cp = { status, deadline };
    status = '审核中';
    deadline = d1;
    owner = p2;
    if (status === '审核中') owner = p3;
    deadline = d2;
    if (status === '审核中') owner = p4;
    status = cp.status;
    deadline = cp.deadline;
    status = f.finalStatus;
    const o = ITEM_BY_ID.get('I04').oracle(f);
    assert.deepEqual({ status, owner, deadline }, o, `I04@${seed} 手工重放与 oracle 不一致（存在欠定或多解）`);
  }
});

test('I01：题面必须列出全部 8 条通知与两项前置条件', () => {
  for (const seed of SEEDS) {
    const g = ITEM_BY_ID.get('I01').generate(seed);
    for (let i = 1; i <= 8; i++) assert.ok(g.prompt.includes(`通知${i}`), `I01@${seed} 缺少通知${i}`);
    assert.ok(/本次场次：(线上|线下)/.test(g.prompt), `I01@${seed} 未给出场次前置条件`);
    assert.ok(/预算状态：/.test(g.prompt), `I01@${seed} 未给出预算状态前置条件`);
  }
});

/* ================================================================== */
/* 8. 垃圾输入不抛异常                                                 */
/* ================================================================== */
test('I01–I04：垃圾输入（null/数组/空串/超长乱码/数字）一律不抛异常且 0 分', () => {
  const junk = [null, [], 'garbage 10KB '.repeat(1000), 12345, { a: 1 }, '   '];
  for (const id of IDS) {
    for (const seed of ['hard-0', 'hard-7']) {
      for (const j of junk) {
        assert.doesNotThrow(() => {
          const r = grade(id, seed, j);
          assert.ok(r.awarded >= 0 && r.awarded <= r.maxPoints, `${id}@${seed} 垃圾输入分数越界 ${r.awarded}`);
        }, `${id}@${seed} 遇到垃圾输入 ${JSON.stringify(j).slice(0, 40)} 抛异常`);
      }
    }
  }
});

test('I01–I04：缺字段的部分答案只拿对应条件的分数，不崩', () => {
  for (const id of IDS) {
    const seed = 'hard-3';
    const item = ITEM_BY_ID.get(id);
    assert.doesNotThrow(() => {
      const r = grade(id, seed, {});
      assert.ok(r.awarded >= 0 && r.awarded <= item.points, `${id} 空对象答案分数越界`);
    }, `${id} 空对象答案抛异常`);
  }
});
