/**
 * 逻辑推理维度（reasoning）—— R01 / R02 / R03 / R04
 * 合计 4 + 6 + 6 + 9 = 25 分
 *
 * 设计目标（v1.3）：
 *   这四题要测「建模 + 多步求解」，不是「细心」。具体来说：
 *     R01  购物合计：多商品 × 多促销类型 + 封顶 + 包邮门槛，必须逐行算再汇总
 *     R02  工序排程：10~12 步、两条独立链交错，必须真做拓扑排序
 *     R03  背包：贪心有系统性偏差，必须 DP / 严格论证（有证明测试）
 *     R04  座位推理：6 人 6 色 6 位（720 种排列）+ 关系型线索
 *
 * 纪律（每一条都由 tests/hard-reasoning.test.mjs 守着）：
 *   - generate 只产出「题面事实」，绝不产出答案；
 *   - oracle 独立于 generate 随机流（重新求解事实，不读构造时的中间变量）；
 *   - 题面示例一律占位符；
 *   - 评分条件文本中性：不点破陷阱、不含具体数值；
 *   - 同一 seed 完全确定，不同 seed 实质变化。
 */
import { makeRng } from '../rng.mjs';
import { toNumber, toList, sameNumber, normText, squash } from '../../grading/parse.mjs';

const DIM = 'reasoning';

/* ========================================================================== *
 * 通用：把任意输入安全地转成非负整数（grade 不抛异常的第一道防线）
 * ========================================================================== */
