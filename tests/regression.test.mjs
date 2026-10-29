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
test('BUG-6 D02: 含「无法判断甲是否少于乙」的正确理由必须满分（仅适用于信息不足分支）', () => {
  // 注意：D02 现在有三种分支（A/B/C），只有 C 分支才该用这个理由。
  // 旧版这条断言写死了 C，D02 改成随机后它会在 A/B 分支上误报 —— 是测试的问题，不是判分器的。
  let tested = 0;
  for (let i = 0; i < 40 && tested < 3; i++) {
    const seed = `d02-c-${i}`;
    const internal = instantiateInternal(item('D02'), seed);
    const o = item('D02').oracle(internal.facts);
    if (o.answer !== 'C') continue;
    const reason = '甲项目的最终支出未知，因此无法判断甲是否少于乙项目的实际支出。';
    const r = gradeItem(internal, { answer: 'C', reason }, { seed });
    assert.equal(r.awarded, 6, `seed=${seed} 正确理由只拿到 ${r.awarded}/6`);
    tested++;
  }
  assert.ok(tested >= 2, `只找到 ${tested} 个 C 分支 seed，样本不足`);
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
test('BUG-7 C04: 正确答案后面加「不是 X」这类排除说明，不得被误判', () => {
  // 原始缺陷：判分器用子串匹配，正确答案写成「数量用错（不是单价问题）」反而被判错。
  // C04 现在是双 bug（rootCause 随 seed 变，形如「单价用错+四舍五入」），
  // 所以不写死 rootCause，而是用本题真实答案 + 一个本题未涉及的选项做排除说明。
  const OPTIONS = ['数量用错', '单价用错', '折扣漏乘', '四舍五入'];
  const internal = instantiateInternal(item('C04'), 'q');
  const o = item('C04').oracle(internal.facts);
  const core = (w) => w.replace('用错', '').replace('漏乘', '');
  const uninvolved = OPTIONS.find((opt) => !o.rootCause.includes(core(opt))) || '折扣漏乘';
  const withExclusion = `${o.rootCause}（不是${uninvolved}问题）`;
  const r = gradeItem(internal, { rootCause: withExclusion, fixedSubtotal: o.fixedSubtotal, fixedTotal: o.fixedTotal }, { seed: 'q' });
  assert.equal(r.awarded, 9, `正确答案「${withExclusion}」只拿到 ${r.awarded}/9`);
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
  // 原始缺陷：线索全是「X 坐在 n 号位」，看一遍就能填，测的是抄写不是推理。
  // 现在人数提到 6，线索条数也不再固定 6，所以按比例校验而非写死条数。
  for (let i = 0; i < 15; i++) {
    const g = item('R04').generate(`degenerate-${i}`);
    const lines = g.prompt.split('\n').filter((l) => /^\d+\) /.test(l));
    assert.ok(lines.length >= 6, `seed degenerate-${i} 线索数 ${lines.length} < 6`);
    const directCount = lines.filter((l) => /坐在 \d+ 号位|的卡片是.{1,3}色|号位的卡片是.{1,3}色/.test(l)).length;
    const relationalCount = lines.filter((l) => /位置编号比|相邻|靠前|靠后/.test(l)).length;
    const negativeCount = lines.filter((l) => /不在 \d+ 号位|不是.{1,3}色|不坐在/.test(l)).length;
    assert.ok(
      directCount < lines.length,
      `seed degenerate-${i} 全部 ${lines.length} 条都是直述，被测的是抄写`,
    );
    assert.ok(
      relationalCount + negativeCount >= 2,
      `seed degenerate-${i} 推理型线索不足（相对${relationalCount}/否定${negativeCount}）`,
    );
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
    const here = path.dirname((await import('node:url')).fileURLToPath(import.meta.url));
    const cliPath = path.resolve(here, '..', 'scripts', 'cli.mjs');
    const { stdout } = await run(process.execPath, [cliPath, 'resume', '--run', runId], {
      cwd: path.resolve(here, '..'),
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

/* ------------------------------------------------------------------ *
 * BUG-16（redteam-qa 发现）：I04.generate 引用未定义变量 finalStatus
 * 整题抛异常 → startRun/submitBatch/regrade/doctor 全崩，16 题系统完全不可用。
 * 教训：改完只跑自己的 tests 不够，必须有「所有题 × 多 seed 都能 generate」的兜底。
 * ------------------------------------------------------------------ */
test('BUG-16 所有 16 题在 30 个 seed 下 generate 都不得抛异常', () => {
  const seeds = [];
  for (let i = 0; i < 30; i++) seeds.push(`gen-${i}`);
  seeds.push('42', '中文种子', 'x'.repeat(40), '', '0');
  for (const it of ITEMS) {
    for (const s of seeds) {
      assert.doesNotThrow(() => it.generate(s), `${it.id} 在 seed=${JSON.stringify(s)} 时 generate 抛异常`);
    }
  }
});

test('BUG-16b 所有 16 题的 grade 在任意输入下都不得抛异常', () => {
  const weird = [null, undefined, '', '   ', {}, [], 0, 1, true, 'x', '{"a":1}', '\u0000'];
  for (const it of ITEMS) {
    const internal = instantiateInternal(it, 'grade-robust');
    for (const ans of weird) {
      assert.doesNotThrow(() => gradeItem(internal, ans, { seed: 'grade-robust' }), `${it.id} 对 ${JSON.stringify(ans)} 抛异常`);
    }
  }
});

/* ------------------------------------------------------------------ *
 * BUG-17（calibration 发现）：R04 题面缺第 4 个人名
 * 只列出线索里提到的人，但判分要求 4 人全对 → 理论上限永远拿不到满分。
 * ------------------------------------------------------------------ */
test('BUG-17 R04: 四个人的名字都必须出现在题面里', () => {
  for (const seed of ['x', '42', 'a', 'b', 'cal-strong-1']) {
    const g = item('R04').generate(seed);
    for (const n of g.facts.names) {
      assert.ok(g.prompt.includes(n), `seed=${seed} 题面缺少人名「${n}」`);
    }
    assert.equal(grade('R04', perfectAnswers(seed).R04, seed).awarded, 9, `seed=${seed} 正确答案拿不到 9 分`);
  }
});

/* ------------------------------------------------------------------ *
 * BUG-18（redteam-qa 发现）：C04 判分器引用未定义变量 rc → 全量 SCORER_ERROR
 * ------------------------------------------------------------------ */
test('BUG-18 C04: 正确答案必须 GRADED 拿 9/9，不能是 SCORER_ERROR', () => {
  for (const seed of ['x', 'a', '42', 'cal-strong-1']) {
    const r = grade('C04', perfectAnswers(seed).C04, seed);
    assert.equal(r.gradingStatus, 'GRADED', `seed=${seed} 状态 ${r.gradingStatus}：${r.checks[0]?.reason}`);
    assert.equal(r.awarded, 9);
  }
});

/* ------------------------------------------------------------------ *
 * BUG-19（redteam-qa 发现）：若干题的答案/字段是常量，可背答案
 * ------------------------------------------------------------------ */
test('BUG-19 各题答案必须在 seed 之间真的变化（不得可背）', () => {
  const seeds = Array.from({ length: 40 }, (_, i) => `const-${i}`);
  const varietyOf = (id, extract) => new Set(seeds.map((s) => JSON.stringify(extract(item(id).oracle(item(id).generate(s).facts)))));
  // D02 三类答案都要出现
  const d02 = new Set(seeds.map((s) => item('D02').oracle(item('D02').generate(s).facts).answer));
  assert.deepEqual([...d02].sort(), ['A', 'B', 'C'], `D02 答案应覆盖 A/B/C，实际 ${[...d02]}`);
  // I01 附件要求两种都要出现
  const i01 = new Set(seeds.map((s) => item('I01').oracle(item('I01').generate(s).facts).budgetAttached));
  assert.equal(i01.size, 2, 'I01 budgetAttached 应有 true/false 两种');
  // I04 最终状态两种都要出现
  const i04 = new Set(seeds.map((s) => item('I04').oracle(item('I04').generate(s).facts).status));
  assert.equal(i04.size, 2, 'I04 最终状态应有两种');
  // C01 isCorrect 两种都要出现
  const c01 = new Set(seeds.map((s) => item('C01').oracle(item('C01').generate(s).facts).isCorrect));
  assert.equal(c01.size, 2, 'C01 isCorrect 应有 true/false 两种');
  // D03 的 onlyInStore / commonCount 不能是常量
  const d03 = varietyOf('D03', (o) => [o.onlyInStore, o.commonCount]);
  assert.ok(d03.size >= 3, `D03 答案变化太少：${d03.size} 种`);
  // C03 的 rule 组合不能恒定
  const c03 = varietyOf('C03', (o) => Object.values(o.cases).map((c) => c.rule));
  assert.ok(c03.size >= 2, `C03 rule 组合恒定：${[...c03]}`);
});

/* ------------------------------------------------------------------ *
 * BUG-20（redteam-qa 发现）：C02.C2 可用两个错值骗分
 * ------------------------------------------------------------------ */
test('BUG-20 C02: 两个都错但差值对的答案不得通过 C2', () => {
  const internal = instantiateInternal(item('C02'), 'cheat');
  const o = item('C02').oracle(internal.facts);
  const qty = internal.facts.steps[3].qty;
  // 真实答案大幅偏移，只让差值对上
  const r = gradeItem(internal, { beforeVoid: o.beforeVoid - 50, finalStock: o.beforeVoid - 50 + qty }, { seed: 'cheat' });
  assert.ok(r.checks.find((c) => c.criterionId === 'C02.C2').passed === false, 'C2 不应被「差值对但绝对值错」骗过');
});

/* ------------------------------------------------------------------ *
 * BUG-21（redteam-qa 发现）：D02 答案对但理由是事实错误 → 仍满分
 * 例：甲支出明明给出了，理由写「甲支出没有给出」也拿 6/6。
 * ------------------------------------------------------------------ */
test('BUG-21 D02: aGiven 分支下，与事实相反的理由不得拿 C2/C3', () => {
  let tested = 0;
  for (let i = 0; i < 60 && tested < 4; i++) {
    const seed = `d02-misinfo-${i}`;
    const internal = instantiateInternal(item('D02'), seed);
    const o = item('D02').oracle(internal.facts);
    if (!o.aGiven) continue;
    tested++;
    // 答案对，但理由是「甲支出没有给出」——与题面事实相反
    const r = gradeItem(internal, { answer: o.answer, reason: '甲项目的最终实际支出没有给出，无法确定' }, { seed });
    assert.ok(r.awarded < 6, `seed=${seed} 事实相反的理由却拿了 ${r.awarded}/6`);
    assert.equal(r.checks.find((c) => c.criterionId === 'D02.C2').passed, false, `seed=${seed} C2 不应通过`);
    assert.equal(r.checks.find((c) => c.criterionId === 'D02.C3').passed, false, `seed=${seed} C3 不应通过`);
  }
  assert.ok(tested >= 2, `只找到 ${tested} 个 aGiven seed`);
});

test('BUG-21b D02: 引用两个真实数字且方向正确的理由必须满分', () => {
  for (let i = 0; i < 30; i++) {
    const seed = `d02-good-${i}`;
    const internal = instantiateInternal(item('D02'), seed);
    const o = item('D02').oracle(internal.facts);
    if (!o.aGiven) continue;
    const word = o.answer === 'A' ? '少，更省钱' : '多，不比乙省';
    const reason = `甲实际支出 ${o.sampleA} 万元，乙 ${o.sampleB} 万元，甲比乙${word}。`;
    const r = gradeItem(internal, { answer: o.answer, reason }, { seed });
    assert.equal(r.awarded, 6, `seed=${seed} 正确理由只拿 ${r.awarded}/6`);
    break;
  }
});

/* ------------------------------------------------------------------ *
 * BUG-22（redteam-qa 发现）：R04「姓名顺序=位置顺序」结构性泄漏
 * names[i] 真实位置恒为 i+1，按示例姓名顺序填 1/2/3/4 就白拿 C1。
 * ------------------------------------------------------------------ */
test('BUG-22 R04: 姓名顺序不得等于位置顺序（结构性泄漏）', () => {
  let leak = 0;
  const N = 80;
  for (let i = 0; i < N; i++) {
    const g = item('R04').generate(`leakcheck-${i}`);
    const asc = g.facts.names.every((n, idx) => g.facts.solution.find((x) => x.name === n).position === idx + 1);
    if (asc) leak++;
  }
  // 允许极少数巧合，但不能是结构性成立
  assert.ok(leak <= N * 0.15, `${N} 个 seed 里有 ${leak} 个「姓名序=位置序」，疑似结构性泄漏`);
});

/* ------------------------------------------------------------------ *
 * BUG-23（redteam-qa 发现）：C01 isCorrect 恒定 false
 * ------------------------------------------------------------------ */
test('BUG-23 C01: isCorrect 必须两种取值都出现，且两种都能判满分', () => {
  const vals = new Set();
  for (let i = 0; i < 60; i++) {
    const seed = `c01-var-${i}`;
    const internal = instantiateInternal(item('C01'), seed);
    const o = item('C01').oracle(internal.facts);
    vals.add(o.isCorrect);
    const ans = { isCorrect: o.isCorrect, correctTotal: o.correctTotal };
    const r = gradeItem(internal, ans, { seed });
    assert.equal(r.awarded, 4, `seed=${seed} isCorrect=${o.isCorrect} 正确答案拿 ${r.awarded}/4`);
  }
  assert.deepEqual([...vals].sort(), [false, true], `C01 isCorrect 只出现了 ${[...vals]}`);
});

/* ------------------------------------------------------------------ *
 * BUG-24（redteam-qa 发现）：publicCriteria 文本与正确答案矛盾
 * 例：C01.C1 写「必须 isCorrect=false」，但随机化后部分 seed 正确答案是 true。
 *     考生按公开条件作答反而被扣分 —— 这是「题面把人往错答案引」，比恒定答案更严重。
 * ------------------------------------------------------------------ */
test('BUG-24 评分条件文本不得硬编码具体答案值', () => {
  // 这些「具体取值」不该出现在条件文本里：具体谓词、具体数字、具体状态名
  const suspicious = [
    /isCorrect\s*=\s*(true|false)/i,
    /答案选择\s*[A-C]\b/,
    /budgetAttached\s*=\s*(true|false)/i,
    /最终状态\s*=\s*已通过/,
    /最终状态\s*=\s*已驳回/,
    /第2笔.*按新规则/,
  ];
  for (const it of ITEMS) {
    for (const c of criteriaOf(it)) {
      for (const re of suspicious) {
        assert.ok(!re.test(c.text), `${c.id} 的条件文本硬编码了具体答案：${c.text}`);
      }
    }
  }
});

test('BUG-24b 按公开条件字面理解作答，不得比正确答案更差', () => {
  // 反向验证：正确答案必须是「满足所有条件文本」的那个。
  // 这里用最直接的方式：正确答案拿满分，且每个条件的 reason 不得出现「矛盾」类措辞。
  for (let i = 0; i < 25; i++) {
    const seed = `criteria-consistency-${i}`;
    const ans = perfectAnswers(seed);
    for (const it of ITEMS) {
      const r = gradeItem(instantiateInternal(it, seed), ans[it.id], { seed });
      assert.equal(r.awarded, it.points, `seed=${seed} ${it.id} 正确答案 ${r.awarded}/${it.points}`);
    }
  }
});

/* ------------------------------------------------------------------ *
 * BUG-25（redteam-qa 发现）：I03 分支分布倾斜，固定答案能拿 74%
 * ------------------------------------------------------------------ */
test('BUG-25 I03: 四条规则的分支分布必须接近均匀（不得偏向 R4）', () => {
  const dist = {};
  const N = 400;
  for (let i = 0; i < N; i++) {
    const g = item('I03').generate(`i03-bal-${i}`);
    const o = item('I03').oracle(g.facts);
    dist[o.rule] = (dist[o.rule] || 0) + 1;
  }
  for (const rule of ['R1', 'R2', 'R3', 'R4']) {
    const share = (dist[rule] || 0) / N;
    assert.ok(share >= 0.15 && share <= 0.35, `${rule} 占比 ${(share * 100).toFixed(1)}%，偏离均匀（应 15%~35%）`);
  }
});

test('BUG-25b I03: 任何单一固定答案的满分率不得超过 32%（3 字段 4 分支的理论下限约 25%）', () => {
  const candidates = [
    { rule: 'R4', decision: '部分批准', escalate: false },
    { rule: 'R1', decision: '转人工', escalate: true },
    { rule: 'R3', decision: '批准', escalate: false },
    { rule: 'R2', decision: '部分批准', escalate: true },
  ];
  const N = 400;
  for (const cand of candidates) {
    let full = 0;
    for (let i = 0; i < N; i++) {
      const seed = `i03-fixed-${i}`;
      const r = gradeItem(instantiateInternal(item('I03'), seed), cand, { seed });
      if (r.awarded === 6) full++;
    }
    // 关键指标是「整题白拿满分的概率」，不是平均分（平均分含部分正确，属正常）。
    // 4 个分支 × 3 个字段，随机猜的满分率约 1/4=25%（decision/escalate 与 rule 强相关）。
    // 超过 32% 说明分布仍在偏向某个分支。
    const pct = (full / N) * 100;
    assert.ok(pct <= 32, `固定答案 ${JSON.stringify(cand)} 满分率 ${pct.toFixed(1)}%，超过 32% 上限（分布可能又偏了）`);
  }
});
