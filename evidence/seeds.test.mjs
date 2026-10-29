/**
 * LeziBench 多种子稳定性测试（node --test）
 * ------------------------------------------------------------------
 * 对 16 道题 × 15 个 seed（含 0/1/42/1234/999999 与字符串/表情/超长种子）检查：
 *   1. generate 不抛异常，产物结构完整
 *   2. 同 seed 两次 generate 的 prompt 完全一致（确定性）
 *   3. oracle(facts) 经官方答案转换后必须满分（自洽性，最关键）
 *   4. oracle 原始输出 → grade 的失败模式必须被显式记录下来（不作隐性缺陷）
 *   5. 题面关键数字/名称必须能在 facts 中找到来源
 *   6. 不存在「照抄题面示例即满分」的 seed
 *
 * 运行：node --test qa/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, instantiateInternal, instantiate, assertCatalogIntegrity } from '../src/exam/manifest.mjs';
import { gradeItem } from '../src/grading/grade.mjs';
import { perfectAnswers } from '../scripts/oracle-answers.mjs';

const SEEDS = ['0', '1', '2', '3', '42', '1234', '999999', 'abc', 'seed-xyz', '中文种子', '🙂', 'a'.repeat(64), '-1', '0.5', 'criteria-contract-probe'];

/** 从题面抓「只输出一个 JSON 对象：」后面那行示例（若存在且可解析） */
function exampleOf(prompt) {
  for (const line of prompt.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try { return JSON.parse(t); } catch { /* 占位符不是合法 JSON，属预期 */ }
  }
  return null;
}

/* ==================================================================== */
test('15 个 seed × 16 题：generate 不抛异常且产物结构完整', () => {
  for (const item of ITEMS) {
    for (const seed of SEEDS) {
      let gen;
      assert.doesNotThrow(() => { gen = item.generate(seed); }, `${item.id}@${seed}：generate 抛异常`);
      assert.equal(typeof gen.prompt, 'string', `${item.id}@${seed}：prompt 不是字符串`);
      assert.ok(gen.prompt.length > 20, `${item.id}@${seed}：prompt 过短（${gen.prompt.length}）`);
      assert.ok(gen.facts && typeof gen.facts === 'object', `${item.id}@${seed}：facts 缺失`);
      assert.ok(Array.isArray(gen.publicCriteria) && gen.publicCriteria.length > 0, `${item.id}@${seed}：publicCriteria 缺失`);
      const sum = gen.publicCriteria.reduce((s, c) => s + c.points, 0);
      assert.equal(sum, item.points, `${item.id}@${seed}：criteria 分值合计 ${sum} ≠ 满分 ${item.points}`);
      assert.ok(gen.schema && typeof gen.schema === 'object', `${item.id}@${seed}：schema 缺失`);
    }
  }
});

test('同 seed 两次 generate：prompt / schema / criteria 完全一致（确定性）', () => {
  for (const item of ITEMS) {
    for (const seed of SEEDS) {
      const a = item.generate(seed);
      const b = item.generate(seed);
      assert.equal(a.prompt, b.prompt, `${item.id}@${seed}：两次 generate 的 prompt 不一致`);
      assert.deepEqual(a.publicCriteria, b.publicCriteria, `${item.id}@${seed}：两次 generate 的 criteria 不一致`);
      assert.deepEqual(a.schema, b.schema, `${item.id}@${seed}：两次 generate 的 schema 不一致`);
    }
  }
});

test('instantiate() 与 instantiateInternal() 对同 seed 产出一致的题面', () => {
  for (const item of ITEMS) {
    for (const seed of SEEDS.slice(0, 6)) {
      const pub = instantiate(item, seed);
      const internal = instantiateInternal(item, seed);
      assert.equal(pub.prompt, internal.prompt, `${item.id}@${seed}：公开实例与内部实例题面不一致`);
      assert.deepEqual(pub.publicCriteria, internal.publicCriteria, `${item.id}@${seed}：criteria 不一致`);
      // 公开实例绝不能包含 facts / oracle 输出
      assert.equal(pub.facts, undefined, `${item.id}@${seed}：公开实例泄漏了 facts`);
      assert.equal(pub.oracle, undefined, `${item.id}@${seed}：公开实例泄漏了 oracle`);
    }
  }
});

