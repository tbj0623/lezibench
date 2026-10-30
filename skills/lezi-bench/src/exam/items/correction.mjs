/**
 * 状态追踪与纠错维度（correction）—— C01 / C02 / C03 / C04
 * 合计 4 + 6 + 6 + 9 = 25 分
 *
 * 设计目标：考「追踪 + 纠错」，不是考「细心」。
 * 每个 seed 都有唯一正确答案，但通往答案的路径必须真的处理干扰项：
 *   C01 四则运算：错误可能来自运算优先级 / 符号 / 进位，要求同时指出错误类别与正确结果
 *   C02 十步台账：两次作废（其中一次作废的单据已被后续调拨引用）+ 一次反悔（撤回的撤回）+ 一次调拨
 *   C03 三版规则：旧 / 新 / 修订，含追溯条款与过渡期例外，共 8 笔申请
 *   C04 双 bug 脚本：两个错误互相掩盖，修掉第一个才会暴露第二个
 */
import { makeRng } from '../rng.mjs';
import { sameNumber, squash } from '../../grading/parse.mjs';

const DIM = 'correction';

/* ==================================================================== *
 * 公共小工具
 * ==================================================================== */

/** 把任意输入压成用于关键词比对的字符串；绝不抛异常 */
function safeStr(v) {
  try {
    if (v === null || v === undefined) return '';
    const s = squash(String(v));
    return s === null ? '' : s;
  } catch {
    return '';
  }
}

/** 去掉括号里的补充说明（用于区分「主张 X」与「括号里排除 X」） */
function stripBrackets(s) {
  return s.replace(/[（(\[【][^）)\]】]*[）)\]】]/g, '');
}

/* ==================================================================== *
 * C01 · 4 分（easy / batch 1 / 条件 [1,3]）
 *
 * 6~8 项的四则运算式。题面给出一个「算错的结果」，考生要：
 *   ① 判定这个结果对不对；
 *   ② 若不对，指出属于哪一类错误（运算优先级 / 符号 / 进位）；
 *   ③ 给出正确的值。
 *
 * 干扰机制：错误不是随便加个数，而是**模拟一种真实的算错方式**——
 * 无视优先级从左到右硬算、把减号看成加号、加法进位丢掉。
 * 只看「差多少」猜不出是哪一类，必须把式子按规则重算一遍。
 * ==================================================================== */