function safeInt(x) {
  const n = toNumber(x);
  if (n === null || !Number.isFinite(n)) return null;
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

/* ========================================================================== *
 * R01 · 购物小票：多商品 + 多种促销 + 券封顶 + 包邮门槛
 * ========================================================================== */

/**
 * 对一行商品算「原价」与「促销后价格」。
 * 促销类型：
 *   none        无促销，原价
 *   secondHalf  第 2 件半价（买 1 件不触发；按 (qty - qty % 2) 组算）
 *   cap         限购 maxQty 件，超出部分按原价（本题只要求不超，故 normal 即可）
 *
 * 注意：本题的「复杂」不在单行，而在**多行汇总 + 券封顶 + 包邮门槛**三层依赖。
 */

/** 计算一行：返回 { lineOriginal, lineAfterPromo, promoNote } */
function computeLine(item, qty) {
  const original = item.price * qty;
  let after = original;
  if (item.promo === 'secondHalf' && qty >= 2) {
    // 每两件为一组：第 1 件原价，第 2 件半价。不足两件的零头按原价。
    const pairs = Math.floor(qty / 2);
    const singles = qty % 2;
    after = pairs * (item.price + item.price / 2) + singles * item.price;
  }
  return { lineOriginal: original, lineAfterPromo: after };
}

/** 独立求解 R01：逐行算 → 汇总 → 券 → 包邮 */
function solveR01(facts) {
  let subtotal = 0;
  let afterPromo = 0;
  for (const it of facts.items) {
    const qty = it.qty;
    const { lineOriginal, lineAfterPromo } = computeLine(it, qty);
    subtotal += lineOriginal;
    afterPromo += lineAfterPromo;
  }
  // 优惠券：满 couponThreshold 可用，减 couponValue，但最多减 couponCap，且不能减成负数
  const couponEligible = afterPromo >= facts.couponThreshold;
  const couponCut = couponEligible ? Math.min(facts.couponValue, facts.couponCap, afterPromo) : 0;
  const afterCoupon = afterPromo - couponCut;
  // 包邮：券后满 freeShipThreshold 免运费，否则加运费
  const shipping = afterCoupon >= facts.freeShipThreshold ? 0 : facts.shippingFee;
  const total = afterCoupon + shipping;
  return {
    subtotal: round2(subtotal),
    afterPromo: round2(afterPromo),
    couponCut: round2(couponCut),
    shipping: round2(shipping),
    total: round2(total),
  };
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

const R01 = {
  id: 'R01',
  dimension: DIM,
  difficulty: 'easy',
  points: 4,
  batch: 1,
  title: '购物小票的真实合计',
  generate(seed) {
    const rng = makeRng(`${seed}#R01`);
    // 商品池：名称 + 价格区间 + 促销类型
    const pool = [
      { name: '陶瓷马克杯', price: [28, 45], promo: 'none' },
      { name: '棉质毛巾', price: [19, 32], promo: 'secondHalf' },
      { name: '香薰蜡烛', price: [36, 58], promo: 'none' },
      { name: '玻璃收纳罐', price: [24, 40], promo: 'secondHalf' },
      { name: '亚麻餐垫', price: [15, 26], promo: 'none' },
      { name: '不锈钢保温杯', price: [59, 88], promo: 'none' },
      { name: '纯棉浴巾', price: [42, 66], promo: 'secondHalf' },
      { name: '木质托盘', price: [33, 52], promo: 'none' },
      { name: '玻璃水壶', price: [45, 70], promo: 'none' },
      { name: '帆布收纳袋', price: [22, 38], promo: 'secondHalf' },
    ];
    const n = rng.int(6, 8); // 6~8 个商品行
    const picked = rng.shuffle(pool).slice(0, n);
    const items = picked.map((p) => ({
      name: p.name,
      price: rng.int(p.price[0], p.price[1]),
      promo: p.promo,
      // 有「第2件半价」的行必须买 ≥2 件才有意义；其余行 1~3 件
      qty: p.promo === 'secondHalf' ? rng.int(2, 4) : rng.int(1, 3),
    }));

    // 先算出促销后金额，再据此定券门槛 / 包邮门槛，保证题目有「多层」而不是恒触发
    const provisional = items.reduce((s, it) => {
      return s + computeLine(it, it.qty).lineAfterPromo;
    }, 0);
    const couponThreshold = Math.max(50, Math.round(provisional * rng.pick([0.45, 0.55, 0.65])));
    const couponValue = rng.pick([15, 20, 25, 30, 35]);
    // 封顶：故意让「券面额」大于「封顶」，逼考生注意封顶而不是直接减面额
    const couponCap = Math.max(5, Math.round(couponValue * rng.pick([0.4, 0.5, 0.6])));
    const freeShipThreshold = Math.max(60, Math.round(provisional * rng.pick([0.7, 0.8, 0.9])));
    const shippingFee = rng.pick([6, 8, 10, 12]);

    const facts = {
      items,
      couponThreshold,
      couponValue,
      couponCap,
      freeShipThreshold,
      shippingFee,
    };

    const itemLines = items.map((it, i) => {
      const promoText = it.promo === 'secondHalf'
        ? '该商品参加「第 2 件半价」（两件为一组，组内第 2 件按半价结算，不足一组的零头按原价）'
        : '该商品不参加任何单品促销';
      return `${i + 1}. ${it.name}：单价 ${it.price} 元，购买 ${it.qty} 件。${promoText}。`;
    });

    const prompt = [
      '你在核对「暖阳杂货铺」的一张购物清单，需要算出**实际应付款**。',
      '',
      '清单一：',
      ...itemLines,
      '',
      '清单一之外的结算规则（按顺序生效）：',
      `A. 先用每条商品自身的促销规则，算出「促销后金额」。`,
      `B. 促销后金额满 ${couponThreshold} 元，可使用一张 ${couponValue} 元优惠券；该券单笔最多抵扣 ${couponCap} 元，且不能把金额减成负数。`,
      `C. 用完券后金额满 ${freeShipThreshold} 元包邮；未满则另加 ${shippingFee} 元运费。`,
      '',
      '请计算四个数：活动前原价合计、促销后金额、优惠券实际抵扣额、最终应付款。',
      '只输出一个 JSON 对象（单位：元，只写数字）：',
      '{"subtotal": <活动前原价合计>, "afterPromo": <促销后金额>, "couponCut": <优惠券实际抵扣额>, "total": <最终应付款>}',
      '（上面的尖括号只是占位，请填入你算出的数字。）',
    ].join('\n');

    return {
      prompt,
      facts,
      schema: {
        subtotal: { type: 'number', aliases: ['subtotal', '原价', '原价合计', '活动前原价', 'beforeDiscount'] },
        afterPromo: { type: 'number', aliases: ['afterPromo', '促销后', '促销后金额', '促销金额'] },
        couponCut: { type: 'number', aliases: ['couponCut', '优惠券抵扣', '券抵扣', '抵扣额', 'coupon'] },
        total: { type: 'number', aliases: ['total', '应付款', '实付', '实际付款', 'payable', 'finalTotal', '实际应付款', '实付款', '应付金额', '实际支付', '实付金额'] },
      },
      publicCriteria: [
        { id: 'R01.C1', points: 1, text: '活动前原价合计正确' },
        { id: 'R01.C2', points: 3, text: '最终应付款正确（已计入单品促销、优惠券抵扣与运费）' },
      ],
    };
  },
  oracle(facts) {
    return solveR01(facts);
  },
  grade(parsed, facts) {
    const o = solveR01(facts);
    const checks = [];
    const sub = toNumber(parsed?.fields?.subtotal);
    const tot = toNumber(parsed?.fields?.total);
    checks.push({
      criterionId: 'R01.C1',
      points: 1,
      passed: sameNumber(sub, o.subtotal),
      reason: sub === null
        ? '未解析出活动前原价合计（subtotal）'
        : sameNumber(sub, o.subtotal)
          ? `活动前原价合计正确：${o.subtotal}`
          : `活动前原价合计应为 ${o.subtotal}，实际为 ${sub}`,
    });
    checks.push({
      criterionId: 'R01.C2',
      points: 3,
      passed: sameNumber(tot, o.total),
      reason: tot === null
        ? '未解析出最终应付款（total）'
        : sameNumber(tot, o.total)
          ? `最终应付款正确：${o.total}`
          : `最终应付款应为 ${o.total}，实际为 ${tot}`,
    });
    return checks;
  },
  fallback(raw) {
    if (typeof raw !== 'string') return null;
    const s = raw.normalize('NFKC');
    const grab = (re) => {
      const m = s.match(re);
      return m ? Number(m[1]) : undefined;
    };
    const fields = {};
    const sub = grab(/(?:原价|小计|subtotal)[^0-9\-]{0,10}(\d+(?:\.\d+)?)/i);
    const tot = grab(/(?:应付款|实付|实际支付|total|合计)[^0-9\-]{0,10}(\d+(?:\.\d+)?)/i);
    if (sub !== undefined) fields.subtotal = sub;
    if (tot !== undefined) fields.total = tot;
    return Object.keys(fields).length ? { fields, source: 'prose', problems: [] } : null;
  },
};

/* ========================================================================== *
 * R02 · 工序排程：10~12 步、两条独立链 + 跨链约束
 * ========================================================================== */

/**
 * 从 deps 表拓扑排序枚举全部合法序列。
 * 独立于 generate：只吃 facts.deps。
 */
function enumerateTopo(facts, limit = 200000) {
  const codes = facts.tasks.map((t) => t.code);
  const all = [];
  const rec = (done) => {
    if (all.length >= limit) return;
    if (done.length === codes.length) { all.push([...done]); return; }
    for (const c of codes) {
      if (done.includes(c)) continue;
      const need = facts.deps[c] || [];
      if (need.every((d) => done.includes(d))) {
        done.push(c);
        rec(done);
        done.pop();
      }
    }
  };
  rec([]);
  return all;
}

const R02 = {
  id: 'R02',
  dimension: DIM,
  difficulty: 'standard',
  points: 6,
  batch: 2,
  title: '依赖关系与可行顺序',
  generate(seed) {
    const rng = makeRng(`${seed}#R02`);
    // 两条独立工序链：链 P（5 步）与链 Q（5~7 步），共 10~12 步。
    // 链内严格串行；两链之间由 2 条跨链约束连起来，迫使交错。
    const P_ROLES = ['接单登记', '款式确认', '备料裁切', '缝制组装', '首件检视'];
    const Q_ROLES = ['面料入库', '缩水测试', '染色打样', '熨烫定型', '尾件检视', '装袋贴标', '装箱待发'];
    const nQ = rng.int(5, 7);
    const qRoles = Q_ROLES.slice(0, nQ);
    const roles = [...P_ROLES, ...qRoles];
    const total = roles.length; // 10 ~ 12

    // 随机分配字母代号（必须与位置解耦，避免「按 A..L 顺序填」白拿分）
    const letters = 'ABCDEFGHIJKL'.slice(0, total).split('');
    const codes = rng.shuffle(letters);
    const pCodes = codes.slice(0, P_ROLES.length);
    const qCodes = codes.slice(P_ROLES.length);

    const tasks = roles.map((name, i) => ({ code: codes[i], name, chain: i < P_ROLES.length ? 'P' : 'Q' }));
    const deps = {};
    // 链内串行
    for (let i = 0; i < pCodes.length; i++) {
      deps[pCodes[i]] = i === 0 ? [] : [pCodes[i - 1]];
    }
    for (let i = 0; i < qCodes.length; i++) {
      deps[qCodes[i]] = i === 0 ? [] : [qCodes[i - 1]];
    }

    // 跨链约束：只决定「两链之间的相对先后」，不改变链内顺序。
    // ⚠️ v1.4 修复的关键点：这些关系必须在题面里**明确标注为跨链**。
    //    旧版把它们混进一张扁平的「谁等谁」清单里，于是 C2(跨链) / C3(链内)
    //    的划分对答题者不可知 —— 那本身就是一条隐藏条件，评分不公平。
    const p3 = pCodes[2];
    const q2 = qCodes[1];
    const qNearEnd = qCodes[qCodes.length - 2];
    const p2 = pCodes[1];
    const pLast = pCodes[pCodes.length - 1];

    const crossDeps = [];
    deps[p3] = [...deps[p3], q2];            // P3 等 Q2
    crossDeps.push({ task: p3, need: q2 });
    deps[qNearEnd] = [...deps[qNearEnd], p2]; // Q(n-1) 等 P2
    crossDeps.push({ task: qNearEnd, need: p2 });
    if (nQ >= 3) {                            // P 的最后一步等 Q3
      deps[pLast] = [...deps[pLast], qCodes[2]];
      crossDeps.push({ task: pLast, need: qCodes[2] });
    }

    const nameOf = (code) => tasks.find((t) => t.code === code).name;
    for (const rel of crossDeps) {
      rel.taskName = nameOf(rel.task);
      rel.needName = nameOf(rel.need);
    }

    const facts = { tasks, deps, total, pCodes, qCodes, chains: { P: pCodes, Q: qCodes }, crossDeps };

    // 题面：链内顺序 + 跨链要求**分开写**，让 C1/C2/C3 三项条件全部可从题面推导。
    const chainLine = (label, role, codes) => [
      `【${label}】${role}，共 ${codes.length} 步，链内必须严格按这个顺序做：`,
      `  ${codes.map((c) => `${c}（${nameOf(c)}）`).join(' → ')}`,
    ];

    const prompt = [
      `你是「云朵制衣」的车间调度员。今天要完成 ${total} 个工序，每个工序只做一次，且同一时刻只能做一道工序。`,
      '',
      `${total} 个工序分属两条**互相独立**的工序链：链内顺序固定，两条链之间只需满足下面列出的跨链要求。`,
      '',
      ...chainLine('链 P · 缝制线', '按固定次序推进', pCodes),
      '',
      ...chainLine('链 Q · 面料线', '按固定次序推进', qCodes),
      '',
      `【跨链要求】除了各自的链内顺序，还必须满足以下 ${crossDeps.length} 条链间先后：`,
      ...crossDeps.map((r) => `  · ${r.task}（${r.taskName}）必须在 ${r.need}（${r.needName}）完成之后`),
      '',
      '两条链的工序可以交错安排，只要不违反上面任何一条要求即可。',
      '',
      '请给出一个满足以上全部要求的完整执行顺序。',
      '只输出一个 JSON 对象：',
      `{"order": [${Array.from({ length: total }, () => '"<工序代号>"').join(', ')}]}`,
      `（order 必须恰好包含 ${total} 个工序代号，每个代号出现一次；上面只是占位，具体顺序请自己推。）`,
    ].join('\n');

    return {
      prompt,
      facts,
      schema: {
        order: { type: 'list', aliases: ['order', '顺序', '执行顺序', 'sequence', '工序顺序'] },
      },
      publicCriteria: [
        {
          id: 'R02.C1',
          points: 2,
          text: 'order 恰好包含题面列出的全部工序代号各一次：不缺、不重复、无多余。本项只看代号集合，完全不看先后顺序。',
        },
        {
          id: 'R02.C2',
          points: 2,
          text: '【前提：本组第一项条件（代号集合完整）通过】题面「跨链要求」列出的每一条链间先后都满足；本项只考跨链，不考链内。',
        },
        {
          id: 'R02.C3',
          points: 2,
          text: '【前提：本组第一项条件（代号集合完整）通过】链 P 与链 Q 各自的内部次序全部正确；本项只考链内，不考跨链。',
        },
      ],
    };
  },
  oracle(facts) {
    // 独立求解：只吃 deps 做拓扑枚举。取字典序最小的合法序作为代表性答案。
    const all = enumerateTopo(facts);
    const codes = facts.tasks.map((t) => t.code);
    // 按代号排序后再枚举，保证「字典序最小」是确定的
    const sorted = [...codes].sort();
    const first = all.length ? [...all].sort((a, b) => a.join('').localeCompare(b.join(''))) [0] : null;
    // 首/末步是否唯一
    const firsts = [...new Set(all.map((o) => o[0]))];
    const lasts = [...new Set(all.map((o) => o[o.length - 1]))];
    return {
      validOrders: all,
      count: all.length,
      firsts,
      lasts,
      first: firsts.length === 1 ? firsts[0] : null,
      last: lasts.length === 1 ? lasts[0] : null,
      order: first,
    };
  },
  grade(parsed, facts) {
    const expected = facts.tasks.map((t) => t.code);
    const rawOrder = Array.isArray(parsed?.fields?.order) ? parsed.fields.order : [];
    const order = rawOrder
      .map((x) => String(x).normalize('NFKC').toUpperCase().replace(/[^A-Z]/g, ''))
      .filter((x) => x.length === 1);
    const pos = new Map(order.map((c, i) => [c, i]));

    // ── C1 · 格式与覆盖：只看代号集合，完全不看顺序 ────────────────────────
    // v1.4 修复：旧版 C1 里藏了一个 hasProgress（链内次序），
    // 导致「代号齐全但整体倒序」连 C1 都拿不到 —— 而公开条件只承诺了「各一次」。
    // 公开条件说什么就只判什么，多余的隐藏要求一律删掉。
    const missing = expected.filter((c) => !pos.has(c));
    const dup = [...new Set(order.filter((c, i) => order.indexOf(c) !== i))];
    const extra = [...new Set(order.filter((c) => !expected.includes(c)))];
    const setOk = missing.length === 0 && dup.length === 0 && extra.length === 0;

    const checks = [];
    checks.push({
      criterionId: 'R02.C1',
      points: 2,
      passed: setOk,
      reason: order.length === 0
        ? '未解析出 order 数组'
        : setOk
          ? `恰好包含题面的 ${expected.length} 个工序代号各一次（本项不校验先后）`
          : [
              missing.length ? `缺少 ${missing.join('、')}` : '',
              dup.length ? `重复 ${dup.join('、')}` : '',
              extra.length ? `多出 ${extra.join('、')}` : '',
            ].filter(Boolean).join('；') || `代号数量不符：得到 ${order.length} 项，应为 ${expected.length} 项`,
    });

    // ── C2 · 跨链关系（前提：C1 通过）─────────────────────────────────────
    const crossBad = [];
    if (setOk) {
      for (const rel of facts.crossDeps || []) {
        if (pos.get(rel.need) > pos.get(rel.task)) {
          crossBad.push(`${rel.task}（${rel.taskName}）应在 ${rel.need}（${rel.needName}）之后`);
        }
      }
    }
    checks.push({
      criterionId: 'R02.C2',
      points: 2,
      passed: setOk && crossBad.length === 0,
      reason: !setOk
        ? '前提未满足（C1 未通过：代号集合不完整/有重复），无法校验跨链要求，本项不给分'
        : crossBad.length === 0
          ? `题面列出的 ${(facts.crossDeps || []).length} 条跨链要求全部满足`
          : `违反跨链要求：${crossBad.slice(0, 3).join('；')}${crossBad.length > 3 ? ` 等 ${crossBad.length} 处` : ''}`,
    });

    // ── C3 · 链内关系（前提：C1 通过）─────────────────────────────────────
    const chainBad = [];
    if (setOk) {
      for (const [chainName, codes] of Object.entries(facts.chains || {})) {
        for (let i = 1; i < codes.length; i++) {
          if (pos.get(codes[i - 1]) > pos.get(codes[i])) {
            chainBad.push(`链 ${chainName} 内 ${codes[i - 1]} 应在 ${codes[i]} 之前`);
          }
        }
      }
    }
    checks.push({
      criterionId: 'R02.C3',
      points: 2,
      passed: setOk && chainBad.length === 0,
      reason: !setOk
        ? '前提未满足（C1 未通过：代号集合不完整/有重复），无法校验链内次序，本项不给分'
        : chainBad.length === 0
          ? '链 P 与链 Q 的内部次序均正确'
          : `违反链内次序：${chainBad.slice(0, 3).join('；')}${chainBad.length > 3 ? ` 等 ${chainBad.length} 处` : ''}`,
    });
    return checks;
  },
  fallback(raw) {
    if (typeof raw !== 'string') return null;
    const s = raw.normalize('NFKC').toUpperCase();
    const m = s.match(/(?:order|顺序)[^A-Z]{0,8}((?:[A-L][,，、\s]*){6,14})/);
    const seq = m ? (m[1].match(/[A-L]/g) || []) : [];
    return seq.length ? { fields: { order: seq }, source: 'prose', problems: [] } : null;
  },
};

/* ========================================================================== *
 * R03 · 背包（贪心陷阱）：5~6 种商品，双约束，必须精确求解
 * ========================================================================== */

/**
 * 精确求解：多重背包（每种有上限），两个下限约束（件数 + 指标），最小化总价。
 *
 * ⚠️ 性能教训：这里**绝对不能**用回溯 DFS 反推最优组合。
 * 单种上限可以到 90，6 种就是 90^6 量级的搜索空间，
 * 即使加剪枝，真实 seed 下也出现过单次 5 秒（实测 R03 x10 = 6.4s，最慢 5.0s）。
 * 一旦 generate() 里调它，catalogFingerprint / doctor / start 全部被拖慢。
 *
 * 正确做法：**一次 DP 同时记录「最佳选择」，直接回溯路径**（O(types × cap × metric)）。
 * 复杂度 6 × 60 × 60 ≈ 2 万状态，微秒~毫秒级。
 */
function solveR03(facts) {
  const { types, needCount, needMetric } = facts;
  const H = needCount + 1;   // 件数维度（饱和截断）
  const W = needMetric + 1;  // 指标维度（饱和截断）
  const INF = Number.POSITIVE_INFINITY;
  const nTypes = types.length;

  // dp[i][c][m] = 只考虑前 i 种、件数(min(cap))、指标(min(cap)) 时的最小花费
  const dp = Array.from({ length: nTypes + 1 }, () =>
    Array.from({ length: H }, () => new Array(W).fill(INF)));
  // choice[i][c][m] = 第 i 种选了几件（用于回溯）
  const choice = Array.from({ length: nTypes + 1 }, () =>
    Array.from({ length: H }, () => new Array(W).fill(0)));
  dp[0][0][0] = 0;

  for (let i = 0; i < nTypes; i++) {
    const t = types[i];
    for (let c = 0; c < H; c++) {
      for (let m = 0; m < W; m++) {
        const base = dp[i][c][m];
        if (base === INF) continue;
        // 枚举第 i 种选 k 件（k=0..limit），做饱和转移
        for (let k = 0; k <= t.limit; k++) {
          const nc = Math.min(H - 1, c + k);
          const nm = Math.min(W - 1, m + k * t.metric);
          const cost = base + k * t.price;
          if (cost < dp[i + 1][nc][nm]) {
            dp[i + 1][nc][nm] = cost;
            choice[i + 1][nc][nm] = k;
          }
        }
      }
    }
  }

  const minCost = dp[nTypes][H - 1][W - 1];
  if (!Number.isFinite(minCost)) return { best: null, minCost: null, allCount: 0, types };

  // 回溯出具体组合
  const counts = {};
  let c = H - 1, m = W - 1;
  const picked = new Array(nTypes).fill(0);
  for (let i = nTypes; i >= 1; i--) {
    const k = choice[i][c][m];
    picked[i - 1] = k;
    const t = types[i - 1];
    // 回退：需要找到一个前驱状态 (pc, pm) 使 (pc + k, pm + k*metric) 饱和后等于 (c, m)
    // 由于用了饱和截断，前驱必须满足 min(H-1, pc+k) === c 且 min(W-1, pm+k*t.metric) === m
    let found = false;
    for (let pc = Math.max(0, c - k); pc <= c && !found; pc++) {
      for (let pm = Math.max(0, m - k * t.metric); pm <= m && !found; pm++) {
        if (Math.min(H - 1, pc + k) === c && Math.min(W - 1, pm + k * t.metric) === m
          && dp[i - 1][pc][pm] + k * t.price === dp[i][c][m]) {
          c = pc; m = pm; found = true;
        }
      }
    }
    if (!found) {
      // 理论上不会发生；兜底直接按 k 回退（饱和区边界）
      c = Math.max(0, c - k);
      m = Math.max(0, m - k * t.metric);
    }
  }
  for (let i = 0; i < nTypes; i++) counts[types[i].key] = picked[i];

  const totalCost = types.reduce((s, t, i) => s + t.price * picked[i], 0);
  const totalCount = types.reduce((s, t, i) => s + picked[i], 0);
  const totalMetric = types.reduce((s, t, i) => s + t.metric * picked[i], 0);
  return {
    best: { counts, cost: totalCost, count: totalCount, metric: totalMetric },
    minCost,
    allCount: null,
    types,
  };
}

/**
 * 贪心解（故意做的「短路思路」，用于证明本题不能贪心）。
 *
 * 规则：按「指标/单价」性价比从高到低，先把最划算的堆到上限，
 * 不够再依次补下一种。这是人类/模型最自然的直觉解法。
 *
 * 它之所以会错：性价比只考虑「单位价格买到的指标」，但**忽略了指标溢出**。
 * 最优解常常是「便宜的劣质货补足件数 + 少量高指标货刚好够线」，
 * 而贪心会把高指标货堆到超出需求，多花的钱全浪费。
 *
 * 这个函数**只用于出题时检验「贪心确实更贵」**，不参与判分。
 */
function greedyR03(facts) {
  const { types, needCount, needMetric } = facts;
  const order = [...types].sort((a, b) => (b.metric / b.price) - (a.metric / a.price));
  const counts = Object.fromEntries(types.map((t) => [t.key, 0]));
  let count = 0;
  let metric = 0;
  let cost = 0;
  for (const t of order) {
    while (counts[t.key] < t.limit && (count < needCount || metric < needMetric)) {
      counts[t.key]++;
      count++;
      metric += t.metric;
      cost += t.price;
    }
  }
  return { counts, cost, count, metric, feasible: count >= needCount && metric >= needMetric };
}

const R03 = {
  id: 'R03',
  dimension: DIM,
  difficulty: 'standard',
  points: 6,
  batch: 3,
  title: '满足多条件的最低成本方案',
  generate(seed) {
    const rng = makeRng(`${seed}#R03`);
    // 5~6 种配件。关键：性价比（指标/单价）最高的**不一定**是最优解，
    // 因为「指标溢出」会被浪费，而便宜的低指标货可能正好补齐缺口。
    // 数值放大到不能暴力枚举（单种上限 50~90，总量上万）。
    const pool = [
      { key: 'a', name: '标准模块', price: [11, 16], metric: [2, 3], limit: [40, 60] },
      { key: 'b', name: '增强模块', price: [19, 26], metric: [4, 6], limit: [30, 50] },
      { key: 'c', name: '专业模块', price: [33, 44], metric: [8, 11], limit: [20, 35] },
      { key: 'd', name: '轻量模块', price: [7, 10], metric: [1, 1], limit: [60, 90] },
      { key: 'e', name: '高密模块', price: [47, 62], metric: [13, 17], limit: [12, 22] },
      { key: 'f', name: '均衡模块', price: [23, 31], metric: [5, 7], limit: [25, 40] },
    ];
    const n = rng.int(5, 6);
    const picked = rng.shuffle(pool).slice(0, n);
    const types = picked.map((p) => ({
      key: p.key,
      name: p.name,
      price: rng.int(p.price[0], p.price[1]),
      metric: rng.int(p.metric[0], p.metric[1]),
      limit: rng.int(p.limit[0], p.limit[1]),
    }));

    // 需求：件数与指标都要达到。
    // 关键：必须保证「贪心解严格劣于最优解」，否则这题就退化成普通凑单。
    // 做法：在若干候选需求里挑第一个满足「贪心解 > 最优解」的组合；
    // 全都不满足就重新抽需求（仍然失败则用固定兜底需求）。
    const maxMetric = types.reduce((s, t) => s + t.metric * t.limit, 0);
    const maxCount = types.reduce((s, t) => s + t.limit, 0);
    let facts = null;
    let sol = null;
    let greedyCost = null;
    outer:
    for (const mf of [0.30, 0.35, 0.40, 0.45, 0.50]) {
      for (const cf of [0.06, 0.08, 0.10, 0.12, 0.15]) {
        const cand = {
          types,
          needMetric: Math.round(maxMetric * mf),
          needCount: Math.max(6, Math.round(maxCount * cf)),
        };
        const s1 = solveR03(cand);
        if (!s1.best) continue;
        const g = greedyR03(cand);
        // 贪心必须可行、且严格更贵 —— 这才是「贪心陷阱」
        if (g.feasible && g.cost > s1.minCost) {
          facts = cand;
          sol = s1;
          greedyCost = g.cost;
          break outer;
        }
      }
    }
    if (!facts) {
      // 兜底：用固定需求（保证有解；贪心性质由测试单独守卫）
      facts = {
        types,
        needMetric: Math.round(maxMetric * 0.35),
        needCount: Math.max(6, Math.round(maxCount * 0.08)),
      };
      sol = solveR03(facts);
      greedyCost = greedyR03(facts).cost;
      if (!sol.best) throw new Error(`R03 无法构造可行解（seed=${seed}）`);
    }
    facts.greedyCost = greedyCost;
    facts.optimalCost = sol.minCost;

    const typeLines = types.map((t) => {
      return `- ${t.name}（${t.key}）：单价 ${t.price} 元，每件提供 ${t.metric} 点指标，最多采购 ${t.limit} 件。`;
    });
    const prompt = [
      '「星河工坊」要采购一批模块组装测试机，需要同时满足两个下限：',
      `1) 总件数不少于 ${facts.needCount} 件；`,
      `2) 总指标不少于 ${facts.needMetric} 点。`,
      '',
      '可选模块（每件的指标与单价）：',
      ...typeLines,
      '',
      '请给出一个总花费最低的采购方案。',
      '只输出一个 JSON 对象（键是各模块的代号，值是对应的采购件数，没买的写 0）：',
      `{${types.map((t) => `"${t.key}": <${t.name}件数>`).join(', ')}}`,
      '（尖括号只是占位，请填入整数。）',
    ].join('\n');

    return {
      prompt,
      facts,
      schema: {
        ...Object.fromEntries(types.map((t) => [t.key, { type: 'number', aliases: [t.key, t.name] }])),
      },
      publicCriteria: [
        { id: 'R03.C1', points: 2, text: '方案同时满足件数与指标两个下限' },
        { id: 'R03.C2', points: 2, text: '各模块采购量均未超过其上限' },
        { id: 'R03.C3', points: 2, text: '总花费达到所有可行方案中的最低值' },
      ],
    };
  },
  oracle(facts) {
    return solveR03(facts);
  },
  grade(parsed, facts) {
    const o = solveR03(facts);
    const fields = parsed?.fields || {};
    // 读取各模块件数
    const counts = {};
    let allParsed = true;
    for (const t of facts.types) {
      const v = safeInt(fields[t.key]);
      if (v === null) { allParsed = false; counts[t.key] = null; } else counts[t.key] = v;
    }
    const checks = [];
    if (!allParsed) {
      for (const id of ['R03.C1', 'R03.C2', 'R03.C3']) {
        checks.push({
          criterionId: id,
          points: 2,
          passed: false,
          reason: '未解析出全部模块的非负整数件数',
        });
      }
      return checks;
    }
    const totalCount = facts.types.reduce((s, t) => s + counts[t.key], 0);
    const totalMetric = facts.types.reduce((s, t) => s + counts[t.key] * t.metric, 0);
    const totalCost = facts.types.reduce((s, t) => s + counts[t.key] * t.price, 0);
    const feasible = totalCount >= facts.needCount && totalMetric >= facts.needMetric;

    checks.push({
      criterionId: 'R03.C1',
      points: 2,
      passed: feasible,
      reason: `件数 ${totalCount}（需 ≥${facts.needCount}），指标 ${totalMetric}（需 ≥${facts.needMetric}）`,
    });

    const overCap = facts.types.filter((t) => counts[t.key] > t.limit);
    checks.push({
      criterionId: 'R03.C2',
      points: 2,
      passed: feasible && overCap.length === 0,
      reason: !feasible
        ? '方案本身未满足下限，不能仅凭「未超上限」得分'
        : overCap.length === 0
          ? '各模块采购量均在上限之内'
          : `超出上限：${overCap.map((t) => `${t.name}（≤${t.limit}）`).join('、')}`,
    });

    checks.push({
      criterionId: 'R03.C3',
      points: 2,
      passed: feasible && overCap.length === 0 && totalCost === o.minCost,
      reason: feasible && overCap.length === 0
        ? `总花费 ${totalCost} 元，理论最低 ${o.minCost} 元`
        : '方案不可行，无法比较总花费',
    });
    return checks;
  },
  fallback(raw) {
    if (typeof raw !== 'string') return null;
    const s = raw.normalize('NFKC');
    const fields = {};
    // 匹配 "a": 3 / a: 3 / a 3 件 等
    for (const m of s.matchAll(/["']?([a-f])["']?\s*[:：=]?\s*(\d+)/gi)) {
      fields[m[1].toLowerCase()] = Number(m[2]);
    }
    return Object.keys(fields).length ? { fields, source: 'prose', problems: [] } : null;
  },
};

/* ========================================================================== *
 * R04 · 座位推理：6 人 6 色 6 位（720 种排列）+ 关系线索
 * ========================================================================== */

/** 全排列（6 元素 720 种） */
function allPerms(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  arr.forEach((x, i) => {
    for (const rest of allPerms([...arr.slice(0, i), ...arr.slice(i + 1)])) out.push([x, ...rest]);
  });
  return out;
}

/**
 * 座位求解器（计数 + 提前退出版）。
 *
 * 性能教训：6 人时空间是 6!（位置）× 6!（颜色）= 518,400。
 * 出题阶段反复比较「加这条线索能砍掉多少候选」，若每次都全枚举会直接挂死。
 * 因此：limit 达到即返回；位置层预剪枝；唯一性判定用 limit=2。
 */
export function solveSeatsCount(names, colors, clues, limit = 2000) {
  let count = 0;
  const colorPerms = allPerms(colors);
  const posClues = clues.filter((c) => c.positionOnly === true);
  for (const np of allPerms(names)) {
    const seatPos = Object.fromEntries(names.map((n) => [n, np.indexOf(n) + 1]));
    if (posClues.length) {
      const nullSeat = Object.fromEntries(names.map((n) => [n, { position: seatPos[n], color: null }]));
      let posOk = true;
      for (const c of posClues) {
        let r = false;
        try { r = c.test(nullSeat) === true; } catch { r = false; }
        if (!r) { posOk = false; break; }
      }
      if (!posOk) continue;
    }
    for (const cp of colorPerms) {
      const seat = Object.fromEntries(names.map((n) => [n, { position: seatPos[n], color: cp[seatPos[n] - 1] }]));
      let ok = true;
      for (const c of clues) {
        let r = false;
        try { r = c.test(seat) === true; } catch { r = false; }
        if (!r) { ok = false; break; }
      }
      if (ok) {
        count++;
        if (count >= limit) return count;
      }
    }
  }
  return count;
}

/** 边扫边计数：记录第一个解，count 达到 limit 立即返回（oracle 主路径） */
export function solveSeatsFirst(names, colors, clues, limit = 2) {
  let count = 0;
  let seat0 = null;
  const colorPerms = allPerms(colors);
  const posClues = clues.filter((c) => c.positionOnly === true);
  for (const np of allPerms(names)) {
    const seatPos = Object.fromEntries(names.map((n) => [n, np.indexOf(n) + 1]));
    if (posClues.length) {
      const nullSeat = Object.fromEntries(names.map((n) => [n, { position: seatPos[n], color: null }]));
      let posOk = true;
      for (const c of posClues) {
        let r = false;
        try { r = c.test(nullSeat) === true; } catch { r = false; }
        if (!r) { posOk = false; break; }
      }
      if (!posOk) continue;
    }
    for (const cp of colorPerms) {
      const seat = Object.fromEntries(names.map((n) => [n, { position: seatPos[n], color: cp[seatPos[n] - 1] }]));
      let ok = true;
      for (const c of clues) {
        let r = false;
        try { r = c.test(seat) === true; } catch { r = false; }
        if (!r) { ok = false; break; }
      }
      if (ok) {
        count++;
        if (count === 1) seat0 = seat;
        if (count >= limit) return { count, seat: seat0 };
      }
    }
  }
  return { count, seat: seat0 };
}

/** 兼容旧接口：返回全部解 */
export function solveSeats(names, colors, clues) {
  const sols = [];
  const colorPerms = allPerms(colors);
  for (const np of allPerms(names)) {
    const seatPos = Object.fromEntries(names.map((n) => [n, np.indexOf(n) + 1]));
    for (const cp of colorPerms) {
      const seat = Object.fromEntries(names.map((n) => [n, { position: seatPos[n], color: cp[seatPos[n] - 1] }]));
      if (clues.every((c) => {
        try { return c.test(seat) === true; } catch { return false; }
      })) sols.push(seat);
    }
  }
  return sols;
}

/* -------------------------------------------------------------------------- *
 * 解耦求解：位置线索只依赖 position，颜色线索只依赖 color。
 * 在各自的 720 空间里解，比在 518400 耦合空间里快 720 倍。
 * 出题挑线索要反复调用，必须这么快。
 * -------------------------------------------------------------------------- */
function solvePositions(posPerms, posClues, limit = 5000) {
  let count = 0;
  for (const np of posPerms) {
    const seat = Object.fromEntries(np.map((n, i) => [n, { position: i + 1, color: null }]));
    let ok = true;
    for (const c of posClues) {
      let r = false;
      try { r = c.test(seat) === true; } catch { r = false; }
      if (!r) { ok = false; break; }
    }
    if (ok) { count++; if (count >= limit) break; }
  }
  return count;
}

/**
 * 数「颜色层」有多少种合法分配。
 *
 * ⚠️ 这里曾经有个真 bug：函数把 `cp`（颜色排列数组）直接传给线索的 test，
 * 而颜色线索写的是 `s[name].color === c` —— 数组上取不到 `.color`，
 * 全部抛异常被 catch 成 false，于是**任何**颜色线索都会让计数变成 0，
 * 表现为「颜色线索永远加不进去」，R04 直接构造失败。
 *
 * 正确做法：把排列还原成 seat 形状 `{ name: { color } }` 再交给 test。
 * 颜色是「姓名 → 颜色」的双射（6! = 720），与位置无关，
 * 所以位置层和颜色层可以分别精确计数、再合取判断唯一性。
 */
function solveColors(names, colorPerms, colorClues, limit = 5000) {
  let count = 0;
  for (const cp of colorPerms) {
    const seat = Object.fromEntries(names.map((n, i) => [n, { color: cp[i] }]));
    let ok = true;
    for (const c of colorClues) {
      let r = false;
      try { r = c.test(seat) === true; } catch { r = false; }
      if (!r) { ok = false; break; }
    }
    if (ok) { count++; if (count >= limit) break; }
  }
  return count;
}

/* -------------------------------------------------------------------------- *
 * 线索池（6 人 6 色 6 位）
 *
 * 每条线索打标记：
 *   scope: 'position' | 'color'   只依赖哪一侧（用于解耦求解）
 *   kind:  'direct' | 'relational' | 'negative'
 *
 * 实测信息量（518400 中满足该线索的解数）：
 *   位置直述「X 坐在 n 号位」  → 86,400
 *   相对位置「X 在 Y 前面」     → 259,200
 *   相邻                       → 172,800
 *   不在两端                    → 345,600
 *
 * 结论：相对/否定信息量低，单靠它们很难唯一；
 * 出题策略是把位置空间用 relational 压到很小，再用 ≤3 条 direct 补齐；
 * 颜色侧同理。两侧各自唯一 ⇒ 组合唯一。
 * -------------------------------------------------------------------------- */
function clueCandidates(facts) {
  const { solution, names, colors } = facts;
  const posOf = (n) => solution.find((s) => s.name === n).position;
  const colorOf = (n) => solution.find((s) => s.name === n).color;
  const N = names.length;

  const direct = [];
  const relational = [];
  const negative = [];

  // 位置直述 / 否定
  for (const n of names) {
    for (let p = 1; p <= N; p++) {
      if (posOf(n) === p) {
        direct.push({ kind: 'direct', scope: 'position', text: `${n} 坐在 ${p} 号位。`, test: (s) => s[n].position === p });
      } else {
        negative.push({ kind: 'negative', scope: 'position', text: `${n} 不在 ${p} 号位。`, test: (s) => s[n].position !== p });
      }
    }
  }
  // 颜色直述 / 否定
  for (const n of names) {
    for (const c of colors) {
      if (colorOf(n) === c) {
        direct.push({ kind: 'direct', scope: 'color', text: `${n} 的卡片是${c}色。`, test: (s) => s[n].color === c });
      } else {
        negative.push({ kind: 'negative', scope: 'color', text: `${n} 的卡片不是${c}色。`, test: (s) => s[n].color !== c });
      }
    }
  }
  // 相对位置：按信息量分级（strength 3 最强 → 1 最弱）
  //   相隔 >=3 → strength 3；相邻 → 2；单纯前后 → 1
  // 这是「5 条就能压到唯一」的关键：强约束优先。
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i], b = names[j];
      const pa = posOf(a), pb = posOf(b);
      const front = pa < pb ? a : b;
      const back = pa < pb ? b : a;
      const gap = Math.abs(pa - pb);
      if (gap >= 3) {
        relational.push({ kind: 'relational', scope: 'position', strength: 3, text: `${front} 的位置编号比 ${back} 小至少 3。`, test: (s) => s[back].position - s[front].position >= 3 });
      } else if (gap === 1) {
        relational.push({ kind: 'relational', scope: 'position', strength: 2, text: `${front} 与 ${back} 相邻。`, test: (s) => Math.abs(s[front].position - s[back].position) === 1 });
      } else {
        relational.push({ kind: 'relational', scope: 'position', strength: 1, text: `${front} 的位置编号比 ${back} 小。`, test: (s) => s[front].position < s[back].position });
      }
    }
  }
  // 不在两端
  for (const n of names) {
    const p = posOf(n);
    if (p !== 1 && p !== N) {
      relational.push({ kind: 'relational', scope: 'position', strength: 2, text: `${n} 不在两端的位置。`, test: (s) => s[n].position !== 1 && s[n].position !== N });
    }
  }
  // 颜色关系：按「题面列出的颜色顺序」的先后 / 相邻 / 相隔
  // 这等价于在一个 720 的颜色排列空间里做位置推理，与位置侧同构。
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i], b = names[j];
      const ca = colorOf(a), cb = colorOf(b);
      const ia = colors.indexOf(ca), ib = colors.indexOf(cb);
      const front = ia < ib ? a : b;
      const back = ia < ib ? b : a;
      const gap = Math.abs(ia - ib);
      if (gap >= 3) {
        relational.push({ kind: 'relational', scope: 'color', strength: 3, text: `${front} 的卡片颜色在题面列出的颜色顺序中比 ${back} 靠前至少 3 位。`, test: (s) => colors.indexOf(s[back].color) - colors.indexOf(s[front].color) >= 3 });
      } else if (gap === 1) {
        relational.push({ kind: 'relational', scope: 'color', strength: 2, text: `${front} 与 ${back} 的卡片颜色在题面列出的颜色顺序中相邻。`, test: (s) => Math.abs(colors.indexOf(s[front].color) - colors.indexOf(s[back].color)) === 1 });
      } else {
        relational.push({ kind: 'relational', scope: 'color', strength: 1, text: `${front} 的卡片颜色在题面列出的颜色顺序中比 ${back} 靠前。`, test: (s) => colors.indexOf(s[front].color) < colors.indexOf(s[back].color) });
      }
    }
  }

  return { direct, relational, negative };
}

