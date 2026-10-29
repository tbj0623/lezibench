/**
 * 回归测试：把红队/真机考试发现的每一个真实缺陷都钉死。
 *
 * 每条用例都必须能在「修复被回退」时变红。命名里带上发现来源，
 * 方便以后有人问「这条测试哪来的」时能追溯。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, instantiateInternal, criteriaOf } from '../src/exam/manifest.mjs';
import { gradeItem } from '../src/grading/grade.mjs';
import { perfectAnswers } from '../scripts/oracle-answers.mjs';

const item = (id) => ITEMS.find((i) => i.id === id);
const grade = (id, ans, seed) => gradeItem(instantiateInternal(item(id), seed), ans, { seed });

/* ------------------------------------------------------------------ *
 * BUG-1（skill-host 真机考试发现）：R04 题面没给颜色集合 → 欠定
 * 现象：连续两局 R04 都是 3/9，第 4 人颜色有 3 种可能。
 * ------------------------------------------------------------------ */
test('BUG-1 R04: 题面必须写全 4 种颜色，且正确答案能拿满分', () => {
  for (const seed of ['host-trial-2026', 'host-trial-v2', 'a', '42', 'zzz']) {
    const g = item('R04').generate(seed);
    for (const c of g.facts.colors) {
      assert.ok(g.prompt.includes(c), `seed=${seed} 题面缺少颜色 ${c}`);
    }
    const r = grade('R04', perfectAnswers(seed).R04, seed);
    assert.equal(r.awarded, 9, `seed=${seed} 正确答案只拿到 ${r.awarded}/9`);
  }
});

/* ------------------------------------------------------------------ *
 * BUG-2（redteam-qa 发现）：R02 题面示例 JSON 恰好就是标准答案
 * 现象：照抄示例 → 6/6，400/400 个 seed 全中。
 * ------------------------------------------------------------------ */
test('BUG-2 R02: 示例不得是可直接照抄的答案', () => {
  for (const seed of ['42', 'a', 'b', 'c', 'd']) {
    const g = item('R02').generate(seed);
    // 题面里不应出现「五个连续大写字母」形式的完整顺序
    assert.ok(!/"order"\s*:\s*\[\s*"A"\s*,\s*"B"\s*,\s*"C"\s*,\s*"D"\s*,\s*"E"\s*\]/.test(g.prompt), '示例仍是完整答案');
    assert.ok(g.prompt.includes('<'), '示例应使用占位符');
  }
});

/* ------------------------------------------------------------------ *
 * BUG-3（redteam-qa 发现）：C03 题面示例恰好就是标准答案
 * 现象：照抄 → 6/6，且四笔申请的答案与 seed 无关。
 * ------------------------------------------------------------------ */
test('BUG-3 C03: 示例不得是答案，且四笔金额必须随 seed 变化', () => {
  const prompts = new Set();
  const answers = new Set();
  for (const seed of ['42', 'a', 'b', '1', '2', '3']) {
    const g = item('C03').generate(seed);
    prompts.add(g.prompt);
    answers.add(JSON.stringify(item('C03').oracle(g.facts)));
    assert.ok(!/"a1"\s*:\s*\{\s*"rule"\s*:\s*"旧"\s*,\s*"needManual"\s*:\s*true\s*\}/.test(g.prompt), 'a1 示例仍是答案');
    assert.ok(g.prompt.includes('<'), '示例应使用占位符');
  }
  assert.ok(prompts.size > 1, '不同 seed 题面应不同');
  assert.ok(answers.size > 1, '不同 seed 答案应不同（否则可背答案）');
});

/* ------------------------------------------------------------------ *
 * BUG-4（redteam-qa 发现）：I01.C1 条件文本硬编码「周三/上午」
 * 现象：seed=42 正确答案是周四，按条件文本作答反而被扣分。
 * ------------------------------------------------------------------ */
test('BUG-4 I01: 评分条件文本不得硬编码具体日期/时段', () => {
  const crit = criteriaOf(item('I01'));
  for (const c of crit) {
    assert.ok(!/周三|周四|周五|周二/.test(c.text), `条件 ${c.id} 文本硬编码了星期：${c.text}`);
  }
  // 而且正确答案必须在任意 seed 下都通过条件
  for (const seed of ['1', '2', '3', '42', '99']) {
    const r = grade('I01', perfectAnswers(seed).I01, seed);
    assert.equal(r.awarded, 4, `seed=${seed} I01 正确答案 ${r.awarded}/4`);
  }
});