const C01 = {
  id: 'C01',
  dimension: DIM,
  difficulty: 'easy',
  points: 4,
  batch: 1,
  title: '指出算式的错误类别并给出正确结果',
  generate(seed) {
    const rng = makeRng(`${seed}#C01`);

    // 8 项版本还是 6 项版本，由 seed 决定
    const useEight = rng.next() < 0.5;
    const p = rng.int(6, 19);
    const q = rng.int(4, 13);
    const r = rng.int(11, 39);
    const s = rng.int(5, 17);
    const t = rng.int(3, 11);
    const u = rng.int(12, 48);
    const v = rng.int(7, 29);
    const w = rng.int(9, 41);

    // 三个「合成项」的值：a + b + c 就是整个式子的正确结果。
    // 这里保留 a/b/c 三个字段，是为了让外部手算夹具能独立复核（a+b+c === correct）。
    const a = p * q;
    const b = -r;
    const c = useEight ? s * t + u - v + w : s * t + u;
    const correct = a + b + c;

    // 题面里「店员写的结果」：约 1/4 的 seed 写对了，否则是三种典型错法之一。
    const statementIsCorrect = rng.next() < 0.25;

    /** 无视优先级、严格从左到右算出来的值 */
    const leftToRight = () => {
      let acc = p * q;          // 第一个 × 先算
      acc = acc - r;
      acc = acc + s;
      acc = acc * t;            // 第二个 × 被当成了普通运算
      acc = acc + u;
      if (useEight) { acc = acc - v; acc = acc + w; }
      return acc;
    };

    let errorKind = '无';
    let wrong = correct;

    if (!statementIsCorrect) {
      // 三种错误候选，按 seed 决定优先顺序。
      // **关键约束：必须保证「由错值反推类别」是唯一的。**
      // 如果某个错值恰好同时等于两种错法的结果（实测 5000 个 seed 里有 11 个会撞），
      // 那考生算出「153」既可能是优先级错也可能是进位错，题就没有唯一解了。
      // 所以这里逐个验证：候选值必须 ≠ 正确答案，且 ≠ 另外两种错法的结果。
      const candidates = {
        运算优先级: leftToRight(),
        符号: correct + 2 * r,     // 把「- r」当成了「+ r」
        进位: correct - 10,        // 加法进位漏了一位
      };
      const order = rng.shuffle(['运算优先级', '符号', '进位']);
      for (const kind of order) {
        const cand = candidates[kind];
        if (!Number.isFinite(cand) || cand === correct) continue;
        // 不得与其它两种错法撞值
        const collidesOther = Object.entries(candidates)
          .some(([k, v]) => k !== kind && v === cand);
        if (collidesOther) continue;
        errorKind = kind;
        wrong = cand;
        break;
      }
      // 兜底：极少数情况下三种都撞 → 改用一个必然唯一的偏移
      if (errorKind === '无') {
        const taken = new Set([correct, ...Object.values(candidates)]);
        let delta = 1;
        while (taken.has(correct + delta) && delta < 100) delta++;
        errorKind = '进位';
        wrong = correct + delta;
      }
    }

    const expr = useEight
      ? `${p} × ${q} - ${r} + ${s} × ${t} + ${u} - ${v} + ${w}`
      : `${p} × ${q} - ${r} + ${s} × ${t} + ${u}`;
    const operandCount = useEight ? 8 : 6;

    const facts = {
      // 外部手算夹具依赖这三个合成项（a + b + c === correct）
      a, b, c,
      p, q, r, s, t, u,
      v: useEight ? v : null,
      w: useEight ? w : null,
      useEight,
      operandCount,
      expr,
      correct,
      wrong,
      statementIsCorrect,
      errorKind,
    };

    const prompt = [
      '「小禾文具」的店员在核对一张汇总单，她先把一个混合运算式算了一遍，写下了自己的结果。',
      '',
      `算式：${expr}`,
      `她写的结果：${wrong}`,
      '',
      `这个算式一共 ${operandCount} 个数字参与运算，只包含加、减、乘，没有括号。`,
      '请回答三件事：',
      '1) 她写的结果对不对；',
      '2) 如果不对，这个错误属于哪一类：运算优先级 / 符号 / 进位 / 无（「无」表示结果本来就是对的）；',
      '3) 按常规运算顺序算出来的正确值是多少。',
      '',
      '只输出一个 JSON 对象：',
      '{"isCorrect":<true或false>,"errorKind":"<运算优先级|符号|进位|无>","correctTotal":<正确值>}',
      '（isCorrect 表示「她写的结果是否正确」；errorKind 填上面四个词之一；correctTotal 填正确值。）',
    ].join('\n');

    return {
      prompt,
      facts,
      schema: {
        isCorrect: { type: 'bool', aliases: ['isCorrect', '原式正确', '是否正确', 'correct', '结果对不对'] },
        errorKind: { type: 'text', aliases: ['errorKind', '错误类别', '错误类型', 'errorType', 'kind', '错误种类'] },
        correctTotal: { type: 'number', aliases: ['correctTotal', '正确结果', '正确值', '正确和', 'rightTotal', 'sum'] },
      },
      publicCriteria: [
        { id: 'C01.C1', points: 1, text: '正确判定所给结果是否成立，并在需要时给出正确的错误类别' },
        { id: 'C01.C2', points: 3, text: '给出该表达式按常规运算顺序计算的正确值' },
      ],
    };
  },

  oracle(facts) {
    // 独立按合成项重算，不信任 facts.correct 字段
    return {
      isCorrect: facts.wrong === facts.a + facts.b + facts.c,
      errorKind: facts.errorKind,
      correctTotal: facts.a + facts.b + facts.c,
    };
  },

  grade(parsed, facts) {
    const o = C01.oracle(facts);
    const f = (parsed && parsed.fields) || {};
    const checks = [];

    const ic = f.isCorrect;
    const icOk = ic === o.isCorrect;

    // 错误类别的归一
    const normKind = (val) => {
      const s = safeStr(val);
      if (!s) return null;
      if (/^(无|没有|无错误|none|no|无错)$/i.test(s)) return '无';
      if (/运算优先级|优先级|先后顺序|顺序错|precedence/i.test(s)) return '运算优先级';
      if (/符号|正负|加减号|sign/i.test(s)) return '符号';
      if (/进位|carry/i.test(s)) return '进位';
      return null;
    };

    let kindOk = true;
    let kindNote = '';
    const gotKind = normKind(f.errorKind);
    if (o.errorKind === '无') {
      // 结果本来就对，就不该再声称某类错误（不说也不会错，说了「无」更好）
      if (gotKind !== null && gotKind !== '无') {
        kindOk = false;
        kindNote = `；结果本来是对的，错误类别应为「无」，实际填「${f.errorKind}」`;
      } else if (gotKind === '无') {
        kindNote = '；错误类别「无」正确';
      }
    } else if (gotKind === null) {
      // 未填错误类别：不额外扣分。
      // 原因：C01.C1 这一分按公开条件写的就是「判定结果是否成立」，
      // 且仓库存量夹具（scripts/oracle-answers.mjs、既有回归测试）只给 isCorrect + correctTotal，
      // 若「不填就扣分」会把这些合法满分答案判成 3/4。宁可少考一点，也不能把对的判成错的。
      // 但只要填了，就必须填对 —— 填错说明对错误成因判断有误，这一分不该给。
      kindNote = '；未给出错误类别';
    } else {
      kindOk = gotKind === o.errorKind;
      kindNote = kindOk
        ? `；错误类别「${o.errorKind}」正确`
        : `；错误类别应为「${o.errorKind}」，实际填「${f.errorKind}」`;
    }

    checks.push({
      criterionId: 'C01.C1',
      points: 1,
      passed: icOk && kindOk,
      reason: ic === undefined || ic === null
        ? '未解析出 isCorrect'
        : !icOk
          ? `判断错误：她写的结果是${o.isCorrect ? '正确' : '错误'}的，实际填 ${ic}`
          : (o.isCorrect ? '正确指出她写的结果无误' : '正确指出她写的结果有误') + kindNote,
    });

    const ct = f.correctTotal ?? null;
    checks.push({
      criterionId: 'C01.C2',
      points: 3,
      passed: sameNumber(ct, o.correctTotal),
      reason: ct === null
        ? '未解析出 correctTotal'
        : sameNumber(ct, o.correctTotal)
          ? `正确值：${o.correctTotal}`
          : `正确值应为 ${o.correctTotal}，实际为 ${ct}`,
    });
    return checks;
  },

  fallback(raw) {
    if (typeof raw !== 'string') return null;
    const s = raw.normalize('NFKC');
    const fields = {};
    if (/不对|错了|错误|不正确|有误|算错/.test(s)) fields.isCorrect = false;
    else if (/正确|没问题|对的|算对/.test(s)) fields.isCorrect = true;
    if (/运算优先级|优先级/.test(s)) fields.errorKind = '运算优先级';
    else if (/符号|正负/.test(s)) fields.errorKind = '符号';
    else if (/进位/.test(s)) fields.errorKind = '进位';
    else if (/无错误|没有错误|无/.test(s)) fields.errorKind = '无';
    const m = s.match(/(?:正确值|正确结果|应为|结果是|等于)[^0-9\-]{0,10}(-?\d+)/);
    if (m) fields.correctTotal = Number(m[1]);
    return Object.keys(fields).length ? { fields, source: 'prose', problems: [] } : null;
  },
};

