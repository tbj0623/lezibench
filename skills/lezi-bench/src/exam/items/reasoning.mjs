/**
 * 逻辑推理维度（reasoning）—— R01 / R02 / R03 / R04
 * 合计 4 + 6 + 6 + 9 = 25 分
 */
import { makeRng } from '../rng.mjs';
import { toNumber, toList, sameNumber, normText, squash } from '../../grading/parse.mjs';

const DIM = 'reasoning';

function permute(rng, arr) {
  return rng.shuffle(arr);
}

/** 全排列（4 元素只有 24 种，直接穷举保证 oracle 不依赖题面构造逻辑） */
function allPerms(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  arr.forEach((x, i) => {
    for (const rest of allPerms([...arr.slice(0, i), ...arr.slice(i + 1)])) out.push([x, ...rest]);
  });
  return out;
}

/**
 * 独立的座位求解器：只吃「线索谓词」，与出题时的随机过程完全解耦。
 * @param {string[]} names
 * @param {string[]} colors
 * @param {Array<{text:string, test:(seat:Object)=>boolean}>} clues
 */
export function solveSeats(names, colors, clues) {
  const sols = [];
  for (const np of allPerms(names)) {
    for (const cp of allPerms(colors)) {
      const seat = Object.fromEntries(names.map((n) => [n, { position: np.indexOf(n) + 1, color: cp[np.indexOf(n)] }]));
      if (clues.every((c) => c.test(seat))) sols.push(seat);
    }
  }
  return sols;
}

/**
 * 候选线索池，按「信息类型」分类。分类很重要：
 *
 *   direct   直述（「X 在 n 号位」「X 的卡片是 c 色」）—— 一条值 2 bit
 *   relational 相对位置（「X 比 Y 靠前」）—— 一条值 1 bit
 *   negative 否定（「X 不在 n 号位」「X 的卡片不是 c 色」）—— 一条值 1 bit
 *
 * 纯直述的 6 条线索虽然能唯一确定答案，但那是「抄写」不是「推理」——
 * 真机考试里就出现过「6 条全是直述」的退化局面（看一遍就能填）。
 * 所以这里按类型打标，由 buildCluesFromSolution 强制配比。
 */
function clueCandidates(facts) {
  const { solution, names, colors } = facts;
  const at = (pos) => solution.find((s) => s.position === pos);
  const of = (name) => solution.find((s) => s.name === name);
  const direct = [];
  const relational = [];
  const negative = [];

  for (const n of names) {
    for (const p of [1, 2, 3, 4]) {
      if (of(n).position === p) direct.push({ kind: 'direct', text: `${n} 坐在 ${p} 号位。`, test: (s) => s[n].position === p });
      else negative.push({ kind: 'negative', text: `${n} 不在 ${p} 号位。`, test: (s) => s[n].position !== p });
    }
  }
  for (const n of names) {
    for (const c of colors) {
      if (of(n).color === c) direct.push({ kind: 'direct', text: `${n} 的卡片是${c}色。`, test: (s) => s[n].color === c });
      else negative.push({ kind: 'negative', text: `${n} 的卡片不是${c}色。`, test: (s) => s[n].color !== c });
    }
  }
  for (const p of [1, 2, 3, 4]) {
    for (const c of colors) {
      if (at(p).color === c) direct.push({ kind: 'direct', text: `${p} 号位的卡片是${c}色。`, test: (s) => Object.values(s).find((v) => v.position === p).color === c });
      else negative.push({ kind: 'negative', text: `${p} 号位的卡片不是${c}色。`, test: (s) => Object.values(s).find((v) => v.position === p).color !== c });
    }
  }
  for (let i = 0; i < names.length; i++) {
    for (let j = 0; j < names.length; j++) {
      if (i === j) continue;
      const a = names[i], b = names[j];
      const ap = of(a).position, bp = of(b).position;
      if (ap < bp) relational.push({ kind: 'relational', text: `${a} 的位置编号比 ${b} 小。`, test: (s) => s[a].position < s[b].position });
    }
  }
  return { direct, relational, negative };
}