/* ------------------------------------------------------------------ *
 * BUG-5（redteam-qa 发现）：I04 说「提前到」但实际日期更晚
 * ------------------------------------------------------------------ */
test('BUG-5 I04: 更新指令不得出现「提前」却延后的自相矛盾', () => {
  const DAY_ORDER = ['周三', '周四', '周五', '下周一'];
  for (let i = 0; i < 60; i++) {
    const g = item('I04').generate(`i04-${i}`);
    const t = g.prompt;
    assert.ok(!/提前到/.test(t), `seed i04-${i} 仍使用「提前到」`);
    const m = t.match(/截止时间由「([^」]+)」调整为「([^」]+)」/);
    if (m) {
      // 中性的「调整为」允许两个方向，但必须能在日期表里找到
      assert.ok(DAY_ORDER.includes(m[1]), `未知日期 ${m[1]}`);
      assert.ok(DAY_ORDER.includes(m[2]), `未知日期 ${m[2]}`);
    }
  }
});

/* ------------------------------------------------------------------ *
 * BUG-6（redteam-qa 发现）：D02.C3 正则误杀正确推理
 * 现象：「无法判断甲是否少于乙」被判成「把预算当最终支出」。
 * ------------------------------------------------------------------ */
test('BUG-6 D02: 含「无法判断甲是否少于乙」的正确理由必须满分', () => {
  for (const seed of ['q', 'a', 'b']) {
    const internal = instantiateInternal(item('D02'), seed);
    const reason = '甲项目的最终支出未知，因此无法判断甲是否少于乙项目的实际支出。';
    const r = gradeItem(internal, { answer: 'C', reason }, { seed });
    assert.equal(r.awarded, 6, `seed=${seed} 正确理由只拿到 ${r.awarded}/6`);
  }
});

test('BUG-6b D02: 真的把预算数字当最终支出比较，必须被扣分', () => {
  const internal = instantiateInternal(item('D02'), 'q');
  const budget = internal.facts.projectA_Budget;
  const reason = `甲预算${budget}万元，比乙的最终支出少，所以甲更省钱。`;
  const r = gradeItem(internal, { answer: 'C', reason }, { seed: 'q' });
  assert.ok(r.checks.find((c) => c.criterionId === 'D02.C3').passed === false, '应当扣掉 C3');
});

/* ------------------------------------------------------------------ *
 * BUG-7（redteam-qa 发现）：C04.C1 误杀带排除说明的正确 rootCause
 * 现象：「数量用错（不是单价问题）」只拿 6/9。
 * ------------------------------------------------------------------ */
test('BUG-7 C04: 「数量用错（不是单价问题）」必须通过 C1', () => {
  const internal = instantiateInternal(item('C04'), 'q');
  const o = item('C04').oracle(internal.facts);
  const r = gradeItem(internal, { rootCause: '数量用错（不是单价问题）', fixedSubtotal: o.fixedSubtotal, fixedTotal: o.fixedTotal }, { seed: 'q' });
  assert.equal(r.awarded, 9, `只拿到 ${r.awarded}/9`);
});

test('BUG-7b C04: 选错根因（单价用错）不得通过 C1', () => {
  const internal = instantiateInternal(item('C04'), 'q');
  const o = item('C04').oracle(internal.facts);
  const r = gradeItem(internal, { rootCause: '单价用错', fixedSubtotal: o.fixedSubtotal, fixedTotal: o.fixedTotal }, { seed: 'q' });
  assert.ok(r.checks.find((c) => c.criterionId === 'C04.C1').passed === false, '选错根因不应通过 C1');
});

/* ------------------------------------------------------------------ *
 * BUG-8（redteam-qa 发现）：D02 垃圾输入落到 GRADED 而不是 UNPARSEABLE
 * ------------------------------------------------------------------ */
test('BUG-8 D02: 纯噪声输入必须 UNPARSEABLE，不能静默 0 分当知识错误', () => {
  for (const seed of ['q', 'a', 'b']) {
    const r = grade('D02', 'asdkjhqwe@@@!!!', seed);
    assert.equal(r.gradingStatus, 'UNPARSEABLE', `seed=${seed} 得到 ${r.gradingStatus}`);
  }
});

/* ------------------------------------------------------------------ *
 * BUG-9（Lead 自查发现）：冲突答案被宽松散文兜底「挑有利值」
 * ------------------------------------------------------------------ */