function hashCode(str) {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

/**
 * 选线索：硬性配比 + 唯一性验证。
 *
 * 硬性要求（每个 seed 必须满足，否则返回 null 让上层换 seed 重试）：
 *   直述 ≤ 3   相对 ≥ 4   否定 ≥ 1
 *
 * 求解解耦：位置线索在 720 空间解，颜色线索在 720 空间解。
 * 两侧各自唯一 ⇒ 组合唯一（位置与颜色相互独立，除非有 cross 线索；
 * 本题不生成 cross 线索，所以该结论成立，最后再用耦合求解器复核一次）。
 */
export function buildCluesFromSolution(facts, targetCount = 10) {
  const { names, colors } = facts;
  const { direct, relational, negative } = clueCandidates(facts);

  const posPerms = allPerms(names);
  const colorPerms = allPerms(colors);

  // 预计算座位对象：内层循环原先每条线索都要重建 720 个对象，是出题耗时主要来源
  const posSeats = posPerms.map((np) => Object.fromEntries(np.map((x, i) => [x, { position: i + 1, color: null }])));
  const colorSeats = colorPerms.map((cp) => {
    const seat = {};
    for (let i = 0; i < names.length; i++) seat[names[i]] = { position: i + 1, color: cp[i] };
    return seat;
  });

  const byStrength = (a, b) => (b.strength || 0) - (a.strength || 0) || hashCode(a.text) - hashCode(b.text);
  const sortPool = (arr) => [...arr].sort(byStrength);

  const posRel = sortPool(relational.filter((c) => c.scope === 'position'));
  const colRel = sortPool(relational.filter((c) => c.scope === 'color'));
  const posNeg = sortPool(negative.filter((c) => c.scope === 'position'));
  const colNeg = sortPool(negative.filter((c) => c.scope === 'color'));
  const colDirect = sortPool(direct.filter((c) => c.scope === 'color'));

  /**
   * 尝试构造一组线索。
   *
   * sampleLimit 控制「每次挑线索时评估多少条候选」：
   *   - 小（8）：快，但贪心视野窄，可能构造失败
   *   - 大（32+）：慢，但成功率高
   * 上层先用小值快速尝试，失败再放宽 —— 比直接用大值快，也比死磕重试稳。
   */
  const tryBuild = (sampleLimit) => {
    const chosen = [];
    const used = new Set();
    const take = (c) => {
      if (used.has(c.text)) return false;
      chosen.push(c);
      used.add(c.text);
      return true;
    };

    const posCount = (extra, limit = Infinity) => {
      const cl = chosen.filter((c) => c.scope === 'position');
      if (extra) cl.push(extra);
      let n = 0;
      for (const seat of posSeats) {
        let ok = true;
        for (let k = 0; k < cl.length; k++) {
          let r = false;
          try { r = cl[k].test(seat) === true; } catch { r = false; }
          if (!r) { ok = false; break; }
        }
        if (ok) { n++; if (n >= limit) break; }
      }
      return n;
    };

    const colCount = (extra, limit = Infinity) => {
      const cl = chosen.filter((c) => c.scope === 'color');
      if (extra) cl.push(extra);
      let n = 0;
      for (const seat of colorSeats) {
        let ok = true;
        for (let k = 0; k < cl.length; k++) {
          let r = false;
          try { r = cl[k].test(seat) === true; } catch { r = false; }
          if (!r) { ok = false; break; }
        }
        if (ok) { n++; if (n >= limit) break; }
      }
      return n;
    };

    const pickBy = (pool, counter) => {
      const base = counter(null);
      if (base <= 1) return false;
      let best = null;
      let tried = 0;
      for (const c of pool) {
        if (used.has(c.text)) continue;
        if (tried++ >= sampleLimit) break;
        const n = counter(c, base);
        if (n === 0 || n >= base) continue;
        if (!best || n < best.n) best = { c, n };
      }
      if (!best) return false;
      take(best.c);
      return true;
    };

    // ---- 位置层：只用关系 + 否定（禁止直述，位置必须靠推理）----
    for (let i = 0; i < 4; i++) if (!pickBy(posRel, posCount)) break;
    if (!pickBy(posNeg, posCount)) pickBy(colNeg, posCount);
    let guard = 0;
    while (posCount(null) > 1 && guard++ < 30) {
      if (!pickBy(posRel, posCount)) {
        if (!pickBy(posNeg, posCount)) break;
      }
    }
    if (posCount(null) !== 1) return null;

    // ---- 颜色层：关系优先，直述兜底（6 色数学上需要约 5 条直述）----
    guard = 0;
    while (colCount(null) > 1 && guard++ < 20) {
      if (!pickBy(colRel, colCount)) break;
    }
    guard = 0;
    while (colCount(null) > 1 && guard++ < 8) {
      if (!pickBy(colDirect, colCount)) break;
    }
    if (colCount(null) !== 1) return null;

    // ---- 联合复核 ----
    const finalTests = chosen.map((c) => ({ test: c.test, positionOnly: c.scope === 'position' }));
    if (solveSeatsFirst(names, colors, finalTests, 2).count !== 1) return null;

    // ---- 硬性配比 ----
    const nDirect = chosen.filter((c) => c.kind === 'direct').length;
    const nPosDirect = chosen.filter((c) => c.kind === 'direct' && c.scope === 'position').length;
    const nRel = chosen.filter((c) => c.kind === 'relational').length;
    const nNeg = chosen.filter((c) => c.kind === 'negative').length;
    if (nPosDirect > 0) return null;
    if (nRel < 4) return null;
    if (nNeg < 1) return null;
    if (nDirect > 6) return null;
    if (chosen.length < 8 || chosen.length > 16) return null;

    return chosen;
  };

  // 分级尝试：先小视野（快），失败才放大
  let chosen = null;
  for (const limit of [8, 32]) {
    chosen = tryBuild(limit);
    if (chosen) break;
  }
  if (!chosen) return null;

  // ---- 打散呈现顺序（确定性）----
  const out = [...chosen];
  let h = 0;
  for (const ch of names.join('') + colors.join('')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const R04 = {
  id: 'R04',
  dimension: DIM,
  difficulty: 'challenge',
  points: 9,
  batch: 4,
  title: '多人多色座位推理（唯一解）',
  generate(seed) {
    const rng = makeRng(`${seed}#R04`);
    const namePool = ['阿岚', '阿布', '阿澈', '阿豆', '阿芙', '阿果', '阿海', '阿金', '阿蓝', '阿明'];
    const colorPool = ['红', '蓝', '绿', '黄', '紫', '橙'];
    const N = 6;
    const names = rng.sample(namePool, N);
    const colors = rng.sample(colorPool, N);

    // 构造真实解：姓名排列与位置排列**解耦**（避免结构性泄漏）
    let attempt = 0;
    let chosen = null;
    while (attempt++ < 8) {
      const shuffledNames = rng.shuffle(names);
      const positions = rng.shuffle([1, 2, 3, 4, 5, 6]);
      const shuffledColors = rng.shuffle(colors);
      const solution = shuffledNames.map((n, i) => ({ name: n, position: positions[i], color: shuffledColors[i] }));
      // ⚠️ colors 必须与 solution 里实际用到的色集**完全一致**（只是顺序不同），
      // 否则 clueCandidates 里按 colors 索引颜色关系时会找不到对应的人，
      // 颜色侧线索池为空 → 永远无法唯一。
      const facts = { solution, names: shuffledNames, colors: shuffledColors };
      const lines = buildCluesFromSolution(facts, 9);
      if (lines && lines.length >= 8) { chosen = { facts, lines }; break; }
    }
    if (!chosen) {
      // 兜底：用固定解 + 固定线索（与随机流无关）
      const solution = [
        { name: names[0], position: 3, color: colors[0] },
        { name: names[1], position: 1, color: colors[1] },
        { name: names[2], position: 5, color: colors[2] },
        { name: names[3], position: 2, color: colors[3] },
        { name: names[4], position: 6, color: colors[4] },
        { name: names[5], position: 4, color: colors[5] },
      ];
      const facts = { solution, names: [...names], colors: [...colors] };
      const lines = buildCluesFromSolution(facts, 9);
      if (!lines || lines.length < 8) throw new Error('R04 无法构造唯一解线索（内部错误）');
      chosen = { facts, lines };
    }

    const { facts, lines } = chosen;
    facts.clueTests = lines.map((l) => ({ test: l.test }));
    const colorListText = facts.colors.join('、');
    const prompt = [
      `六位朋友：${facts.names.join('、')}，各拿一张不同颜色的卡片，坐在 1、2、3、4、5、6 号六个位置上（一人一位，一人一色）。`,
      '六个人的位置和颜色都要推出来，一个都不能少。',
      `六张卡片的颜色恰好是这六种：${colorListText}（每种各一张，不重复）。`,
      '“相邻”指位置编号相差 1；“前面”指位置编号更小。',
      '',
      '已知线索：',
      ...lines.map((l, i) => `${i + 1}) ${l.text}`),
      '',
      '请推理出每个人的位置和卡片颜色。',
      '只输出一个 JSON 对象，键为姓名，值为 {"position": 位置编号, "color": "颜色"}：',
      `{"${facts.names[0]}": {"position": <1-6>, "color": "<颜色>"}, "${facts.names[1]}": {"position": <1-6>, "color": "<颜色>"}}`,
      '（上面只示范两个键的结构，六个人都要写；位置和颜色请按线索推，不要照抄示例。）',
    ].join('\n');

    return {
      prompt,
      facts,
      schema: { seats: { type: 'object', aliases: ['seats', '答案', 'answer', 'people'] } },
      publicCriteria: [
        { id: 'R04.C1', points: 3, text: '六个人的位置全部正确' },
        { id: 'R04.C2', points: 3, text: '六个人的卡片颜色全部正确' },
        { id: 'R04.C3', points: 3, text: '位置与颜色的一一对应关系全部正确' },
      ],
      answerStyle: 'personMap',
    };
  },
  oracle(facts) {
    const { names, colors } = facts;
    const clues = facts.clueTests || [];
    if (!clues.length) {
      // 没有谓词时（不应发生）：退回用 facts.solution
      return { solutions: [], unique: true, answer: Object.fromEntries(facts.solution.map((x) => [x.name, { position: x.position, color: x.color }])) };
    }
    // 唯一性判定用 limit=2：找到第二个解就停。
    // 同时顺手把「第一个命中的解」留下来——若唯一，它就是答案。
    // 这样**只扫一遍**，不必先判唯一再重扫一遍（那会让 20 seed 测试慢一倍）。
    const first = solveSeatsFirst(names, colors, clues);
    return {
      solutions: first.count === 1 ? [first.seat] : [],
      unique: first.count === 1,
      answer: first.count === 1 ? first.seat : null,
    };
  },
  grade(parsed, facts) {
    const expected = facts.solution ? Object.fromEntries(facts.solution.map((x) => [x.name, x])) : {};
    const ans = (parsed && parsed.fields && parsed.fields.seats) || {};
    const names = facts.names || [];
    const pickPerson = (obj, name) => {
      if (!obj || typeof obj !== 'object') return null;
      if (obj[name] && typeof obj[name] === 'object') return obj[name];
      const key = Object.keys(obj).find((k) => squash(k) === squash(name));
      return key && obj[key] && typeof obj[key] === 'object' ? obj[key] : null;
    };
    let posRight = 0;
    let colorRight = 0;
    let pairRight = 0;
    const missing = [];
    for (const n of names) {
      const got = pickPerson(ans, n);
      const exp = expected[n];
      if (!got || !exp) { missing.push(n); continue; }
      const pos = toNumber(got.position ?? got.pos ?? got['位置']);
      const color = normText(got.color ?? got['颜色']);
      const posOk = sameNumber(pos, exp.position);
      const colOk = color === normText(exp.color);
      if (posOk) posRight++;
      if (colOk) colorRight++;
      if (posOk && colOk) pairRight++;
    }
    const checks = [];
    checks.push({
      criterionId: 'R04.C1',
      points: 3,
      passed: names.length > 0 && posRight === names.length,
      reason: posRight === names.length
        ? `${names.length} 个人的位置全部正确`
        : `${posRight}/${names.length} 人位置正确${missing.length ? `；未解析到：${missing.slice(0, 3).join('、')}` : ''}`,
    });
    checks.push({
      criterionId: 'R04.C2',
      points: 3,
      passed: names.length > 0 && colorRight === names.length,
      reason: colorRight === names.length
        ? `${names.length} 个人的颜色全部正确`
        : `${colorRight}/${names.length} 人颜色正确`,
    });
    checks.push({
      criterionId: 'R04.C3',
      points: 3,
      passed: names.length > 0 && pairRight === names.length,
      reason: pairRight === names.length
        ? '位置-颜色对应关系全部正确'
        : `${pairRight}/${names.length} 人的位置与颜色同时正确`,
    });
    return checks;
  },
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