function uniqueBy(clues, names, colors) {
  return solveSeats(names, colors, clues.map((c) => ({ test: c.test })));
}

/**
 * 选出恰好 6 条线索：**必须包含推理成分**（至少 2 条相对位置 + 至少 1 条否定），
 * 再用穷举确认 576 种可能里只剩唯一解。纯直述的组合一律拒绝。
 *
 * 为什么必须混：6 条纯直述虽然也能唯一确定答案，但那是「抄写」不是「推理」——
 * 真机考试里就出现过这种退化局面。
 *
 * 实现：贪心。每一轮从指定类别里挑「能把候选解砍得最少剩」的那条，
 * 这样只要 ~6 次 solveSeats 就能收敛，不会像全组合搜索那样几百毫秒。
 * 全程确定性（不依赖 Math.random），同 seed 必然选出同一组线索。
 */
export function buildCluesFromSolution(facts) {
  const { names, colors } = facts;
  const { direct, relational, negative } = clueCandidates(facts);

  const chosen = [];
  const used = new Set();
  const currentSols = () => solveSeats(names, colors, chosen.map((c) => ({ test: c.test })));

  /** 从 pool 里挑一条能把剩余解压得最少的线索 */
  const pickBest = (pool) => {
    let best = null;
    let base = currentSols().length;
    for (const c of pool) {
      if (used.has(c.text)) continue;
      const n = solveSeats(names, colors, [...chosen.map((x) => ({ test: x.test })), { test: c.test }]).length;
      // 必须真的能缩小范围，否则加进去只是凑数
      if (n >= base) continue;
      if (!best || n < best.n) best = { c, n };
    }
    if (best) { chosen.push(best.c); used.add(best.c.text); }
    return best;
  };

  // 第 1 阶段：先塞 2 条相对位置线索（推理的核心成分）
  for (let i = 0; i < 2; i++) {
    if (!pickBest(relational) && relational.length) {
      // 相对位置不够用时，退回用否定
      pickBest(negative);
    }
  }
  // 第 2 阶段：1 条否定线索
  pickBest(negative);
  // 第 3 阶段：直述线索补齐到 6 条（每次挑信息量最大的）
  let guard = 0;
  while (chosen.length < 6 && guard++ < 40) {
    if (!pickBest(direct)) break;
  }
  // 还不够就往否定里继续找
  guard = 0;
  while (chosen.length < 6 && guard++ < 40) {
    if (!pickBest(negative)) break;
  }

  if (chosen.length !== 6) return null;
  if (currentSols().length !== 1) return null;

  // 打散呈现顺序，避免「前两条一定是相对位置」这种可被猜到的结构
  // （用 facts 内容派生的确定性顺序，不是随机）
  const seedStr = names.join('') + colors.join('') + facts.solution.map((x) => `${x.name}${x.position}${x.color}`).join('');
  let h = 0;
  for (const ch of seedStr) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const ordered = [...chosen];
  for (let i = ordered.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) >>> 0;
    const j = h % (i + 1);
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  }
  return ordered;
}