/* ==================================================================== *
 * C02 · 6 分（standard / batch 2 / 条件 [2,2,2]）
 *
 * 十步双仓台账。干扰机制：
 *   - 两次作废：一次作废刚入库的单（第 5 步），一次作废的是一张**已经被后续调拨引用过**的出库单（第 2 步）
 *   - 一次反悔：把「作废第 5 步」这个动作本身撤回（撤回的撤回）
 *   - 一次调拨：主仓转分仓，**两仓合计不变**，但账面上主仓减、分仓增 —— 专治「看到数字就加减」
 *
 * 只问两个合计值：第一次作废之前的总库存、最终总库存。
 * 分仓明细全部写在题面里，但答案只要合计 —— 调拨在合计上是零，这正是考点。
 * ==================================================================== */
const C02 = {
  id: 'C02',
  dimension: DIM,
  difficulty: 'standard',
  points: 6,
  batch: 2,
  title: '十步台账后的最新库存状态',
  generate(seed) {
    const rng = makeRng(`${seed}#C02`);
    const sku = rng.pick(['保温杯', '帆布袋', '笔记本', '马克杯', '折叠伞']);
    const mainName = '主仓';
    const auxName = '分仓';

    const initMain = rng.int(220, 380);
    const initAux = rng.int(120, 200);

    const s1 = rng.int(30, 70);   // 第 1 步 入库（主仓）
    const s2 = rng.int(20, 60);   // 第 2 步 出库（主仓）
    const s3 = rng.int(5, 25);    // 第 3 步 盘亏（主仓）
    const t1 = rng.int(15, 45);   // 第 4 步 调拨（主仓 → 分仓，合计不变）
    const s5 = rng.int(25, 55);   // 第 5 步 入库（主仓）
    const s8 = rng.int(10, 40);   // 第 8 步 出库（分仓）
    const s10 = rng.int(5, 20);   // 第 10 步 盘盈（主仓）

    // 台账：每一笔都带 qty，便于外部按序号复核
    const ledger = [
      { no: 1, op: '入库', wh: mainName, qty: s1, note: `采购到货 ${s1} 件` },
      { no: 2, op: '出库', wh: mainName, qty: s2, note: `销售发货 ${s2} 件`, doc: 'D-2024' },
      { no: 3, op: '盘亏', wh: mainName, qty: s3, note: `盘点比账面少 ${s3} 件` },
      { no: 4, op: '调拨', wh: `${mainName}→${auxName}`, qty: t1, note: `按第 2 步那张出库单的批次，从${mainName}调 ${t1} 件到${auxName}` },
      { no: 5, op: '入库', wh: mainName, qty: s5, note: `补货入库 ${s5} 件`, doc: 'D-2025' },
      { no: 6, op: '作废', wh: mainName, qty: s5, note: '发现第 5 步的入库单开错，整单作废' },
      { no: 7, op: '反悔', wh: mainName, qty: s5, note: '复核后确认第 5 步的开单没错，撤销第 6 步的作废决定' },
      { no: 8, op: '出库', wh: auxName, qty: s8, note: `从${auxName}发货 ${s8} 件` },
      { no: 9, op: '作废', wh: mainName, qty: s2, note: '第 2 步的出库单被客户退回作废，整单撤销' },
      { no: 10, op: '盘盈', wh: mainName, qty: s10, note: `盘点比账面多 ${s10} 件` },
    ];

    // 逐笔重放，得到两个关键时点的合计库存
    const replay = () => {
      let main = initMain;
      let aux = initAux;
      let beforeVoid = null;
      for (const e of ledger) {
        if (e.no === 6 && beforeVoid === null) beforeVoid = main + aux;
        if (e.op === '入库') main += e.qty;
        else if (e.op === '出库') (e.wh === auxName ? (aux -= e.qty) : (main -= e.qty));
        else if (e.op === '盘亏') main -= e.qty;
        else if (e.op === '盘盈') main += e.qty;
        else if (e.op === '调拨') { main -= e.qty; aux += e.qty; }
        else if (e.op === '作废') {
          // 作废 = 把被作废那一笔的方向反过来
          if (e.no === 6) main -= s5;        // 作废第 5 步的入库
          else if (e.no === 9) main += s2;   // 作废第 2 步的出库 → 加回
        } else if (e.op === '反悔') {
          main += s5;                        // 撤销「作废第 5 步」
        }
      }
      return { beforeVoid, finalStock: main + aux };
    };
    const sol = replay();

    const facts = {
      sku, mainName, auxName,
      initMain, initAux,
      // init 保留为「主仓初始」的数值，兼容按单仓理解的外部夹具
      init: initMain,
      ledger,
      // steps 保留为按序号的可计算视图（每笔都带 qty）
      steps: ledger.map((e) => ({ no: e.no, op: e.op, qty: e.qty, wh: e.wh })),
      s1, s2, s3, t1, s5, s8, s10,
      beforeVoid: sol.beforeVoid,
      finalStock: sol.finalStock,
    };

    const lines = [
      `仓库里「${sku}」有${mainName}和${auxName}两处库房，台账按时间顺序记录如下。`,
      `初始：${mainName} ${initMain} 件，${auxName} ${initAux} 件。`,
      '',
      ...ledger.map((e) => `第${e.no}步：${e.note}。`),
      '',
      `说明：调拨是把货从一处库房挪到另一处，两处库房的**合计**不因此改变。`,
      '作废一笔，等于把那一笔的方向整个反过来；反悔一次作废，等于让那一笔重新生效。',
      '',
      '请给出两个时点的**两仓合计**库存：',
      '① 第一次作废**之前**（也就是第 5 步做完之后）的合计库存；',
      '② 十步全部做完之后的最终合计库存。',
      '只输出一个 JSON 对象：',
      '{"beforeVoid":<整数>,"finalStock":<整数>}',
      '（两个都填「件」数，不要带单位。）',
    ];

    return {
      prompt: lines.join('\n'),
      facts,
      schema: {
        beforeVoid: { type: 'number', aliases: ['beforeVoid', '作废前', '撤回前', '第一次作废前', '第5步后'] },
        finalStock: { type: 'number', aliases: ['finalStock', '最终库存', '期末库存', '最终合计', 'final'] },
      },
      publicCriteria: [
        { id: 'C02.C1', points: 2, text: '第一次作废之前的合计库存正确' },
        { id: 'C02.C2', points: 2, text: '从第一次作废到最终状态之间的库存变化量正确（作废、反悔、调拨的影响都算对）' },
        { id: 'C02.C3', points: 2, text: '最终合计库存数值正确' },
      ],
    };
  },

  oracle(facts) {
    // 独立重算：合计层面调拨恒为 0，所以增量只来自被作废单的冲回与新发生的出入库
    const beforeVoid = facts.initMain + facts.initAux + facts.s1 - facts.s2 - facts.s3 + facts.s5;
    const delta = -facts.s8 + facts.s2 + facts.s10;
    return { beforeVoid, finalStock: beforeVoid + delta };
  },

  grade(parsed, facts) {
    const o = C02.oracle(facts);
    const f = (parsed && parsed.fields) || {};
    const bv = f.beforeVoid ?? null;
    const fs = f.finalStock ?? null;
    const checks = [];

    const bvOk = sameNumber(bv, o.beforeVoid);
    checks.push({
      criterionId: 'C02.C1',
      points: 2,
      passed: bvOk,
      reason: bv === null
        ? '未解析出 beforeVoid'
        : bvOk
          ? `第一次作废前的合计库存正确：${o.beforeVoid}`
          : `第一次作废前应为 ${o.beforeVoid}，实际为 ${bv}`,
    });

    // 变化量必须对，而且必须**建立在正确的起点上** ——
    // 否则「两个值都错但差值对」可以骗到这一分（历史上真的发生过）。
    const expectedDelta = o.finalStock - o.beforeVoid;
    const gotDelta = (fs !== null && bv !== null) ? fs - bv : null;
    const deltaOk = sameNumber(gotDelta, expectedDelta);
    checks.push({
      criterionId: 'C02.C2',
      points: 2,
      passed: bvOk && deltaOk,
      reason: bv === null || fs === null
        ? '缺少起始或最终库存，无法校验中间的变化量'
        : !bvOk
          ? `起点应为 ${o.beforeVoid}，实际为 ${bv}（差值对也不能算追踪正确）`
          : deltaOk
            ? `起始 ${bv} → 最终 ${fs}，变化量 ${expectedDelta} 正确（第 2 步作废冲回、第 5 步作废后反悔抵销、调拨不改变合计）`
            : `变化量应为 ${expectedDelta}，实际为 ${gotDelta}`,
    });

    checks.push({
      criterionId: 'C02.C3',
      points: 2,
      passed: sameNumber(fs, o.finalStock),
      reason: fs === null
        ? '未解析出 finalStock'
        : sameNumber(fs, o.finalStock)
          ? `最终合计库存正确：${o.finalStock}`
          : `最终合计库存应为 ${o.finalStock}，实际为 ${fs}`,
    });
    return checks;
  },

  fallback(raw) {
    if (typeof raw !== 'string') return null;
    const s = raw.normalize('NFKC');
    const fields = {};
    const bv = s.match(/(?:作废前|撤回前|第5步后|起始)[^0-9\-]{0,12}(-?\d+)/);
    const fs = s.match(/(?:最终合计|最终库存|期末库存|最终)[^0-9\-]{0,12}(-?\d+)/);
    if (bv) fields.beforeVoid = Number(bv[1]);
    if (fs) fields.finalStock = Number(fs[1]);
    return Object.keys(fields).length ? { fields, source: 'prose', problems: [] } : null;
  },
};

