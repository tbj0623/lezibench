/**
 * 状态追踪与纠错维度（correction）—— C01 / C02 / C03 / C04
 * 合计 4 + 6 + 6 + 9 = 25 分
 */
import { makeRng } from '../rng.mjs';
import { toNumber, sameNumber, normText, squash, toList, sameSet } from '../../grading/parse.mjs';

const DIM = 'correction';

/* ============================== C01 · 4 分 ============================== */
const C01 = {
  id: 'C01',
  dimension: DIM,
  difficulty: 'easy',
  points: 4,
  batch: 1,
  title: '指出算式中的错误并纠正',
  generate(seed) {
    const rng = makeRng(`${seed}#C01`);
    const a = rng.int(12, 39);
    const b = rng.int(11, 38);
    const c = rng.int(9, 29);
    const correct = a + b + c;
    // 制造一个有确定偏差的错误和：错和落在 [correct-9, correct+9] 且不等于正确值
    // 约 1/4 的 seed 生成**正确**的等式（此时 isCorrect 应为 true），
    // 否则 isCorrect 恒 false，白拿 1 分。
    const makeCorrect = rng.next() < 0.25;
    let delta = rng.int(1, 9) * (rng.next() < 0.5 ? -1 : 1);
    if (delta === 0) delta = 3;
    const wrong = makeCorrect ? correct : correct + delta;
    const facts = { a, b, c, correct, wrong, statementIsCorrect: makeCorrect };
    const prompt = [
      '「小禾文具」的店员在核对一张汇总单。',
      `她写的是：${a} + ${b} + ${c} = ${wrong}`,
      '',
      '请检查这个等式，指出原来的结果对不对，并给出正确的和。',
      '只输出一个 JSON 对象：',
      '{"isCorrect":<true或false>,"correctTotal":<正确的和>}',
      '（isCorrect 表示「原等式的写法是否正确」，这里是 true/false；correctTotal 是正确结果。）',
    ].join('\n');
    return {
      prompt,
      facts,
      schema: {
        isCorrect: { type: 'bool', aliases: ['isCorrect', '原式正确', '是否正确', 'correct'] },
        correctTotal: { type: 'number', aliases: ['correctTotal', '正确结果', '正确和', 'rightTotal', 'sum'] },
      },
      publicCriteria: [
        { id: 'C01.C1', points: 1, text: '正确判定原等式是否成立（isCorrect 与实际等式一致）' },
        { id: 'C01.C2', points: 3, text: '给出正确的和' },
      ],
    };
  },
  oracle(facts) {
    return { isCorrect: facts.statementIsCorrect, correctTotal: facts.a + facts.b + facts.c };
  },
  grade(parsed, facts) {
    const o = C01.oracle(facts);
    const checks = [];
    const ic = parsed.fields.isCorrect;
    checks.push({
      criterionId: 'C01.C1',
      points: 1,
      passed: ic === o.isCorrect,
      reason: ic === undefined || ic === null
        ? '未解析出 isCorrect'
        : ic === o.isCorrect
          ? (o.isCorrect ? '正确判断原等式无误' : '正确指出原等式错误')
          : `判断错误：原等式${o.isCorrect ? '是正确' : '是错误的'}的，实际填 ${ic}`,
    });
    const ct = parsed.fields.correctTotal ?? null;
    checks.push({
      criterionId: 'C01.C2',
      points: 3,
      passed: sameNumber(ct, o.correctTotal),
      reason: ct === null ? '未解析出 correctTotal' : sameNumber(ct, o.correctTotal) ? `正确结果：${o.correctTotal}` : `正确结果应为 ${o.correctTotal}，实际为 ${ct}`,
    });
    return checks;
  },
  fallback(raw) {
    if (typeof raw !== 'string') return null;
    const s = raw.normalize('NFKC');
    const fields = {};
    if (/不对|错了|错误|不正确|有误/.test(s)) fields.isCorrect = false;
    else if (/正确|没问题|对的/.test(s)) fields.isCorrect = true;
    const m = s.match(/(?:正确|应为|结果是|等于)[^0-9\-]{0,10}(\d+)/);
    if (m) fields.correctTotal = Number(m[1]);
    return Object.keys(fields).length ? { fields, source: 'prose', problems: [] } : null;
  },
};