/* ============================== R01 · 4 分 ============================== */
const R01 = {
  id: 'R01',
  dimension: DIM,
  difficulty: 'easy',
  points: 4,
  batch: 1,
  title: '购物小票的真实合计',
  generate(seed) {
    const rng = makeRng(`${seed}#R01`);
    const unitA = rng.int(12, 25);
    const qtyA = rng.int(2, 4);
    const unitB = rng.int(4, 9);
    const qtyB = rng.int(2, 5);
    const subtotal = unitA * qtyA + unitB * qtyB;
    // 阈值一定低于原价，保证满减规则必然被触发（否则该题失去区分度）
    const threshold = Math.max(1, subtotal - rng.int(1, 15));
    const discount = Math.min(subtotal - 1, rng.pick([5, 6, 8]));
    const facts = { unitA, qtyA, unitB, qtyB, threshold, discount };
    const prompt = [
      '你在核对「暖阳杂货铺」的一张手写小票。',
      `商品甲：单价 ${unitA} 元，买了 ${qtyA} 件。`,
      `商品乙：单价 ${unitB} 元，买了 ${qtyB} 件。`,
      `店内活动：一次购物原价满 ${threshold} 元，立减 ${discount} 元（只减一次）。`,
      '',
      '请计算：活动前的原价合计，以及实际应付款。',
      '只输出一个 JSON 对象（单位：元，只写数字）：',
      '{"subtotal": <原价合计>,"total": <应付款>}',
    ].join('\n');
    return {
      prompt,
      facts,
      schema: {
        subtotal: { type: 'number', aliases: ['subtotal', '原价', '原价合计', '小计', 'beforeDiscount'] },
        total: { type: 'number', aliases: ['total', '应付款', '实付', '实际付款', 'payable', 'finalTotal', '实际应付款', '实付款', '应付金额', '实际支付', '实付金额'] },
      },
      publicCriteria: [
        { id: 'R01.C1', points: 1, text: '原价合计正确（活动前）' },
        { id: 'R01.C2', points: 3, text: '应付款正确（已扣满减）' },
      ],
    };
  },
  oracle(facts) {
    const subtotal = facts.unitA * facts.qtyA + facts.unitB * facts.qtyB;
    const total = subtotal >= facts.threshold ? subtotal - facts.discount : subtotal;
    return { subtotal, total };
  },
  grade(parsed, facts) {
    const o = R01.oracle(facts);
    const checks = [];
    const sub = parsed.fields.subtotal ?? null;
    checks.push({
      criterionId: 'R01.C1',
      points: 1,
      passed: sameNumber(sub, o.subtotal),
      reason: sub === null ? '未解析出 subtotal' : sameNumber(sub, o.subtotal) ? `原价合计正确：${o.subtotal}` : `原价合计应为 ${o.subtotal}，实际为 ${sub}`,
    });
    const tot = parsed.fields.total ?? null;
    checks.push({
      criterionId: 'R01.C2',
      points: 3,
      passed: sameNumber(tot, o.total),
      reason: tot === null ? '未解析出 total' : sameNumber(tot, o.total) ? `应付款正确：${o.total}` : `应付款应为 ${o.total}，实际为 ${tot}`,
    });
    return checks;
  },
  fallback(raw) {
    if (typeof raw !== 'string') return null;
    const s = raw.normalize('NFKC');
    const fields = {};
    const mSub = s.match(/(?:原价|小计|subtotal)[^0-9\-]{0,8}(\d+(?:\.\d+)?)/i);
    const mTot = s.match(/(?:应付款|实付|实际|total|合计)[^0-9\-]{0,8}(\d+(?:\.\d+)?)/i);
    if (mSub) fields.subtotal = Number(mSub[1]);
    if (mTot) fields.total = Number(mTot[1]);
    return Object.keys(fields).length ? { fields, source: 'prose', problems: [] } : null;
  },
};