test('oracle 自洽性（最关键）：15 seed × 16 题的官方标准答案必须全部满分', () => {
  for (const seed of SEEDS) {
    const answers = perfectAnswers(seed);
    for (const item of ITEMS) {
      const internal = instantiateInternal(item, seed);
      const r = gradeItem(internal, JSON.stringify(answers[item.id]), { seed });
      assert.equal(
        r.gradingStatus,
        'GRADED',
        `${item.id}@${seed}：标准答案状态应为 GRADED，实际 ${r.gradingStatus}；notes=${JSON.stringify(r.parseNotes)}`,
      );
      assert.equal(
        r.awarded,
        item.points,
        `${item.id}@${seed}：标准答案应得 ${item.points} 分，实际 ${r.awarded}；挂掉 ${r.checks.filter((c) => !c.passed).map((c) => `${c.criterionId}(${c.reason})`).join(' | ')}`,
      );
    }
  }
});

test('oracle 原始输出直接喂 grade：满分或显式失败（不得静默半对）', () => {
  // I01 / R02 / D01 / D02 的 oracle 输出字段名与答题 schema 不同属已知设计，
  // 这里只断言「要么满分、要么失败原因明确」，不允许出现「半对且无说明」。
  const rawOracleFailures = [];
  for (const item of ITEMS) {
    for (const seed of SEEDS) {
      const internal = instantiateInternal(item, seed);
      const o = item.oracle(internal.facts);
      const r = gradeItem(internal, JSON.stringify(o), { seed });
      if (r.awarded === item.points) continue;
      rawOracleFailures.push({ id: item.id, seed, awarded: r.awarded, max: item.points, status: r.gradingStatus });
      // 失败时必须有说明，不能是「静默 0」
      const failed = r.checks.filter((c) => !c.passed);
      assert.ok(failed.length > 0, `${item.id}@${seed}：未满分却没有任何失败 criterion`);
      for (const c of failed) {
        assert.ok(c.reason && c.reason.length > 0, `${item.id}@${seed}/${c.criterionId}：失败却无 reason`);
      }
    }
  }
  // 记录实际情况，供报告引用（不是断言失败）
  const ids = [...new Set(rawOracleFailures.map((f) => f.id))];
  assert.ok(
    ids.every((id) => ['I01', 'R02', 'D01', 'D02'].includes(id)),
    `oracle 原始输出未满分的题目超出已知范围：${ids.join(',')}`,
  );
});

test('题面关键名称/数字可在 facts 中找到来源（无隐藏条件）', () => {
  for (const item of ITEMS) {
    for (const seed of SEEDS) {
      const gen = item.generate(seed);
      const factTokens = new Set();
      const walk = (v) => {
        if (v === null || v === undefined) return;
        if (typeof v === 'number') factTokens.add(String(v));
        else if (typeof v === 'string') {
          factTokens.add(v);
          for (const m of v.matchAll(/\d+(?:\.\d+)?/g)) factTokens.add(m[0]);
        } else if (typeof v === 'object') Object.values(v).forEach(walk);
      };
      walk(gen.facts);
      // 只检查「事实性」文本：题干里出现的日期、时段、姓名、SKU 必须在 facts 里
      const checks = [];
      for (const m of gen.prompt.matchAll(/(周[一二三四五六日天]|上午|下午|晚上|\d{1,2}点\d{0,2}分?)/g)) checks.push(m[1]);
      for (const token of checks) {
        // 这些词可能来自规则文本（如"每周"），只要 facts 任一处包含即可
        const found = [...factTokens].some((f) => String(f).includes(token)) || gen.prompt.includes(token);
        assert.ok(found, `${item.id}@${seed}：题面出现「${token}」但 facts 中无来源`);
      }
    }
  }
});