/* ============================== C02 · 6 分 ============================== */
const C02 = {
  id: 'C02',
  dimension: DIM,
  difficulty: 'standard',
  points: 6,
  batch: 2,
  title: '四步修改后的最新库存状态',
  generate(seed) {
    const rng = makeRng(`${seed}#C02`);
    const sku = rng.pick(['保温杯', '帆布袋', '笔记本', '马克杯']);
    const init = rng.int(40, 90);
    const s1 = rng.int(5, 15); // 入库
    const s2 = rng.int(3, 12); // 出库
    const s3 = rng.int(2, 10); // 盘点差异
    const facts = {
      sku,
      init,
      steps: [
        { no: 1, op: '入库', qty: s1 },
        { no: 2, op: '出库', qty: s2 },
        { no: 3, op: '盘亏', qty: s3 },
        { no: 4, op: '撤回第2步', qty: s2 },
      ],
    };
    const prompt = [
      `仓库里「${sku}」的库存记录如下（按时间顺序）：`,
      `初始库存：${init} 件。`,
      `第1步：入库 ${s1} 件。`,
      `第2步：出库 ${s2} 件。`,
      `第3步：盘亏 ${s3} 件（盘亏 = 实际比账面少）。`,
      `第4步：发现第2步的出库单开错了，整单作废并撤回。`,
      '',
      '请给出四步处理完之后的最终库存，并分别写出「撤回前」和「撤回后」的库存。',
      '只输出一个 JSON 对象：',
      '{"beforeVoid":100,"finalStock":108}',
    ].join('\n');
    return {
      prompt,
      facts,
      schema: {
        beforeVoid: { type: 'number', aliases: ['beforeVoid', '撤回前', '作废前', '第3步后'] },
        finalStock: { type: 'number', aliases: ['finalStock', '最终库存', '期末库存', 'final'] },
      },
      publicCriteria: [
        { id: 'C02.C1', points: 2, text: '前三步处理后的库存（撤回前）正确' },
        { id: 'C02.C2', points: 2, text: '正确理解「撤回第2步」＝把那笔出库加回来' },
        { id: 'C02.C3', points: 2, text: '最终库存数值正确' },
      ],
    };
  },
  oracle(facts) {
    const { init, steps } = facts;
    let stock = init;
    stock += steps[0].qty; // 入库
    stock -= steps[1].qty; // 出库
    stock -= steps[2].qty; // 盘亏
    const beforeVoid = stock;
    stock += steps[3].qty; // 撤回出库 = 加回
    return { beforeVoid, finalStock: stock };
  },
  grade(parsed, facts) {
    const o = C02.oracle(facts);
    const bv = parsed.fields.beforeVoid ?? null;
    const fs = parsed.fields.finalStock ?? null;
    const checks = [];
    checks.push({
      criterionId: 'C02.C1',
      points: 2,
      passed: sameNumber(bv, o.beforeVoid),
      reason: bv === null ? '未解析出 beforeVoid' : sameNumber(bv, o.beforeVoid) ? `撤回前库存正确：${o.beforeVoid}` : `撤回前应为 ${o.beforeVoid}，实际为 ${bv}`,
    });
    // 「理解撤回」：最终库存必须比撤回前多出被撤回的那笔出库数量。
    // 关键：必须与 C1 联动 —— 否则 {"beforeVoid":0,"finalStock":4} 这种「两个都错但差值对」的答案能白拿 2 分。
    const bvOk = sameNumber(bv, o.beforeVoid);
    const deltaOk = sameNumber(fs !== null && bv !== null ? fs - bv : null, facts.steps[3].qty);
    checks.push({
      criterionId: 'C02.C2',
      points: 2,
      passed: bvOk && deltaOk && sameNumber(fs, o.finalStock),
      reason: bv === null || fs === null
        ? '缺少撤回前或最终库存，无法校验撤回逻辑'
        : !bvOk
          ? `撤回前库存应为 ${o.beforeVoid}，实际为 ${bv}（差值对也不能算理解撤回）`
          : deltaOk
            ? `撤回前 ${bv} → 撤回后 ${fs}，正确加回 ${facts.steps[3].qty} 件`
            : `撤回后应比撤回前多 ${facts.steps[3].qty} 件，实际差 ${fs - bv} 件`,
    });
    checks.push({
      criterionId: 'C02.C3',
      points: 2,
      passed: sameNumber(fs, o.finalStock),
      reason: fs === null ? '未解析出 finalStock' : sameNumber(fs, o.finalStock) ? `最终库存正确：${o.finalStock}` : `最终库存应为 ${o.finalStock}，实际为 ${fs}`,
    });
    return checks;
  },
  fallback(raw) {
    if (typeof raw !== 'string') return null;
    const s = raw.normalize('NFKC');
    const fields = {};
    const bv = s.match(/(?:撤回前|作废前|第3步后)[^0-9\-]{0,8}(-?\d+)/);
    const fs = s.match(/(?:最终库存|期末库存|最终)[^0-9\-]{0,10}(-?\d+)/);
    if (bv) fields.beforeVoid = Number(bv[1]);
    if (fs) fields.finalStock = Number(fs[1]);
    return Object.keys(fields).length ? { fields, source: 'prose', problems: [] } : null;
  },
};