/* ============================== R02 · 6 分 ============================== */
const R02 = {
  id: 'R02',
  dimension: DIM,
  difficulty: 'standard',
  points: 6,
  batch: 2,
  title: '依赖关系与可行顺序',
  generate(seed) {
    const rng = makeRng(`${seed}#R02`);
    const tasks = [
      { code: 'A', name: '收货入库' },
      { code: 'B', name: '质检' },
      { code: 'C', name: '拍照上架' },
      { code: 'D', name: '定价' },
      { code: 'E', name: '开放销售' },
    ];
    // 依赖图随 seed 变化，但必须保持两条不变量（否则题面与评分条件会打架）：
    //   · A 是唯一无前驱的任务 → 必然第一步
    //   · E 是唯一无后继的任务 → 必然最后一步
    // 变化点：C 与 D 之间是否加一条先后约束（各占一半）。
    // 这样 E 始终等 C 和 D，中间两条分支的排列数随之变化（1 或 2 种合法序），
    // 题面因此不会在多个 seed 下逐字节相同。
    const deps = { B: ['A'], C: ['B'], D: ['B'], E: ['C', 'D'] };
    const cBeforeD = rng.next() < 0.5;
    if (cBeforeD) deps.D = ['B', 'C']; // D 必须等 C → 强制 C 在 D 之前
    const facts = { tasks, deps, cBeforeD };
    const depLines = ['A 收货入库：随时可以开始。', 'B 质检：必须等 A 完成。', 'C 拍照上架：必须等 B 完成。'];
    depLines.push(cBeforeD ? 'D 定价：必须等 B 和 C 都完成。' : 'D 定价：必须等 B 完成。');
    depLines.push('E 开放销售：必须等 C 和 D 都完成。');
    const depText = depLines.join('\n');
    const prompt = [
      '你是「云朵二手书店」的仓管，今天要完成 5 个步骤，每个步骤只用一次、不可并行：',
      depText,
      '',
      '请给出一个满足全部先后要求的执行顺序，并指出第一步和最后一步分别是什么。',
      '若存在多个合法顺序，任选其一即可。',
      '只输出一个 JSON 对象：',
      '{"order":["<5个步骤代码>"],"first":"<第一步代码>","last":"<最后一步代码>"}',
      '（上面只示范结构：order 是五个大写字母组成的数组，first/last 是单个字母；具体顺序请自己推。）',
    ].join('\n');
    return {
      prompt,
      facts,
      schema: {
        order: { type: 'list', aliases: ['order', '顺序', '执行顺序', 'sequence'] },
        first: { type: 'text', aliases: ['first', '第一步', '首步', 'firstStep'] },
        last: { type: 'text', aliases: ['last', '最后一步', '末步', 'lastStep'] },
      },
      publicCriteria: [
        { id: 'R02.C1', points: 2, text: '顺序包含 A–E 五步各一次，且以 A（收货入库）开始' },
        { id: 'R02.C2', points: 2, text: '满足全部先后依赖约束' },
        { id: 'R02.C3', points: 2, text: '以 E（开放销售）收尾，且 first/last 字段与 order 首末一致' },
      ],
    };
  },
  oracle(facts) {
    // 独立实现：拓扑排序枚举全部合法解，用于验证题面确实多解且首末步唯一
    const codes = facts.tasks.map((t) => t.code);
    const all = [];
    const rec = (done) => {
      if (done.length === codes.length) { all.push([...done]); return; }
      for (const c of codes) {
        if (done.includes(c)) continue;
        const ok = (facts.deps[c] || []).every((d) => done.includes(d));
        if (ok) { done.push(c); rec(done); done.pop(); }
      }
    };
    rec([]);
    const firsts = [...new Set(all.map((o) => o[0]))];
    const lasts = [...new Set(all.map((o) => o[o.length - 1]))];
    return { validOrders: all, count: all.length, firsts, lasts, first: firsts.length === 1 ? firsts[0] : null, last: lasts.length === 1 ? lasts[0] : null };
  },
  grade(parsed, facts) {
    const o = R02.oracle(facts);
    const rawOrder = parsed.fields.order || [];
    const order = rawOrder.map((x) => String(x).normalize('NFKC').toUpperCase().replace(/[^A-Z]/g, '')).filter((x) => x.length === 1);
    const expected = facts.tasks.map((t) => t.code);
    const setOk = order.length === expected.length && expected.every((c) => order.includes(c)) && new Set(order).size === order.length;
    const startsWithA = setOk && order[0] === 'A';
    const endsWithE = setOk && order[order.length - 1] === 'E';
    const checks = [];
    checks.push({
      criterionId: 'R02.C1',
      points: 2,
      passed: startsWithA,
      reason:
        order.length === 0
          ? '未解析出 order 数组'
          : !setOk
            ? `步骤集合不正确：${JSON.stringify(order)}`
            : startsWithA
              ? '五步齐全且从 A 开始'
              : `五步齐全但并非从 A 开始（首步为 ${order[0]}）`,
    });
    const violations = [];
    if (setOk) {
      for (const [task, ds] of Object.entries(facts.deps)) {
        for (const d of ds) {
          if (order.indexOf(d) > order.indexOf(task)) violations.push(`${task} 应在 ${d} 之后`);
        }
      }
    }
    checks.push({
      criterionId: 'R02.C2',
      points: 2,
      passed: setOk && violations.length === 0,
      reason: !setOk ? '顺序不完整，无法校验依赖' : violations.length === 0 ? '全部依赖关系满足' : `违反依赖：${violations.join('；')}`,
    });
    const firstTxt = parsed.fields.first ? normText(parsed.fields.first).toUpperCase().replace(/[^A-Z]/g, '') : null;
    const lastTxt = parsed.fields.last ? normText(parsed.fields.last).toUpperCase().replace(/[^A-Z]/g, '') : null;
    // C3 同时校验：order 真的以 E 收尾，且 first/last 字段与 order 首末一致（防止只填对字段、顺序错）
    const firstOk = setOk && firstTxt === order[0];
    const lastOk = setOk && lastTxt === order[order.length - 1];
    checks.push({
      criterionId: 'R02.C3',
      points: 2,
      passed: setOk && endsWithE && firstOk && lastOk,
      reason: !setOk
        ? '顺序不完整，无法校验首末步'
        : !endsWithE
          ? `最后一步应为 E（开放销售），实际为 ${order[order.length - 1]}`
          : firstOk && lastOk
            ? `首末步正确：${order[0]} 开始、${order[order.length - 1]} 结束，且字段自洽`
            : `first/last 字段与 order 首末不一致（字段 ${firstTxt ?? '未填'}/${lastTxt ?? '未填'}，顺序 ${order[0]}/${order[order.length - 1]}）`,
    });
    return checks;
  },
  fallback(raw) {
    if (typeof raw !== 'string') return null;
    const s = raw.normalize('NFKC').toUpperCase();
    const m = s.match(/(?:order|顺序)[^A-Z]{0,6}((?:[A-E][,，、\s]*){5})/);
    const seq = m ? (m[1].match(/[A-E]/g) || []) : [];
    return seq.length ? { fields: { order: seq }, source: 'prose', problems: [] } : null;
  },
};