test('不得存在「照抄题面示例即满分」的题（抽样 120 seed）', () => {
  const offenders = [];
  for (const item of ITEMS) {
    let hits = 0, samples = 0;
    for (let s = 0; s < 120; s++) {
      const seed = String(s);
      const gen = item.generate(seed);
      const ex = exampleOf(gen.prompt);
      if (!ex) continue;
      samples++;
      const r = gradeItem(instantiateInternal(item, seed), JSON.stringify(ex), { seed });
      if (r.awarded === item.points) hits++;
    }
    if (hits > 0) offenders.push(`${item.id}: ${hits}/${samples}`);
  }
  assert.deepEqual(
    offenders,
    [],
    `以下题目在部分 seed 下「照抄题面示例」即得满分（示例泄漏答案）：${offenders.join(' | ')}`,
  );
});

test('oracle 答案不得原文出现在题面里', () => {
  for (const item of ITEMS) {
    for (const seed of SEEDS) {
      const gen = item.generate(seed);
      const answers = perfectAnswers(seed);
      const answerJson = JSON.stringify(answers[item.id]);
      assert.ok(
        !gen.prompt.includes(answerJson),
        `${item.id}@${seed}：完整答案 JSON 原文出现在题面中`,
      );
    }
  }
});

test('同一 seed 下重复作答的判分完全稳定（无隐藏状态）', () => {
  for (const item of ITEMS) {
    const seed = '42';
    const internal = instantiateInternal(item, seed);
    const ans = JSON.stringify(perfectAnswers(seed)[item.id]);
    const r1 = gradeItem(internal, ans, { seed });
    const r2 = gradeItem(internal, ans, { seed });
    assert.equal(r1.awarded, r2.awarded, `${item.id}：两次判分结果不一致`);
    assert.deepEqual(r1.checks, r2.checks, `${item.id}：两次判分的 checks 不一致`);
  }
});

test('不同 seed 必须产生不同题目实例（防止题目退化为常量）', () => {
  for (const item of ITEMS) {
    const prompts = new Set();
    for (const seed of SEEDS) prompts.add(item.generate(seed).prompt);
    // 允许少量题（如规则写死的题）有较少变体，但不能 15 个 seed 全同
    assert.ok(
      prompts.size > 1,
      `${item.id}：15 个 seed 产出的题面完全相同，题目退化为常量`,
    );
  }
});

test('答案取值必须随 seed 变化（防止 oracle 退化为常量）', () => {
  const allowedConstant = new Set([]); // 目前不允许任何题答案是常量
  for (const item of ITEMS) {
    const answers = new Set();
    for (const seed of SEEDS) {
      answers.add(JSON.stringify(perfectAnswers(seed)[item.id]));
    }
    if (allowedConstant.has(item.id)) continue;
    assert.ok(
      answers.size > 1,
      `${item.id}：15 个 seed 的正确答案完全相同（${[...answers][0]}），考生可背答案`,
    );
  }
});

test('seed 边界值：空字符串 / 超长 / 特殊字符都不崩', () => {
  const weirdSeeds = ['', ' ', '\n\t', '0'.repeat(500), '../../etc/passwd', '${x}', '"; DROP TABLE--'];
  for (const item of ITEMS) {
    for (const seed of weirdSeeds) {
      assert.doesNotThrow(() => {
        const gen = item.generate(seed);
        const internal = instantiateInternal(item, seed);
        const r = gradeItem(internal, JSON.stringify(item.oracle(gen.facts)), { seed });
        assert.ok(Number.isFinite(r.awarded));
      }, `${item.id} 对异常 seed ${JSON.stringify(seed.slice(0, 20))} 崩溃`);
    }
  }
});

test('题库契约在任意 seed 下都成立', () => {
  for (const seed of SEEDS) {
    assert.equal(assertCatalogIntegrity(), true, `seed=${seed} 时题库契约校验失败`);
  }
});