test('BUG-9 冲突答案不得被散文兜底挑出有利值', () => {
  const seed = 'conflict';
  const good = perfectAnswers(seed);
  const text = `答案一：{"total":${good.R01.total}}\n答案二：{"total":1}`;
  const r = grade('R01', text, seed);
  assert.equal(r.gradingStatus, 'UNPARSEABLE', `状态应为 UNPARSEABLE，实际 ${r.gradingStatus}`);
  assert.equal(r.awarded, 0);
});

/* ------------------------------------------------------------------ *
 * BUG-10（Lead 自查发现）：summarize 把「没答完」当「考完了」
 * ------------------------------------------------------------------ */
test('BUG-10 只答了 8/16 题时不得给段位、不得报 COMPLETED', async () => {
  const { summarize } = await import('../src/grading/grade.mjs');
  const seed = 'partial-summary';
  const all = ITEMS.map((it) => gradeItem(instantiateInternal(it, seed), perfectAnswers(seed)[it.id], { seed }));
  const s = summarize(all.slice(0, 8), {});
  assert.equal(s.status, 'PARTIAL');
  assert.equal(s.level, null, '未答完不得给段位');
  assert.equal(s.completed, false);
  assert.equal(s.expectedItems, 16);
});

/* ------------------------------------------------------------------ *
 * BUG-11（Lead 自查发现）：regrade 信任文件内自带的哈希
 * 现象：同时改 rawAnswer 与 rawAnswerSha256 可以蒙混过关。
 * ------------------------------------------------------------------ */