/* ============================== R03 · 6 分 ============================== */
const R03 = {
  id: 'R03',
  dimension: DIM,
  difficulty: 'standard',
  points: 6,
  batch: 3,
  title: '满足多条件的最低成本方案',
  generate(seed) {
    const rng = makeRng(`${seed}#R03`);
    // 三种餐盒：素盒 12 元/份 2 份蛋白；鸡盒 20 元 3 份蛋白；牛盒 28 元 4 份蛋白
    const veg = { name: '素盒', price: rng.int(10, 14), protein: 2, max: 6 };
    const chicken = { name: '鸡盒', price: rng.int(18, 22), protein: 3, max: 5 };
    const beef = { name: '牛盒', price: rng.int(26, 30), protein: 4, max: 4 };
    const needProtein = rng.int(9, 13);
    const needBoxes = rng.int(3, 4);
    const facts = { veg, chicken, beef, needProtein, needBoxes };
    const prompt = [
      '「跑得快团餐」要给活动订餐，要求同时满足两个条件：',
      `1) 总份数不少于 ${needBoxes} 份；2) 总蛋白质不少于 ${needProtein} 份。`,
      '可选餐盒（每份的蛋白质与价格）：',
      `- 素盒：${veg.protein} 份蛋白质，${veg.price} 元，最多点 ${veg.max} 份`,
      `- 鸡盒：${chicken.protein} 份蛋白质，${chicken.price} 元，最多点 ${chicken.max} 份`,
      `- 牛盒：${beef.protein} 份蛋白质，${beef.price} 元，最多点 ${beef.max} 份`,
      '',
      '请给出一个总价最低的方案。',
      '只输出一个 JSON 对象（三种各点几份）：',
      '{"veg":<素盒份数>,"chicken":<鸡盒份数>,"beef":<牛盒份数>}',
    ].join('\n');
    return {
      prompt,
      facts,
      schema: {
        veg: { type: 'number', aliases: ['veg', '素盒', 'vegetable', '素'] },
        chicken: { type: 'number', aliases: ['chicken', '鸡盒', '鸡'] },
        beef: { type: 'number', aliases: ['beef', '牛盒', '牛'] },
      },
      publicCriteria: [
        { id: 'R03.C1', points: 2, text: '方案满足份数与蛋白质两个下限' },
        { id: 'R03.C2', points: 2, text: '未超过每种餐盒的份数上限' },
        { id: 'R03.C3', points: 2, text: '总价达到理论最低（与穷举结果一致）' },
      ],
    };
  },
  oracle(facts) {
    const { veg, chicken, beef, needProtein, needBoxes } = facts;
    let best = null;
    const all = [];
    for (let v = 0; v <= veg.max; v++) {
      for (let c = 0; c <= chicken.max; c++) {
        for (let b = 0; b <= beef.max; b++) {
          const boxes = v + c + b;
          const protein = v * veg.protein + c * chicken.protein + b * beef.protein;
          const cost = v * veg.price + c * chicken.price + b * beef.price;
          if (boxes < needBoxes || protein < needProtein) continue;
          all.push({ veg: v, chicken: c, beef: b, cost, boxes, protein });
          if (!best || cost < best.cost) best = { veg: v, chicken: c, beef: b, cost, boxes, protein };
        }
      }
    }
    return { best, allCount: all.length, minCost: best ? best.cost : null };
  },
  grade(parsed, facts) {
    const o = R03.oracle(facts);
    const { veg, chicken, beef, needProtein, needBoxes } = facts;
    const v = parsed.fields.veg;
    const c = parsed.fields.chicken;
    const b = parsed.fields.beef;
    const okNums = [v, c, b].every((x) => typeof x === 'number' && Number.isInteger(x) && x >= 0);
    const checks = [];
    if (!okNums) {
      for (const id of ['R03.C1', 'R03.C2', 'R03.C3']) {
        checks.push({ criterionId: id, points: 2, passed: false, reason: '未解析出三种餐盒的整数份数（字段 veg/chicken/beef）' });
      }
      return checks;
    }
    const boxes = v + c + b;
    const protein = v * veg.protein + c * chicken.protein + b * beef.protein;
    checks.push({
      criterionId: 'R03.C1',
      points: 2,
      passed: boxes >= needBoxes && protein >= needProtein,
      reason: `份数 ${boxes}（需≥${needBoxes}），蛋白质 ${protein}（需≥${needProtein}）`,
    });
    const inCap = v <= veg.max && c <= chicken.max && b <= beef.max;
    const feasible = boxes >= needBoxes && protein >= needProtein;
    checks.push({
      criterionId: 'R03.C2',
      points: 2,
      // 只奖励「可行且不超上限」的方案；0/0/0 这类空方案不因「没超上限」白拿分
      passed: feasible && inCap,
      reason: !feasible
        ? `方案本身不可行（份数 ${boxes}/需≥${needBoxes}，蛋白质 ${protein}/需≥${needProtein}），不能仅凭「未超上限」得分`
        : inCap
          ? '未超过各餐盒份数上限'
          : `超过上限：素盒≤${veg.max}、鸡盒≤${chicken.max}、牛盒≤${beef.max}`,
    });
    const cost = v * veg.price + c * chicken.price + b * beef.price;
    const fullyFeasible = boxes >= needBoxes && protein >= needProtein && inCap;
    checks.push({
      criterionId: 'R03.C3',
      points: 2,
      passed: fullyFeasible && cost === o.minCost,
      reason: fullyFeasible ? `总价 ${cost} 元，理论最低 ${o.minCost} 元` : '方案不可行，无法比较总价',
    });
    return checks;
  },
  fallback(raw) {
    if (typeof raw !== 'string') return null;
    const s = raw.normalize('NFKC');
    const grab = (label) => {
      const m = s.match(new RegExp(`(?:${label})[^0-9]{0,6}(\\d+)`));
      return m ? Number(m[1]) : undefined;
    };
    const fields = {};
    for (const [k, label] of [['veg', '素盒|veg'], ['chicken', '鸡盒|chicken'], ['beef', '牛盒|beef']]) {
      const val = grab(label);
      if (val !== undefined) fields[k] = val;
    }
    return Object.keys(fields).length ? { fields, source: 'prose', problems: [] } : null;
  },
};