/* ============================== C03 · 6 分 ============================== */
const C03 = {
  id: 'C03',
  dimension: DIM,
  difficulty: 'standard',
  points: 6,
  batch: 3,
  title: '新旧规则更迭后的合法操作',
  generate(seed) {
    const rng = makeRng(`${seed}#C03`);
    const oldLimit = rng.int(3000, 5000);
    const newLimit = oldLimit + rng.int(1000, 3000);
    // 关键：让「每笔超不超限」也随 seed 变化。
    // 如果每笔的判定方向固定，答案组合就恒定（旧超/新不超/新超/旧不超），跑两次就能背下来 ——
    // 那不是能力，是记忆。这里对每笔独立掷骰子，同时保证核心考点（第 2 笔必须按新规则）
    // 在任何 seed 下都可考。
    const beyond = (limit) => limit + rng.int(100, 900);
    const within = (limit) => limit - rng.int(1, 300);
    const coin = () => rng.next() < 0.5;
    const amt1 = coin() ? beyond(oldLimit) : within(oldLimit);   // 旧规则
    const amt2 = coin() ? beyond(oldLimit) : within(oldLimit);   // 新规则（核心：别套旧门槛）
    const amt3 = coin() ? beyond(newLimit) : within(newLimit);   // 新规则
    const amt4 = coin() ? beyond(oldLimit) : within(oldLimit);   // 旧规则
    // 提交日期也要随 seed 变化：否则 a1/a3/a4 的 rule 恒为旧/新/旧，
    // 光靠「记下 rule 规律」就能白拿 C1 的 2 分。
    const oldDate = () => `2 月 ${rng.int(10, 27)} 日`;
    const newDate = () => `3 月 ${rng.int(2, 28)} 日`;
    // 哪几笔是「旧规则期提交」也随 seed 变化（2 旧 + 2 新，但位置随机），
    // 否则 rule 恒为「旧/新/新/旧」，背下来就能拿 C1。
    const oldSlots = rng.sample(['a1', 'a2', 'a3', 'a4'], 2);
    const dates = {};
    for (const k of ['a1', 'a2', 'a3', 'a4']) dates[k] = oldSlots.includes(k) ? oldDate() : newDate();
    const ruleOf = (d) => (d.startsWith('2 月') ? '旧' : '新');
    const facts = { oldLimit, newLimit, amounts: { a1: amt1, a2: amt2, a3: amt3, a4: amt4 }, dates, ruleOf };
    const prompt = [
      '某公司的差旅审批规则在 3 月 1 日更新了版本：',
      `旧规则（3 月 1 日前有效）：单笔金额 ≤ ${oldLimit} 元由系统自动通过，超过需经理审批。`,
      `新规则（3 月 1 日起生效）：单笔金额 ≤ ${newLimit} 元由系统自动通过；超过需总监审批。`,
      '公司还规定：规则按「提交时间」适用，不按「审批时间」。',
      '',
      '下面四笔申请，请判断每笔应按哪一版规则处理、以及最终是否需要人工审批。',
      `1) ${dates.a1}提交，金额 ${amt1} 元；`,
      `2) ${dates.a2}提交，金额 ${amt2} 元；`,
      `3) ${dates.a3}提交，金额 ${amt3} 元；`,
      `4) ${dates.a4}提交，金额 ${amt4} 元。`,
      '',
      '只输出一个 JSON 对象（a1–a4 四笔都要给，rule 填「旧」或「新」，needManual 填 true 或 false）：',
      '{"a1":{"rule":"<旧或新>","needManual":<true或false>},"a2":{"rule":"<旧或新>","needManual":<true或false>}}',
      '（上面只示范 a1/a2 两个键的结构，实际要给出 a1–a4 四笔；规则与人工判断都要自己推。）',
    ].join('\n');
    return {
      prompt,
      facts,
      schema: {
        a1: { type: 'object', aliases: ['a1', '第1笔', '1', 'case1'] },
        a2: { type: 'object', aliases: ['a2', '第2笔', '2', 'case2'] },
        a3: { type: 'object', aliases: ['a3', '第3笔', '3', 'case3'] },
        a4: { type: 'object', aliases: ['a4', '第4笔', '4', 'case4'] },
      },
      publicCriteria: [
        { id: 'C03.C1', points: 2, text: '四笔申请适用的规则版本（旧/新）全部正确' },
        { id: 'C03.C2', points: 2, text: '四笔申请是否需要人工审批全部正确' },
        { id: 'C03.C3', points: 2, text: '第2笔按「提交日期所属的那一版规则」判定（按提交时间，不按审批时间）' },
      ],
      answerStyle: 'nestedMaps',
    };
  },
  oracle(facts) {
    const L = facts.oldLimit;
    const N = facts.newLimit;
    const A = facts.amounts;
    return {
      cases: {
        a1: { rule: facts.ruleOf(facts.dates.a1), needManual: A.a1 > (facts.ruleOf(facts.dates.a1) === '旧' ? L : N) },
        a2: { rule: facts.ruleOf(facts.dates.a2), needManual: A.a2 > (facts.ruleOf(facts.dates.a2) === '旧' ? L : N) },
        a3: { rule: facts.ruleOf(facts.dates.a3), needManual: A.a3 > (facts.ruleOf(facts.dates.a3) === '旧' ? L : N) },
        a4: { rule: facts.ruleOf(facts.dates.a4), needManual: A.a4 > (facts.ruleOf(facts.dates.a4) === '旧' ? L : N) },
      },
    };
  },
  grade(parsed, facts) {
    const o = C03.oracle(facts);
    // 严格归一：必须整串就是「旧/新」（允许 old/new 与少量修饰），
    // 旧实现只要含「旧」字就返回「旧」，"旧__乱码" 也能过（N8）。
    const normRule = (v) => {
      const s = squash(v);
      if (!s) return null;
      if (/^(旧|旧规则|old|旧版)$/i.test(s)) return '旧';
      if (/^(新|新规则|new|新版)$/i.test(s)) return '新';
      return null;
    };
    const booly = (v) => {
      if (typeof v === 'boolean') return v;
      const s = squash(v);
      if (!s) return null;
      if (/^(true|是|需要|需人工|yes|y)$/.test(s)) return true;
      if (/^(false|否|不需要|无需|no|n)$/.test(s)) return false;
      return null;
    };
    const getCase = (key) => {
      const raw = parsed.fields[key];
      if (!raw || typeof raw !== 'object') return null;
      const ruleKey = Object.keys(raw).find((k) => /rule|规则|版本/i.test(k));
      const manualKey = Object.keys(raw).find((k) => /manual|审批|人工/i.test(k)) || Object.keys(raw).find((k) => typeof raw[k] === 'boolean');
      return {
        rule: ruleKey ? normRule(raw[ruleKey]) : null,
        needManual: manualKey ? booly(raw[manualKey]) : null,
      };
    };
    let ruleRight = 0;
    let manualRight = 0;
    const wrong = [];
    for (const key of ['a1', 'a2', 'a3', 'a4']) {
      const got = getCase(key);
      const exp = o.cases[key];
      const rOk = !!got && got.rule === exp.rule;
      const mOk = !!got && got.needManual === exp.needManual;
      if (rOk) ruleRight++;
      if (mOk) manualRight++;
      if (!rOk || !mOk) wrong.push(`${key}(规则${exp.rule}/人工${exp.needManual}，实际${got ? (got.rule ?? '?') + '/' + (got.needManual ?? '?') : '缺失'})`);
    }
    const checks = [];
    checks.push({
      criterionId: 'C03.C1',
      points: 2,
      passed: ruleRight === 4,
      reason: ruleRight === 4 ? '四笔申请的规则版本全部正确' : `${ruleRight}/4 笔规则版本正确${wrong.length ? '；' + wrong.join('，') : ''}`,
    });
    checks.push({
      criterionId: 'C03.C2',
      points: 2,
      passed: manualRight === 4,
      reason: manualRight === 4 ? '四笔申请的人工审批判断全部正确' : `${manualRight}/4 笔人工审批判断正确`,
    });
    // 第2笔是核心考点：必须用**新规则**门槛。它到底自动通过还是需人工取决于金额，
    // 但「规则版本=新」在任何 seed 下都成立，且人工判断必须与 oracle 一致。
    const a2 = getCase('a2');
    const expA2 = o.cases.a2;
    const a2Ok = !!a2 && a2.rule === expA2.rule && a2.needManual === expA2.needManual;
    checks.push({
      criterionId: 'C03.C3',
      points: 2,
      passed: a2Ok,
      reason: a2Ok
        ? `第2笔正确按${expA2.rule}规则判定（提交于 ${facts.dates.a2}，金额 ${facts.amounts.a2}，需人工=${expA2.needManual}）`
        : `第2笔应按${expA2.rule}规则判定（提交于 ${facts.dates.a2}，金额 ${facts.amounts.a2}，需人工=${expA2.needManual}），实际为 ${a2 ? (a2.rule ?? '?') + '/' + (a2.needManual ?? '?') : '缺失'}`,
    });
    return checks;
  },
  parse(raw) {
    const fields = {};
    let carrier = null;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) carrier = raw;
    else if (typeof raw === 'string') {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { carrier = JSON.parse(m[0].normalize('NFKC')); } catch { carrier = null; } }
    }
    if (carrier && typeof carrier === 'object') {
      const src = carrier.cases || carrier.answers || carrier;
      for (const k of ['a1', 'a2', 'a3', 'a4']) {
        const hit = Object.keys(src).find((x) => squash(x) === k || squash(x) === `第${k[1]}笔`);
        if (hit && src[hit] && typeof src[hit] === 'object') fields[k] = src[hit];
      }
    }
    return { fields, source: 'nestedMaps', problems: Object.keys(fields).length ? [] : ['未找到 a1–a4 四笔申请的对象'] };
  },
};