test('BUG-11 regrade 必须从原始答案重算哈希，而非信任文件字段', async () => {
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const path = await import('node:path');
  const os = await import('node:os');
  const { startRun, submitBatch, regradeRun, loadState } = await import('../src/runner.mjs');
  const { itemsForBatch, BATCHES } = await import('../src/exam/manifest.mjs');
  const { sha256Hex } = await import('../src/exam/rng.mjs');
  const root = await mkdtemp(path.join(os.tmpdir(), 'lezi-regrade-'));
  try {
    const seed = 'regrade-hash';
    const { runId } = await startRun({ root, seed });
    const answers = perfectAnswers(seed);
    for (const b of BATCHES) {
      await submitBatch({ root, runId, batch: b, answers: Object.fromEntries(itemsForBatch(b).map((i) => [i.id, answers[i.id]])) });
    }
    const { paths } = await loadState(root, runId);
    const f = path.join(paths.answers, '1-I01.json');
    const saved = JSON.parse(await readFile(f, 'utf8'));
    saved.rawAnswer = { deadline: '篡改', budgetAttached: true };
    // 连哈希一起改，试图蒙混
    saved.rawAnswerSha256 = sha256Hex(JSON.stringify(saved.rawAnswer));
    await writeFile(f, JSON.stringify(saved), 'utf8');
    await assert.rejects(() => regradeRun({ root, runId }), /指纹与记录不一致/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * BUG-12：免费分（退化答案也能拿部分分）
 * 现象：R02 乱序仍拿 C1、R03 全 0 仍拿 C2。
 * ------------------------------------------------------------------ */
test('BUG-12 R02: 顺序完全倒过来时不得拿到任何分', () => {
  const r = grade('R02', { order: ['E', 'D', 'C', 'B', 'A'], first: 'E', last: 'A' }, 'a');
  assert.equal(r.awarded, 0, `倒序仍拿 ${r.awarded}/6`);
});

test('BUG-12b R03: 全 0 方案不得因「没超上限」白拿分', () => {
  const r = grade('R03', { veg: 0, chicken: 0, beef: 0 }, 'a');
  assert.equal(r.awarded, 0, `全 0 仍拿 ${r.awarded}/6`);
});

/* ------------------------------------------------------------------ *
 * 通用不变量：任何题目在任何 seed 下，正确答案都必须满分
 * ------------------------------------------------------------------ */
test('不变量: 所有 16 题在 12 个 seed 下正确答案均满分', () => {
  const seeds = ['1', '2', '3', '42', '100', 'a', 'b', 'c', 'host-trial-2026', 'host-trial-v2', '中文', 'x'.repeat(30)];
  for (const seed of seeds) {
    const ans = perfectAnswers(seed);
    for (const it of ITEMS) {
      const r = grade(it.id, ans[it.id], seed);
      assert.equal(r.awarded, it.points, `seed=${seed} ${it.id}: ${r.awarded}/${it.points} 失败条件 ${r.checks.filter((c) => !c.passed).map((c) => c.criterionId).join(',')}`);
    }
  }
});

/* ------------------------------------------------------------------ *
 * BUG-13（Lead 真机考试发现）：R04 线索退化成「纯抄写」
 * 现象：6 条线索全是「X 坐在 n 号位 / X 的卡片是 c 色」，看一遍就能填，
 *       测的是抄写而不是推理。
 * ------------------------------------------------------------------ */
test('BUG-13 R04: 线索不得退化为纯直述，必须含推理成分', () => {
  for (let i = 0; i < 20; i++) {
    const g = item('R04').generate(`degenerate-${i}`);
    const lines = g.prompt.split('\n').filter((l) => /^\d\) /.test(l));
    assert.equal(lines.length, 6, `seed degenerate-${i} 线索数不是 6`);
    const directCount = lines.filter((l) => /坐在 \d 号位|的卡片是.{1,3}色|号位的卡片是.{1,3}色/.test(l)).length;
    const relationalCount = lines.filter((l) => /位置编号比/.test(l)).length;
    const negativeCount = lines.filter((l) => /不在 \d 号位|卡片不是/.test(l)).length;
    assert.ok(directCount < 6, `seed degenerate-${i} 6 条全是直述，被测的是抄写`);
    assert.ok(relationalCount + negativeCount >= 2, `seed degenerate-${i} 推理型线索不足（相对${relationalCount}/否定${negativeCount}）`);
  }
});

/* ------------------------------------------------------------------ *
 * BUG-14（Lead 真机考试发现）：resume 崩溃
 * 现象：`node scripts/cli.mjs resume` 报 "it.criteria is not iterable"
 * ------------------------------------------------------------------ */
test('BUG-14 resume: 能把下一批题目正常渲染出来（字段名要对齐）', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const path = await import('node:path');
  const os = await import('node:os');
  const { startRun, submitBatch } = await import('../src/runner.mjs');
  const { itemsForBatch } = await import('../src/exam/manifest.mjs');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  const root = await mkdtemp(path.join(os.tmpdir(), 'lezi-resume-'));
  try {
    const seed = 'resume-render';
    const { runId } = await startRun({ root, seed });
    const answers = perfectAnswers(seed);
    await submitBatch({ root, runId, batch: 1, answers: Object.fromEntries(itemsForBatch(1).map((i) => [i.id, answers[i.id]])) });
    const cliPath = path.resolve(import.meta.dirname, '..', 'scripts', 'cli.mjs');
    const { stdout } = await run(process.execPath, [cliPath, 'resume', '--run', runId], {
      cwd: path.resolve(import.meta.dirname, '..'),
      env: { ...process.env, LEZIBENCH_HOME: root },
      timeout: 60000,
    });
    assert.ok(stdout.includes('第 2/4 批'), 'resume 应显示下一批');
    assert.ok(!stdout.includes('is not iterable'), 'resume 不应崩溃');
    assert.ok(stdout.includes('评分条件'), 'resume 应渲染出评分条件');
    // 维度应显示中文标签，而不是 instruction/reasoning 这种内部 key
    assert.ok(!/· (instruction|reasoning|data|correction)）/.test(stdout), 'resume 显示了内部维度 key');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * BUG-15（Lead 真机考试发现）：缺答被静默接受
 * 现象：一批只写了 3 题答案，CLI 照单全收，剩下 1 题按 0 分处理，
 *       当事 Agent 完全没意识到自己漏答了（真机考试因此白丢 6 分）。
 * ------------------------------------------------------------------ */
test('BUG-15 缺答必须阻断提交，除非显式 --allow-missing', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const path = await import('node:path');
  const os = await import('node:os');
  const { startRun, submitBatch } = await import('../src/runner.mjs');
  const { itemsForBatch } = await import('../src/exam/manifest.mjs');
  const root = await mkdtemp(path.join(os.tmpdir(), 'lezi-missing-'));
  try {
    const seed = 'missing-guard';
    const { runId } = await startRun({ root, seed });
    const answers = perfectAnswers(seed);
    const partial = Object.fromEntries(itemsForBatch(1).slice(0, 3).map((i) => [i.id, answers[i.id]]));
    // 默认必须拒绝
    await assert.rejects(
      () => submitBatch({ root, runId, batch: 1, answers: partial }),
      /没答案/,
      '缺答时应抛错并点名缺哪几题',
    );
    // 显式允许时才通过
    const ok = await submitBatch({ root, runId, batch: 1, answers: partial, allowMissing: true });
    assert.equal(ok.missingIds.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