/* ============================== R04 · 9 分 ============================== */
const R04 = {
  id: 'R04',
  dimension: DIM,
  difficulty: 'challenge',
  points: 9,
  batch: 4,
  title: '六线索排除推理（唯一解）',
  generate(seed) {
    const rng = makeRng(`${seed}#R04`);
    const namePool = ['阿岚', '阿布', '阿澈', '阿豆', '阿芙', '阿果', '阿海', '阿金'];
    const names = rng.sample(namePool, 4);
    const colorPool = ['红', '蓝', '绿', '黄', '紫', '橙'];
    // 独立随机生成一个真实解，再用「独立穷举」确认 6 条线索只留下唯一解；不唯一就重抽。
    let attempt = 0;
    let chosen = null;
    while (attempt++ < 200) {
      const colors = rng.sample(colorPool, 4);
      const shuffledNames = rng.shuffle(names);
      // 关键：位置必须与姓名的排列**解耦**。
      // 旧写法 solution[i]={position:i+1, name:shuffledNames[i]} 让 names[i] 的真实位置恒等于 i+1，
      // 考生按示例里的姓名顺序填 1/2/3/4 就能白拿 C1（结构性泄漏，100/100 seed 命中）。
      const positions = rng.shuffle([1, 2, 3, 4]);
      const solution = shuffledNames.map((n, i) => ({ name: n, position: positions[i], color: colors[i] }));
      const facts = { solution, names: shuffledNames, colors };
      const lines = buildCluesFromSolution(facts);
      if (lines && lines.length === 6) { chosen = { facts, lines }; break; }
    }
    if (!chosen) {
      // 兜底：固定一套已知唯一解的实例（与随机流无关，保证任何 seed 都能出题）
      const sol = [
        { position: 2, name: names[0], color: '红' },
        { position: 4, name: names[1], color: '蓝' },
        { position: 1, name: names[2], color: '绿' },
        { position: 3, name: names[3], color: '黄' },
      ];
      const facts = { solution: sol, names: names.slice(), colors: ['红', '蓝', '绿', '黄'] };
      const lines = buildCluesFromSolution(facts);
      if (!lines || lines.length !== 6) throw new Error('R04 无法构造唯一解线索（内部错误）');
      chosen = { facts, lines };
    }
    const { facts, lines } = chosen;
    const clueTests = lines.map((l) => ({ test: l.test }));
    facts.clueTests = clueTests;
    // 关键：题面必须**显式给出**这 4 种颜色。否则「颜色互不相同」只约束了彼此不等，
    // 第 4 个人的颜色在未列出的色池里仍有多种可能 —— 唯一性必须在题面可及的模型空间里成立。
    const colorListText = facts.colors.join('、');
    const prompt = [
      `四个朋友：${facts.names.join('、')}，各拿一张不同颜色的卡片，坐在 1、2、3、4 号四个位置上（一人一位）。`,
      '四个人的位置和颜色都要推出来，一个都不能少。',
      `四张卡片的颜色恰好是这四种：${colorListText}（每种各一张，不重复）。`,
      '已知线索：',
      ...lines.map((l, i) => `${i + 1}) ${l.text}`),
      '',
      '请推理出每个人的位置和卡片颜色。',
      '只输出一个 JSON 对象，键为姓名，值为 {"position": 位置编号, "color": "颜色"}：',
      // 示例里的 position 必须是占位符：若写成 1/2/3/4，它恰好等于真实名次（白送 C1 的 3 分）
      `{"${facts.names[0]}":{"position":"<位置>","color":"<颜色>"},"${facts.names[1]}":{"position":"<位置>","color":"<颜色>"}}`,
      '（上面只示范 JSON 结构，位置和颜色都要按线索自己推，不要照抄。）',
    ].join('\n');
    return {
      prompt,
      facts,
      schema: { seats: { type: 'object', aliases: ['seats', '答案', 'answer', 'people'] } },
      publicCriteria: [
        { id: 'R04.C1', points: 3, text: '四个人的位置全部正确' },
        { id: 'R04.C2', points: 3, text: '四个人的卡片颜色全部正确' },
        { id: 'R04.C3', points: 3, text: '位置与颜色的一一对应关系全部正确' },
      ],
      answerStyle: 'personMap',
    };
  },
  oracle(facts) {
    // 独立穷举：直接用题面线索谓词求解，不读 facts.solution
    const { names, colors } = facts;
    const clues = facts.clueTests || [];
    if (clues.length) {
      const sols = solveSeats(names, colors, clues);
      return { solutions: sols, unique: sols.length === 1, answer: sols[0] };
    }
    // 没有存谓词时退回：用 facts.solution 自证（仍走全排列校验）
    const sols = solveSeats(names, colors, [{ test: (s) => names.every((n) => s[n].color === facts.solution.find((x) => x.name === n).color && s[n].position === facts.solution.find((x) => x.name === n).position) }]);
    return { solutions: sols, unique: sols.length === 1, answer: facts.solution[0] ? Object.fromEntries(facts.solution.map((x) => [x.name, { position: x.position, color: x.color }])) : null };
  },
  grade(parsed, facts) {
    const o = R04.oracle(facts);
    const expected = o.answer || {};
    const ans = parsed.fields.seats || {};
    const names = facts.names;
    const pickPerson = (obj, name) => {
      if (obj[name] && typeof obj[name] === 'object') return obj[name];
      const key = Object.keys(obj).find((k) => squash(k) === squash(name));
      return key && typeof obj[key] === 'object' ? obj[key] : null;
    };
    let posRight = 0;
    let colorRight = 0;
    let pairRight = 0;
    const missing = [];
    for (const n of names) {
      const got = pickPerson(ans, n);
      const exp = expected[n];
      if (!got) { missing.push(n); continue; }
      const pos = toNumber(got.position ?? got.pos ?? got['位置']);
      const color = normText(got.color ?? got['颜色']);
      const posOk = sameNumber(pos, exp.position);
      const colOk = color === exp.color;
      if (posOk) posRight++;
      if (colOk) colorRight++;
      if (posOk && colOk) pairRight++;
    }
    const checks = [];
    checks.push({
      criterionId: 'R04.C1',
      points: 3,
      passed: posRight === names.length,
      reason: posRight === names.length ? '四个人的位置全部正确' : `${posRight}/${names.length} 人位置正确${missing.length ? `；未解析到：${missing.join('、')}` : ''}`,
    });
    checks.push({
      criterionId: 'R04.C2',
      points: 3,
      passed: colorRight === names.length,
      reason: colorRight === names.length ? '四个人的颜色全部正确' : `${colorRight}/${names.length} 人颜色正确`,
    });
    checks.push({
      criterionId: 'R04.C3',
      points: 3,
      passed: pairRight === names.length,
      reason: pairRight === names.length ? '位置-颜色对应关系全部正确' : `${pairRight}/${names.length} 人的位置与颜色同时正确`,
    });
    return checks;
  },
  /** 自定义解析：整个对象就是人名 → {position,color} */
  parse(raw) {
    const fields = {};
    let carrier = null;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) carrier = raw;
    else if (typeof raw === 'string') {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try { carrier = JSON.parse(m[0].normalize('NFKC')); } catch { carrier = null; }
      }
    }
    if (carrier) {
      const obj = carrier.seats || carrier.answer || carrier.people || carrier;
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) fields.seats = obj;
    }
    return { fields, source: 'personMap', problems: Object.keys(fields).length ? [] : ['未找到以姓名为键的答案对象'] };
  },
};

export default [R01, R02, R03, R04];