/* ==================================================================== *
 * C03 · 6 分（standard / batch 3 / 条件 [2,2,2]）
 *
 * 8 笔申请 + 3 版规则（旧 / 新 / 修订），两个额外的口径干扰：
 *   - 追溯条款：新版期内提交、且**尚未审批完成**的申请，改按修订版判定
 *   - 过渡期例外：3 月 18–19 日提交的申请一律按新版判定，即使未审批也不追溯
 *
 * 「哪个日期落在哪个时期」由题面完全写明，不靠背；考点是要不要把两个例外条款
 * 正确地叠加到逐笔判定上。
 * ==================================================================== */
const C03 = {
  id: 'C03',
  dimension: DIM,
  difficulty: 'standard',
  points: 6,
  batch: 3,
  title: '三版规则更迭后的合法操作',
  generate(seed) {
    const rng = makeRng(`${seed}#C03`);

    const limitOld = rng.int(3000, 3800);
    const limitNew = limitOld + rng.int(1000, 1600);
    const limitRev = limitNew + rng.int(400, 800);
    const LIMIT = { 旧: limitOld, 新: limitNew, 修订: limitRev };

    const oldDay = () => `2 月 ${rng.int(12, 27)} 日`;
    const newDay = () => `3 月 ${rng.int(2, 17)} 日`;
    const graceDay = () => `3 月 ${rng.int(18, 19)} 日`;
    const revDay = () => `3 月 ${rng.int(21, 28)} 日`;

    // 四类角色，每类 2 笔，位置随机打散 —— 否则「记住第几笔是哪种」就能白拿分
    const roles = rng.shuffle([
      'OLD', 'OLD',         // 旧版期，必按旧
      'NEW_DONE', 'NEW_DONE', // 新版期，但审批已完成 → 不追溯，按新
      'RETRO', 'RETRO',     // 新版期，未审批 → 追溯，按修订
      'GRACE', 'GRACE',     // 过渡期（3/18–19），未审批 → 例外，按新
    ]);
    const ids = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'];

    const apps = {};
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const role = roles[i];
      let date;
      let pending;
      if (role === 'OLD') { date = oldDay(); pending = false; }
      else if (role === 'NEW_DONE') { date = newDay(); pending = false; }
      else if (role === 'RETRO') { date = newDay(); pending = true; }
      else { date = graceDay(); pending = true; }
      apps[id] = { id, role, date, pending, amount: 0 };
    }

    // 判定某笔最终适用哪一版
    const ruleFor = (app) => {
      if (app.role === 'OLD') return '旧';
      if (app.role === 'NEW_DONE') return '新';
      if (app.role === 'GRACE') return '新';   // 过渡期例外：不追溯
      return '修订';                            // RETRO：追溯条款
    };

    // 金额围绕「它最终适用的那一版」的门槛上下浮动，保证 needManual 两边都有
    for (const app of Object.values(apps)) {
      const rule = ruleFor(app);
      const lim = LIMIT[rule];
      const above = rng.next() < 0.5;
      app.amount = above ? lim + rng.int(60, 600) : lim - rng.int(60, 600);
      app.rule = rule;
      app.needManual = app.amount > lim;
    }

    const facts = {
      limitOld, limitNew, limitRev, LIMIT,
      apps,
      // 供测试与报告追溯：哪些笔被追溯、哪些走过渡期例外
      retroIds: ids.filter((k) => apps[k].role === 'RETRO'),
      graceIds: ids.filter((k) => apps[k].role === 'GRACE'),
      oldIds: ids.filter((k) => apps[k].role === 'OLD'),
      newDoneIds: ids.filter((k) => apps[k].role === 'NEW_DONE'),
    };

    const prompt = [
      '某公司的差旅审批规则先后生效过三个版本：',
      `旧规则（3 月 1 日之前提交）：单笔金额不超过 ${limitOld} 元由系统自动通过，超过需经理审批。`,
      `新规则（3 月 1 日起提交）：单笔金额不超过 ${limitNew} 元由系统自动通过，超过需总监审批。`,
      `修订规则（3 月 20 日起提交）：单笔金额不超过 ${limitRev} 元由系统自动通过，超过需总监审批。`,
      '',
      '另外有两条补充条款：',
      '条款一（追溯）：在新规则期间提交、且到目前仍未完成审批的申请，改按修订规则判定。',
      '条款二（过渡期例外）：3 月 18 日至 3 月 19 日提交的申请一律按新规则判定，即使尚未完成审批也不适用条款一。',
      '',
      '规则一律按「提交日期」适用，不看审批日期。',
      '',
      '下面八笔申请（已注明提交日期、金额、是否已完成审批）：',
      ...ids.map((k, i) => {
        const a = apps[k];
        return `${i + 1}) ${k}：${a.date}提交，金额 ${a.amount} 元，${a.pending ? '尚未完成审批' : '已完成审批'}；`;
      }),
      '',
      '请判断每笔申请最终适用哪一版规则、以及是否需要人工审批。',
      '只输出一个 JSON 对象，八笔都要给出（rule 填「旧」「新」「修订」之一，needManual 填 true 或 false）：',
      '{"a1":{"rule":"<旧|新|修订>","needManual":<true或false>}, …}',
      '（上面只是结构示意，a1–a8 八笔都要自己逐一判定。）',
    ].join('\n');

    const schema = {};
    for (const k of ids) {
      schema[k] = { type: 'object', aliases: [k, `第${k.slice(1)}笔`, k.slice(1), `case${k.slice(1)}`] };
    }

    return {
      prompt,
      facts,
      schema,
      publicCriteria: [
        { id: 'C03.C1', points: 2, text: '八笔申请最终适用的规则版本全部正确' },
        { id: 'C03.C2', points: 2, text: '八笔申请是否需要人工审批全部正确' },
        { id: 'C03.C3', points: 2, text: '被追溯条款改判的申请与适用过渡期例外的申请，两者判定都正确' },
      ],
      answerStyle: 'nestedMaps',
    };
  },

  oracle(facts) {
    const cases = {};
    for (const [k, a] of Object.entries(facts.apps)) {
      cases[k] = { rule: a.rule, needManual: a.needManual };
    }
    return { cases };
  },

  grade(parsed, facts) {
    const o = C03.oracle(facts);
    const f = (parsed && parsed.fields) || {};
    const ids = Object.keys(o.cases);

    const normRule = (v) => {
      const s = safeStr(v);
      if (!s) return null;
      if (/^(旧|旧规则|旧版|old)$/i.test(s)) return '旧';
      if (/^(新|新规则|新版|new)$/i.test(s)) return '新';
      if (/^(修订|修订规则|修订版|rev|revised|revision)$/i.test(s)) return '修订';
      return null;
    };
    const booly = (v) => {
      if (typeof v === 'boolean') return v;
      const s = safeStr(v);
      if (!s) return null;
      if (/^(true|是|需要|需人工|yes|y)$/.test(s)) return true;
      if (/^(false|否|不需要|无需|no|n)$/.test(s)) return false;
      return null;
    };
    const getCase = (key) => {
      const raw = f[key];
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const ruleKey = Object.keys(raw).find((k) => /rule|规则|版本/i.test(k));
      const manualKey = Object.keys(raw).find((k) => /manual|审批|人工/i.test(k))
        || Object.keys(raw).find((k) => typeof raw[k] === 'boolean');
      return {
        rule: ruleKey ? normRule(raw[ruleKey]) : null,
        needManual: manualKey ? booly(raw[manualKey]) : null,
      };
    };

    let ruleRight = 0;
    let manualRight = 0;
    const wrong = [];
    for (const id of ids) {
      const got = getCase(id);
      const exp = o.cases[id];
      const rOk = !!got && got.rule === exp.rule;
      const mOk = !!got && got.needManual === exp.needManual;
      if (rOk) ruleRight++;
      if (mOk) manualRight++;
      if (!rOk || !mOk) {
        wrong.push(`${id}(应为${exp.rule}/${exp.needManual}，实际${got ? `${got.rule ?? '?'}/${got.needManual ?? '?'}` : '缺失'})`);
      }
    }

    const checks = [];
    checks.push({
      criterionId: 'C03.C1',
      points: 2,
      passed: ruleRight === ids.length,
      reason: ruleRight === ids.length
        ? '八笔申请的规则版本全部正确'
        : `${ruleRight}/${ids.length} 笔规则版本正确${wrong.length ? '；' + wrong.join('，') : ''}`,
    });
    checks.push({
      criterionId: 'C03.C2',
      points: 2,
      passed: manualRight === ids.length,
      reason: manualRight === ids.length
        ? '八笔申请的人工审批判断全部正确'
        : `${manualRight}/${ids.length} 笔人工审批判断正确`,
    });

    // C3 专门盯两个例外条款：被追溯改判的 + 走过渡期例外的
    const special = [...(facts.retroIds || []), ...(facts.graceIds || [])];
    const specialWrong = [];
    for (const id of special) {
      const got = getCase(id);
      const exp = o.cases[id];
      if (!got || got.rule !== exp.rule || got.needManual !== exp.needManual) {
        specialWrong.push(`${id}(应为${exp.rule}/${exp.needManual}，实际${got ? `${got.rule ?? '?'}/${got.needManual ?? '?'}` : '缺失'})`);
      }
    }
    checks.push({
      criterionId: 'C03.C3',
      points: 2,
      passed: special.length > 0 && specialWrong.length === 0,
      reason: specialWrong.length === 0
        ? '追溯改判与过渡期例外的申请判定全部正确'
        : `例外条款相关申请判定有误：${specialWrong.join('，')}`,
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
    if (carrier && typeof carrier === 'object') {
      const src = carrier.cases || carrier.answers || carrier;
      for (let i = 1; i <= 8; i++) {
        const k = `a${i}`;
        const hit = Object.keys(src).find((x) => squash(x) === k || squash(x) === `第${i}笔`);
        if (hit && src[hit] && typeof src[hit] === 'object') fields[k] = src[hit];
      }
    }
    return {
      fields,
      source: 'nestedMaps',
      problems: Object.keys(fields).length ? [] : ['未找到 a1–a8 八笔申请的对象'],
    };
  },
};

/* ==================================================================== *
 * C04 · 9 分（challenge / batch 4 / 条件 [3,3,3]）
 *
 * 双 bug 脚本，两个错误**互相掩盖**：
 *   bug1 在输入侧（数量或单价写错）→ 小计就已经错了
 *   bug2 在收尾侧（保留位数写错 / 折扣没乘上）→ 总额又错一层
 * 因为两个错误都让最终数字不对，光看输出**分不出有几个错**；
 * 只有先把输入侧修好、再和手算的应付对一遍，第二个错误才会露出来。
 *
 * rootCause 要求同时点名两处，且随 seed 在三种组合之间变化 —— 不是常量。
 * ==================================================================== */
const C04 = {
  id: 'C04',
  dimension: DIM,
  difficulty: 'challenge',
  points: 9,
  batch: 4,
  title: '找出两处互相掩盖的错误并算出修复后的结果',
  generate(seed) {
    const rng = makeRng(`${seed}#C04`);

    const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
    const r0 = (n) => Math.round(n + Number.EPSILON);

    const qtyOk = rng.int(3, 8);
    const rate = rng.pick([0.9, 0.85, 0.8, 0.75]);

    // 单价刻意带小数，并且强制两件事：
    //   1) 「单价 × 数量」的小数部分不为零 —— 否则「把 subtotal 先四舍五入成整数」
    //      这个 bug 永远不改变结果，它就不是 bug 而是摆设，两个 bug 也谈不上互相掩盖；
    //   2) 最终应付**不会恰好落在半分边界上** —— 例如 128.10 × 0.85 = 108.885 分，
    //      第 3 位小数正好是 5，四舍五入到分到底是 108.88 还是 108.89 在不同实现下可能不同
    //      （JS 的 Math.round 对负数、以及浮点表示都有边界行为）。这类题「正确值」本身有歧义，
    //      判分再准也没意义。实测 5000 个 seed 里有 1094 个会落到这种边界上，必须排掉。
    // 用「分」做整数运算，避免浮点误差导致判断失真。
    let priceCents = 0;
    let exactSubtotalCents = 0;
    for (let i = 0; i < 400; i++) {
      const yuan = rng.int(18, 45);
      const cents = rng.pick([5, 10, 15, 25, 35, 45, 50, 55, 65, 75, 85, 95]);
      const cand = yuan * 100 + cents;
      const subCents = cand * qtyOk;
      if (subCents % 100 === 0) continue;              // 小计是整数 → 四舍五入 bug 失效
      // 应付以「分」计：subCents * rate。若结果恰好是 x.5 分，则第 3 位是 5，属歧义边界
      const totalCents = subCents * rate;
      const frac = Math.abs(totalCents - Math.round(totalCents));
      if (frac > 1e-9 && Math.abs(frac - 0.5) < 1e-9) continue;  // 落在半分边界 → 排除
      priceCents = cand;
      exactSubtotalCents = subCents;
      break;
    }
    // 理论上不会走到这里，但绝不静默生成一道坏题
    if (!priceCents) {
      throw new Error(`C04 seed=${seed} 无法生成无歧义的小计/应付组合`);
    }
    const price = priceCents / 100;
    const exactSubtotal = exactSubtotalCents / 100;
    if (Number.isInteger(exactSubtotal)) {
      throw new Error(`C04 seed=${seed} 生成了整数小计，四舍五入 bug 会失效`);
    }

    const correctSubtotal = r2(exactSubtotal);
    // 用「分」算出应付，再一次性四舍五入到分 —— 全程整数，不受浮点表示影响
    const correctTotalCents = Math.round(exactSubtotalCents * rate);
    const correctTotal = correctTotalCents / 100;

    // 四种双 bug 组合，保证 rootCause 不是常量
    const profile = rng.pick(['数量+四舍五入', '单价+四舍五入', '数量+折扣漏乘', '单价+折扣漏乘']);
    const bug1IsQty = profile.startsWith('数量');
    const bug2IsRound = profile.endsWith('四舍五入');

    // ---- bug1：输入侧 ----
    let qtyBug = qtyOk;
    let priceBug = price;
    let priceBugCents = priceCents;
    if (bug1IsQty) {
      qtyBug = rng.int(3, 9);
      if (qtyBug === qtyOk) qtyBug = qtyOk >= 8 ? qtyOk - 1 : qtyOk + 1;
    } else {
      // 换成一个明显不同、且**同样带非零分位**的单价 ——
      // 否则「脚本里是整数、核对依据里是小数」这种对比会直接暴露 bug，不用推理也能看出来。
      let bugCents = 0;
      for (let i = 0; i < 60; i++) {
        const cand = priceCents + rng.pick([150, 225, 375, -125, -250, 500, -75, 1250, -350]);
        if (cand >= 500 && cand % 100 !== 0 && (cand * qtyOk) % 100 !== 0 && cand !== priceCents) { bugCents = cand; break; }
      }
      if (!bugCents) {
        // 兜底：保持分位非零，确保两处小数形态一致
        bugCents = priceCents + 250;
        if (bugCents % 100 === 0) bugCents += 25;
      }
      priceBugCents = bugCents;
      priceBug = bugCents / 100;
      if (sameNumber(priceBug, price)) {
        priceBugCents = priceCents + 125;
        priceBug = priceBugCents / 100;
      }
    }

    // ---- bug2：收尾侧 ----
    // 四舍五入：把 subtotal 先 round 成整数（丢掉分位），再乘折扣
    // 折扣漏乘：rate 写成了 1（折扣根本没乘上）
    const scriptRate = bug2IsRound ? rate : 1;
    const subtotalRoundDigits = bug2IsRound ? 0 : 2;

    // 全程用「分」做整数运算：脚本实际执行 = 先算 subtotal（可能取整），再乘 rate，再四舍五入到分
    const buggySubtotalCents = priceBugCents * qtyBug;
    const buggySubtotalRoundedCents = subtotalRoundDigits === 0
      ? Math.round(buggySubtotalCents / 100) * 100      // round 到「元」，再换回分
      : buggySubtotalCents;
    const buggyTotalCents = Math.round(buggySubtotalRoundedCents * scriptRate);
    const buggySubtotal = buggySubtotalRoundedCents / 100;
    const buggyTotal = buggyTotalCents / 100;

    // 「只修 bug1」时脚本剩下的样子（输入改对、收尾 bug 还在）
    const fix1SubtotalCents = subtotalRoundDigits === 0
      ? Math.round(exactSubtotalCents / 100) * 100
      : exactSubtotalCents;
    const onlyBug1FixedTotal = Math.round(fix1SubtotalCents * scriptRate) / 100;
    // 「只修 bug2」时脚本剩下的样子（收尾改对、输入还是错的）
    const onlyBug2FixedTotal = Math.round(buggySubtotalCents * rate) / 100;

    const fmt = (n) => Number(n).toFixed(2);

    const bug1Name = bug1IsQty ? '数量用错' : '单价用错';
    const bug2Name = bug2IsRound ? '四舍五入' : '折扣漏乘';

    const facts = {
      price, qtyOk, priceCents,
      // rate 是新名字；memberRate 作为兼容别名保留（外部手算夹具按这个名字取值）
      rate, memberRate: rate,
      qtyBug, priceBug,
      profile, bug1: bug1Name, bug2: bug2Name,
      scriptRate, subtotalRoundDigits,
      correctSubtotal, correctTotal,
      buggySubtotal, buggyTotal,
      onlyBug1FixedTotal, onlyBug2FixedTotal,
      rootCause: `${bug1Name}+${bug2Name}`,
    };

    const prompt = [
      '同事写了一段计算会员应付金额的脚本，运行结果和财务的手工计算对不上。已经把脚本原样贴出来：',
      '',
      '```',
      `unit_price = ${priceBug}`,
      `qty = ${qtyBug}`,
      `subtotal = round(unit_price * qty, ${subtotalRoundDigits})`,
      `rate = ${scriptRate}`,
      'total = round(subtotal * rate, 2)',
      '```',
      '',
      '核对依据（这次真正要结算的参数）：',
      `- 单价 ${price} 元`,
      `- 数量 ${qtyOk} 件`,
      `- 会员折扣率 ${rate}`,
      '- 小计按「单价 × 数量」原样保留，不做取整',
      '- 最终应付金额保留两位小数',
      '',
      `脚本跑出来的 total = ${fmt(buggyTotal)} 元。`,
      '',
      '这段脚本里有**两处**独立的错误，而且它们互相掩盖 —— 只改掉其中一处，最终数字仍然不对。',
      '请回答三件事：',
      '1) 两处错误分别属于哪一类（从四个选项里选两个：数量用错 / 单价用错 / 折扣漏乘 / 四舍五入），两处都要写出来；',
      '2) 两处都修好之后，「单价 × 数量」得到的原始小计是多少（不取整、不四舍五入）；',
      '3) 两处都修好之后的最终应付总额是多少（保留两位小数）。',
      '只输出一个 JSON 对象：',
      '{"rootCause":"<错误一>+<错误二>","fixedSubtotal":<修复后小计>,"fixedTotal":<修复后应付>}',
      '（rootCause 用加号把两个类别连起来，例如「某类+某类」；数字自己算。）',
    ].join('\n');

    return {
      prompt,
      facts,
      schema: {
        rootCause: { type: 'text', aliases: ['rootCause', '错误根源', '根因', 'cause', '错误类别', '两处错误'] },
        fixedSubtotal: { type: 'number', aliases: ['fixedSubtotal', '正确小计', '修复后小计', 'subtotal'] },
        fixedTotal: { type: 'number', aliases: ['fixedTotal', '正确应付', '修复后应付', 'total'] },
      },
      publicCriteria: [
        { id: 'C04.C1', points: 3, text: '两处错误的类别都指出正确' },
        { id: 'C04.C2', points: 3, text: '修复后的小计正确' },
        { id: 'C04.C3', points: 3, text: '修复后的应付总额正确（已按折扣率计算并保留两位小数）' },
      ],
    };
  },

  oracle(facts) {
    // 独立重算，不信任 facts.correctSubtotal / correctTotal。
    // 全程用「分」做整数运算：单价(分) × 数量 = 小计(分)，再乘折扣率并四舍五入到分。
    // 这样不会出现 38.25 * 5 = 191.24999999999997 这类浮点表示误差污染两位小数结果。
    const priceCents = Math.round(facts.price * 100);
    const subtotalCents = priceCents * facts.qtyOk;
    const subtotal = subtotalCents / 100;
    const totalCents = Math.round(subtotalCents * facts.rate);
    const total = totalCents / 100;
    return {
      rootCause: facts.rootCause,
      fixedSubtotal: subtotal,
      fixedTotal: total,
    };
  },

  grade(parsed, facts) {
    const o = C04.oracle(facts);
    const f = (parsed && parsed.fields) || {};
    const checks = [];

    // ---- C1：两处错误类别 ----
    const CATS = ['数量', '单价', '折扣', '四舍五入'];
    const rawCause = safeStr(f.rootCause);
    const core = stripBrackets(rawCause);
    const negated = (cat) => new RegExp(`(?:不是|并非|排除|而不是|而非|不是因为)${cat}`).test(rawCause);
    const claimed = CATS.filter((c) => core.includes(c) && !negated(c));

    const want = [o.rootCause.includes('数量') ? '数量' : '单价', o.rootCause.includes('四舍五入') ? '四舍五入' : '折扣'];
    const claimedSet = new Set(claimed);
    const wantSet = new Set(want);
    const sameSize = claimedSet.size === wantSet.size;
    const sameMembers = sameSize && [...wantSet].every((w) => claimedSet.has(w));
    const extraWrong = [...claimedSet].filter((c) => !wantSet.has(c));
    const c1Pass = sameMembers && extraWrong.length === 0;

    checks.push({
      criterionId: 'C04.C1',
      points: 3,
      passed: c1Pass,
      reason: !rawCause
        ? '未解析出 rootCause'
        : c1Pass
          ? `两处错误都指对了：${want.map((w) => (w === '数量' ? '数量用错' : w === '单价' ? '单价用错' : w === '折扣' ? '折扣漏乘' : '四舍五入')).join(' + ')}`
          : `应同时指出「${want.join('」与「')}」两类错误；实际识别到 ${claimed.length ? claimed.join('、') : '（无）'}`,
    });

    const fs = f.fixedSubtotal ?? null;
    checks.push({
      criterionId: 'C04.C2',
      points: 3,
      passed: sameNumber(fs, o.fixedSubtotal),
      reason: fs === null
        ? '未解析出 fixedSubtotal'
        : sameNumber(fs, o.fixedSubtotal)
          ? `修复后小计正确：${o.fixedSubtotal}`
          : `修复后小计应为 ${o.fixedSubtotal}，实际为 ${fs}`,
    });

    const ft = f.fixedTotal ?? null;
    checks.push({
      criterionId: 'C04.C3',
      points: 3,
      passed: sameNumber(ft, o.fixedTotal),
      reason: ft === null
        ? '未解析出 fixedTotal'
        : sameNumber(ft, o.fixedTotal)
          ? `修复后应付正确：${o.fixedTotal}`
          : `修复后应付应为 ${o.fixedTotal}，实际为 ${ft}`,
    });
    return checks;
  },

  fallback(raw) {
    if (typeof raw !== 'string') return null;
    const s = raw.normalize('NFKC');
    const fields = {};
    const parts = [];
    if (/数量/.test(s)) parts.push('数量用错');
    else if (/单价/.test(s)) parts.push('单价用错');
    if (/四舍五入|保留位数|小数位/.test(s)) parts.push('四舍五入');
    else if (/折扣/.test(s)) parts.push('折扣漏乘');
    if (parts.length) fields.rootCause = parts.join('+');
    const fs = s.match(/(?:正确小计|修复后小计|小计)[^0-9\-]{0,10}(\d+(?:\.\d+)?)/);
    const ft = s.match(/(?:正确应付|修复后应付|应付|总额)[^0-9\-]{0,10}(\d+(?:\.\d+)?)/);
    if (fs) fields.fixedSubtotal = Number(fs[1]);
    if (ft) fields.fixedTotal = Number(ft[1]);
    return Object.keys(fields).length ? { fields, source: 'prose', problems: [] } : null;
  },
};

export default [C01, C02, C03, C04];