/* ============================== C04 · 9 分 ============================== */
const C04 = {
  id: 'C04',
  dimension: DIM,
  difficulty: 'challenge',
  points: 9,
  batch: 4,
  title: '找出错误根源、修复并算最终结果',
  generate(seed) {
    const rng = makeRng(`${seed}#C04`);
    const price = rng.int(18, 45);
    const qtyOk = rng.int(3, 8);
    // 唯一错误：脚本里把数量写成另一个数（qtyBug）。折扣逻辑本身是对的。
    let qtyBug = rng.int(3, 8);
    if (qtyBug === qtyOk) qtyBug = qtyOk === 8 ? 7 : qtyOk + 1;
    const memberRate = rng.pick([0.9, 0.85, 0.8]);
    const correctSubtotal = price * qtyOk;
    const correctTotal = Math.round(correctSubtotal * memberRate * 100) / 100;
    const bugSubtotal = price * qtyBug;
    const bugTotal = Math.round(bugSubtotal * memberRate * 100) / 100;
    const facts = {
      price, qtyOk, qtyBug, memberRate, correctSubtotal, correctTotal, bugSubtotal, bugTotal,
      rootCause: '数量用错',
    };
    const prompt = [
      '同事写了一段算会员应付金额的脚本，运行结果和财务手工计算对不上。',
      '',
      '脚本逻辑：',
      '```',
      `unit_price = ${price}`,
      `qty = ${qtyBug}   # 这一行有问题`,
      'subtotal = unit_price * qty',
      `member_rate = ${memberRate}`,
      'total = round(subtotal * member_rate, 2)',
      '```',
      `已知：这次实际要结算的数量是 ${qtyOk} 件；会员折扣率 ${memberRate}；折扣本身是对的。`,
      `脚本跑出来的 total = ${bugTotal} 元。`,
      '',
      '请回答三件事：',
      '1) 错误根源属于哪一类（单选题：数量用错 / 单价用错 / 折扣漏乘 / 四舍五入）；',
      '2) 修复后的正确小计（round 前的小计，即单价×正确数量）；',
      '3) 修复后的正确应付总额（保留两位小数）。',
      '只输出一个 JSON 对象：',
      '{"rootCause":"<数量用错|单价用错|折扣漏乘|四舍五入>","fixedSubtotal":<正确小计>,"fixedTotal":<正确应付>}',
      '（上面只示范结构，四个选项自己判断，数字自己算。）',
    ].join('\n');
    return {
      prompt,
      facts,
      schema: {
        rootCause: { type: 'text', aliases: ['rootCause', '错误根源', '根因', 'cause'] },
        fixedSubtotal: { type: 'number', aliases: ['fixedSubtotal', '正确小计', '修复后小计', 'subtotal'] },
        fixedTotal: { type: 'number', aliases: ['fixedTotal', '正确应付', '修复后应付', 'total'] },
      },
      publicCriteria: [
        { id: 'C04.C1', points: 3, text: '错误根源指出「数量用错」' },
        { id: 'C04.C2', points: 3, text: '修复后小计正确' },
        { id: 'C04.C3', points: 3, text: '修复后应付总额正确（已乘折扣）' },
      ],
    };
  },
  oracle(facts) {
    const subtotal = facts.price * facts.qtyOk;
    const total = Math.round(subtotal * facts.memberRate * 100) / 100;
    return { rootCause: '数量用错', fixedSubtotal: subtotal, fixedTotal: total };
  },
  grade(parsed, facts) {
    const o = C04.oracle(facts);
    // 严格四选一：先剔除「不是X」这类明确否定项，再要求**恰好剩下一个**选项，
    // 且该选项就是「数量」。旧实现只做 /数量/ 包含匹配，
    // 导致「数量用错__乱码」「数量用错了但其实是别的原因」都能过（N8）。
    const rcRaw = parsed.fields.rootCause ? squash(parsed.fields.rootCause) : '';
    const OPTIONS = ['数量', '单价', '折扣', '四舍五入'];
    // 先剥离括号/方括号里的补充说明（「数量用错（不是单价问题）」→「数量用错」），
    // 再判断否定项：括号内说「不是X」是排除，不算主张 X。
    const rcCore = rcRaw.replace(/[（(\[【][^）)\]】]*[）)\]】]/g, '').trim();
    // 排除词既可能紧贴在选项前（「不是单价」），也可能是一串（「排除单价和折扣」），
    // 所以还要检查「排除」之后整段里出现的选项，一律视为被排除。
    const negated = (w) => {
      if (new RegExp(`(?:不是|并非|排除|而不是|不是因为|而非)${w}`).test(rcRaw)) return true;
      const tail = rcRaw.split(/排除|而不是|而非|不是/).slice(1).join('|');
      return tail.includes(w);
    };
    const effective = OPTIONS.filter((w) => rcCore.includes(w) && !negated(w));
    // 主体部分必须干净：整串就是「数量用错」这类表述，不能夹带其他主张。
    const cleanQuantity = /^(数量|数量用错|数量错误|数量有误|数量错|用错数量|数量写错|数量有问题|数量不对)$/u.test(rcCore);
    // 若原文括号里还有其它选项，但都被否定词排除了，仍算干净。
    const strayPositive = OPTIONS.filter((w) => w !== '数量' && rcRaw.includes(w) && !negated(w));
    const rcOk = effective.length === 1 && effective[0] === '数量' && cleanQuantity && strayPositive.length === 0;
    const fs = parsed.fields.fixedSubtotal ?? null;
    const ft = parsed.fields.fixedTotal ?? null;
    const checks = [];
    checks.push({
      criterionId: 'C04.C1',
      points: 3,
      passed: rcOk,
      reason: !rcRaw ? '未解析出 rootCause' : rcOk ? '正确指出「数量用错」' : `错误根源应为「数量用错」，实际为「${parsed.fields.rootCause}」`,
    });
    checks.push({
      criterionId: 'C04.C2',
      points: 3,
      passed: sameNumber(fs, o.fixedSubtotal),
      reason: fs === null ? '未解析出 fixedSubtotal' : sameNumber(fs, o.fixedSubtotal) ? `修复后小计正确：${o.fixedSubtotal}` : `修复后小计应为 ${o.fixedSubtotal}，实际为 ${fs}`,
    });
    checks.push({
      criterionId: 'C04.C3',
      points: 3,
      passed: sameNumber(ft, o.fixedTotal),
      reason: ft === null ? '未解析出 fixedTotal' : sameNumber(ft, o.fixedTotal) ? `修复后应付正确：${o.fixedTotal}` : `修复后应付应为 ${o.fixedTotal}，实际为 ${ft}`,
    });
    return checks;
  },
  fallback(raw) {
    if (typeof raw !== 'string') return null;
    const s = raw.normalize('NFKC');
    const fields = {};
    if (/数量/.test(s) && !/单价用错/.test(s)) fields.rootCause = '数量用错';
    const fs = s.match(/(?:正确小计|修复后小计|小计)[^0-9\-]{0,8}(\d+(?:\.\d+)?)/);
    const ft = s.match(/(?:正确应付|修复后应付|应付|总额)[^0-9\-]{0,8}(\d+(?:\.\d+)?)/);
    if (fs) fields.fixedSubtotal = Number(fs[1]);
    if (ft) fields.fixedTotal = Number(ft[1]);
    return Object.keys(fields).length ? { fields, source: 'prose', problems: [] } : null;
  },
};

export default [C01, C02, C03, C04];
