/**
 * 指令理解维度（instruction）—— I01 / I02 / I03 / I04
 * 合计 4 + 6 + 6 + 9 = 25 分
 *
 * 设计目标（v1.3 难度改造）：
 *   旧版四道题都是「一遍扫过去就能答对」的细心题：通知 4 条、商品 9 个、规则 5 条、指令 4 条，
 *   平均只需 1~2 步推理。本版把它们改成**必须维护状态**的题：
 *     I01 · 8 条通知，含「作废前条」「条件生效（守卫可能为假）」「只改格式的噪声条」
 *     I02 · 24 个商品，3 条豁免条款，其中 1 条被后来的更正条款否定
 *     I03 · 8 条规则，含「同时满足两条件才触发」「一条规则改另一条的阈值」「全局净额定义」
 *     I04 · 9 条指令，含「检查点快照 + 选择性回滚」「仅当状态为 X 时才应用」
 *
 * 约定：
 *   - generate(seed) 只产出「题面事实」，绝不产出答案；
 *   - oracle(facts) 从 facts 里的**原始参数**独立重算出答案（不读任何预存答案字段）；
 *   - 题面示例一律用 `<...>` 占位符，绝不出现真实值（防「照抄示例」）；
 *   - publicCriteria 文案保持中性：只描述「什么样的答案算对」，不点破陷阱、不含具体数值。
 */
import { makeRng } from '../rng.mjs';
import { toNumber, toBool, sameText, normText, squash } from '../../grading/parse.mjs';

const DIM = 'instruction';

/**
 * 时段匹配：接受 24 小时制/12 小时制/中文时段等多种等价写法，但**必须**与目标时段一致。
 * 「下午2点」「14:00」「两点」都算；「上午10点」与「下午10点」绝不互通。
 */
function matchesSlot(s, period, hour, minute) {
  if (!s) return false;
  const HOUR_CN = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };
  const nums = [];
  for (const m of s.matchAll(/(\d{1,2})\s*[:：点时]\s*(\d{1,2})?/g)) {
    let h = Number(m[1]);
    const mi = m[2] === undefined ? 0 : Number(m[2]);
    // 12 小时制：带下午/晚上且 h<12 → +12；带上午且 h==12 → 0
    const afternoon = /下午|晚上|傍晚/.test(s);
    const morning = /上午|早上|凌晨/.test(s);
    if (afternoon && h < 12) h += 12;
    if (morning && h === 12) h = 0;
    nums.push({ h, mi });
  }
  if (nums.length === 0) {
    for (const m of s.matchAll(/(十[一二]?|[一二两三四五六七八九])\s*点/g)) {
      let h = HOUR_CN[m[1]];
      if (h === undefined) continue;
      const afternoon = /下午|晚上|傍晚/.test(s);
      if (afternoon && h < 12) h += 12;
      nums.push({ h, mi: 0 });
    }
  }
  if (nums.length === 0) return false;
  const target = (period === '下午' ? (hour < 12 ? hour + 12 : hour) : hour) % 24;
  return nums.some((n) => n.h === target && n.mi === minute);
}

/** 把任意输入收敛成数组，垃圾输入返回 []（不抛异常） */
function asArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return v.split(/[,，、;；\s]+/).filter(Boolean);
  return [];
}

/* ============================== I01 · 4 分 ============================== */

/** 全部候选时段都用「上午/下午」，保证 DEADLINE_RE 与 matchesSlot 的口径一致 */
const I01_SLOTS = [
  { period: '上午', hour: 9, minute: 30, text: '上午9点30分' },
  { period: '上午', hour: 10, minute: 0, text: '上午10点' },
  { period: '上午', hour: 11, minute: 0, text: '上午11点' },
  { period: '下午', hour: 2, minute: 0, text: '下午2点' },
  { period: '下午', hour: 3, minute: 0, text: '下午3点' },
  { period: '下午', hour: 4, minute: 0, text: '下午4点' },
];

const I01 = {
  id: 'I01',
  dimension: DIM,
  difficulty: 'easy',
  points: 4,
  batch: 1,
  title: '多条通知互相作废后的最终要求',
  generate(seed) {
    const rng = makeRng(`${seed}#I01`);
    const DAYS = ['周二', '周三', '周四', '周五'];
    const [d0, d1, d2, d3] = rng.sample(DAYS, 4);
    const [s0, s1, s2, s3] = rng.sample(I01_SLOTS, 4);
    const scenario = rng.pick(['revoke', 'guard']);

    let prompt;
    let finalDay;
    let finalSlot;
    let attachRequired;

    if (scenario === 'revoke') {
      // 剧情 A：第3条取消附件 → 第4条把它作废（附件要求回滚）→ 第5条条件命中改期
      finalDay = d2;
      finalSlot = s2;
      attachRequired = true;
      prompt = [
        '你在帮「海风书店」向商场运营部提交一份活动海报。下面八条通知按时间先后发出。',
        '本次场次：线上；预算状态：已批复。',
        '',
        `【通知1 · 周一 09:00】海报截止时间为${d0}${s0.text}，提交时请附上预算表。`,
        `【通知2 · 周一 11:00】截止时间改为${d1}${s1.text}。`,
        '【通知3 · 周一 14:00】预算表这次不用交。',
        '【通知4 · 周一 16:00】第3条作废（视为从未发出），其余内容不变。',
        `【通知5 · 周一 18:00】若本次为线上场次，截止时间再改为${d2}${s2.text}。`,
        `【通知6 · 周二 09:00】若本次为线下场次，截止时间改为${d3}${s3.text}。`,
        '【通知7 · 周二 11:00】提交格式改为 PDF，不影响截止时间与附件要求。',
        '【通知8 · 周二 15:00】除上述内容外，其余安排不变。',
      ].join('\n');
    } else {
      // 剧情 B：第2条改期后被第5条作废（日期回滚到最初）→ 附件取消未被告作废 → 条件守卫为假
      finalDay = d0;
      finalSlot = s0;
      attachRequired = false;
      prompt = [
        '你在帮「海风书店」向商场运营部提交一份活动海报。下面八条通知按时间先后发出。',
        '本次场次：线下；预算状态：已批复。',
        '',
        `【通知1 · 周一 09:00】海报截止时间为${d0}${s0.text}，提交时请附上预算表。`,
        `【通知2 · 周一 11:00】若本次为线下场次，截止时间改为${d1}${s1.text}。`,
        '【通知3 · 周一 14:00】预算表这次不用交。',
        '【通知4 · 周一 16:00】若预算尚未批复，第3条不适用。',
        '【通知5 · 周一 18:00】第2条作废（视为从未发出），其余内容不变。',
        `【通知6 · 周二 09:00】若本次为线上场次且预算已批复，截止时间改为${d2}${s2.text}。`,
        '【通知7 · 周二 11:00】提交格式改为 PDF，不影响截止时间与附件要求。',
        '【通知8 · 周二 15:00】除上述内容外，其余安排不变。',
      ].join('\n');
    }

    const facts = {
      scenario,
      // 以下字段语义为「最终生效值」，供夹具与外部消费者使用
      updatedDay: finalDay,
      updatedSlot: finalSlot,
      updatedTime: finalSlot.text,
      attachRequired,
      // 原始参数（oracle 据此逐条重放，不读上面的生效值）
      initialDay: d0,
      initialSlot: s0,
      notice2Day: d1,
      notice2Slot: s1,
      notice5Day: d2,
      notice5Slot: s2,
      notice6Day: d3,
      notice6Slot: s3,
      sessionChannel: scenario === 'revoke' ? '线上' : '线下',
      budgetStatus: '已批复',
      noticeCount: 8,
    };

    const full = [
      ...prompt.split('\n'),
      '',
      '请问：按最终有效的要求，截止时间是哪天、几点？提交时要不要附预算表？',
      '只输出一个 JSON 对象，不要解释：',
      '{"deadline":"<日期+时间>","budgetAttached":<true或false>}',
    ].join('\n');

    return {
      prompt: full,
      facts,
      schema: {
        deadline: { type: 'text', aliases: ['deadline', '截止时间', 'finalDeadline', '时间'] },
        budgetAttached: { type: 'bool', aliases: ['budgetAttached', 'budget', 'attachBudget', '是否需要预算表', '预算表'] },
      },
      publicCriteria: [
        { id: 'I01.C1', points: 1, text: 'deadline 字段与全部通知执行完毕后最终生效的截止时间一致' },
        { id: 'I01.C2', points: 3, text: 'budgetAttached 字段与全部通知执行完毕后最终生效的附件要求一致' },
      ],
    };
  },
  /**
   * 独立重算：按「作废=视为从未发出」的语义，从头重放八条通知。
   * 不读 facts.updatedDay / attachRequired 等任何预存答案字段。
   */
  oracle(facts) {
    // 通知1 建立初始值
    let day = facts.initialDay;
    let slot = facts.initialSlot;
    let attach = true;

    if (facts.scenario === 'revoke') {
      // 通知2 无条件改期
      day = facts.notice2Day;
      slot = facts.notice2Slot;
      // 通知3 取消附件
      attach = false;
      // 通知4 作废通知3 → 附件要求回到通知1 的状态
      attach = true;
      // 通知5 守卫：场次为线上 → 命中
      if (facts.sessionChannel === '线上') {
        day = facts.notice5Day;
        slot = facts.notice5Slot;
      }
      // 通知6 守卫：场次为线下 → 不命中
      // 通知7/8 不改这三项
    } else {
      // 通知2 守卫：场次为线下 → 命中
      if (facts.sessionChannel === '线下') {
        day = facts.notice2Day;
        slot = facts.notice2Slot;
      }
      // 通知3 取消附件
      attach = false;
      // 通知4 守卫：预算尚未批复 → 不命中，故通知3 继续有效
      // 通知5 作废通知2 → 日期回到通知1 的状态
      day = facts.initialDay;
      slot = facts.initialSlot;
      // 通知6 守卫：场次为线上 → 不命中
    }
    return { day, period: slot.period, hour: slot.hour, minute: slot.minute, text: slot.text, budgetAttached: attach };
  },
  grade(parsed, facts) {
    const o = I01.oracle(facts);
    const checks = [];
    const dlRaw = parsed.fields.deadline;
    const dl = dlRaw === undefined || dlRaw === null ? null : String(dlRaw);
    const dlSq = dl ? squash(dl) : null;
    // 严格匹配：整串必须是「[周X] + [时段]」这种结构，允许极少量的中性修饰词（左右/整/分）。
    const DEADLINE_RE = /^(?:周[一二三四五六日天])?(?:上午|下午|晚上|早上|凌晨)?(?:\d{1,2}\s*[:：点]\s*\d{0,2}\s*分?|[一二两三四五六七八九十]{1,2}\s*点(?:半|\d{1,2}分?)?)(?:左右|整)?$/u;
    const dayOk = !!dlSq && dlSq.includes(o.day) && DEADLINE_RE.test(dlSq);
    const slotOk = !!dlSq && DEADLINE_RE.test(dlSq) && matchesSlot(dlSq, o.period, o.hour, o.minute);
    checks.push({
      criterionId: 'I01.C1',
      points: 1,
      passed: dayOk && slotOk,
      reason: !dl
        ? '未解析出 deadline 字段'
        : dayOk && slotOk
          ? `截止时间正确：${dl}`
          : `截止时间与最终生效的要求不一致（实际为「${dl}」）`,
    });
    const b = toBool(parsed.fields.budgetAttached);
    const expectedAttach = o.budgetAttached;
    checks.push({
      criterionId: 'I01.C2',
      points: 3,
      passed: b === expectedAttach,
      reason: b === undefined
        ? '未解析出 budgetAttached 字段'
        : b === expectedAttach
          ? (expectedAttach ? '正确表示需要附预算表' : '正确表示不附预算表')
          : `附件要求判断错误：应为 ${expectedAttach ? '需要附' : '不附'}，实际为 ${b ? '需要附' : '不附'}`,
    });
    return checks;
  },
  fallback(raw) {
    if (typeof raw !== 'string') return null;
    const s = squash(raw);
    const fields = {};
    const day = s.match(/(周[一二三四五六日天])(上午|下午|晚上)?(\d{1,2}点(\d{1,2}分)?)?/);
    if (day) fields.deadline = `${day[1]}${day[2] || ''}${day[3] || ''}`;
    if (/不附|不需要预算表|无需预算表|不用付|不用附|不再附/.test(s)) fields.budgetAttached = false;
    else if (/附预算表|需要预算表|要附|附上预算表|务必附上/.test(s)) fields.budgetAttached = true;
    return Object.keys(fields).length ? { fields, source: 'prose', problems: [] } : null;
  },
};

/* ============================== I02 · 6 分 ============================== */

const I02_NAME_POOL = [
  '青竹', '白桦', '红枫', '银杏', '紫藤', '玉兰', '海棠', '雪松', '梧桐', '木棉',
  '香樟', '合欢', '连翘', '迎春', '山茶', '杜鹃', '石榴', '樱花', '梅花', '兰花',
  '桂花', '水仙', '芙蓉', '蔷薇', '紫薇', '木槿', '含笑', '腊梅',
];

const I02 = {
  id: 'I02',
  dimension: DIM,
  difficulty: 'standard',
  points: 6,
  batch: 2,
  title: '多豁免条款与条款更正',
  generate(seed) {
    const rng = makeRng(`${seed}#I02`);
    const names = rng.sample(I02_NAME_POOL, 24);
    const items = names.map((name) => ({
      name,
      channel: rng.next() < 0.5 ? '线上' : '线下',
      status: rng.next() < 0.35 ? '下架' : '在售',
    }));

    // 三条豁免条款的对象：优先选「按基础规则会被拒绝」的商品，保证豁免条款真的起作用
    const rejectable = items.filter((x) => !(x.channel === '线上' && x.status === '在售'));
    const picks = rng.sample(rejectable.length >= 3 ? rejectable : items, 3);
    const [e1, e2, e3] = picks.map((x) => x.name);

    const shuffled = rng.shuffle(items).map((x, i) => ({ ...x, code: `S${String(i + 1).padStart(2, '0')}` }));
    const facts = { items: shuffled, exemptNames: [e1, e2], revokedExemptName: e3, noticeCount: 7 };

    const table = shuffled.map((x) => `- ${x.code}：${x.name}｜渠道=${x.channel}｜状态=${x.status}`).join('\n');
    const prompt = [
      '你是「小巷便利店」的上架审核员。下面是本次待审的 24 个商品：',
      table,
      '',
      '上架规则（按编号顺序执行，后面的条款可以推翻前面的结论）：',
      '1) 只上架「渠道=线上」的商品。',
      '2) 状态为「下架」的商品不上架。',
      `3) 豁免一：名称为「${e1}」的商品，不受第1、2条限制，一律上架。`,
      `4) 豁免二：名称为「${e2}」的商品，不受第1、2条限制，一律上架。`,
      `5) 豁免三：名称为「${e3}」的商品，不受第1、2条限制，一律上架。`,
      `6) 更正：第5条作废，「${e3}」仍按第1、2条普通规则处理。`,
      '7) 除此之外的商品一律按第1、2条判断。',
      '',
      '请把 24 个商品分成「上架」和「不上架」两组。',
      '数组里填商品编码（例如 S01），不要填名称；每个编码必须且只能出现在其中一组里。',
      '只输出一个 JSON 对象：',
      '{"selected":["<商品编码>"],"rejected":["<商品编码>"]}',
    ].join('\n');

    return {
      prompt,
      facts,
      schema: {
        selected: { type: 'list', aliases: ['selected', '上架', '上架列表', 'include', 'approved'] },
        rejected: { type: 'list', aliases: ['rejected', '不上架', '不上架列表', 'exclude', 'denied'] },
      },
      publicCriteria: [
        { id: 'I02.C1', points: 2, text: '「上架」组包含全部应上架商品（无遗漏）' },
        { id: 'I02.C2', points: 2, text: '「上架」组不含任何不应上架商品（无多余）' },
        { id: 'I02.C3', points: 2, text: '「不上架」组与补集完全一致' },
      ],
    };
  },
  oracle(facts) {
    const exempt = new Set(facts.exemptNames);
    const revoked = facts.revokedExemptName;
    const selected = [];
    const rejected = [];
    for (const it of facts.items) {
      const byBase = it.channel === '线上' && it.status === '在售';
      const byExempt = exempt.has(it.name);
      // 被第6条否定的豁免不参与判断
      const ok = byBase || (byExempt && it.name !== revoked);
      (ok ? selected : rejected).push(it.code);
    }
    return { selected: selected.sort(), rejected: rejected.sort() };
  },
  grade(parsed, facts) {
    const o = I02.oracle(facts);
    // 名称 → 编码 的映射只做「格式归一」，不改变语义：写了唯一对应名称与写编码等价。
    const nameToCode = new Map(facts.items.map((x) => [squash(x.name), x.code]));
    const normTokens = (arr) =>
      asArray(arr)
        .map((x) => {
          const raw = String(x).normalize('NFKC').trim();
          const compact = raw.toUpperCase().replace(/\s/g, '');
          // 严格：整个 token 必须就是 S + 1~2 位数字，不能是 "S06垃圾"
          const strict = compact.match(/^S(\d{1,2})$/);
          if (strict) return `S${String(Number(strict[1])).padStart(2, '0')}`;
          const byName = nameToCode.get(squash(raw));
          return byName || compact;
        })
        .filter(Boolean);
    const sel = normTokens(parsed.fields.selected);
    const rej = normTokens(parsed.fields.rejected);
    const missing = o.selected.filter((x) => !sel.includes(x));
    const extra = sel.filter((x) => !o.selected.includes(x));
    const rejMissing = o.rejected.filter((x) => !rej.includes(x));
    const rejExtra = rej.filter((x) => !o.rejected.includes(x));
    const checks = [];
    checks.push({
      criterionId: 'I02.C1',
      points: 2,
      passed: sel.length > 0 && missing.length === 0,
      reason: sel.length === 0 ? '未解析出 selected 列表' : missing.length === 0 ? '应上架商品全部命中' : `遗漏了应上架商品：${missing.join(', ')}`,
    });
    checks.push({
      criterionId: 'I02.C2',
      points: 2,
      passed: sel.length > 0 && extra.length === 0,
      reason: sel.length === 0 ? '未解析出 selected 列表' : extra.length === 0 ? '没有多放商品' : `多放了不应上架的商品：${extra.join(', ')}`,
    });
    checks.push({
      criterionId: 'I02.C3',
      points: 2,
      passed: rej.length > 0 && rejMissing.length === 0 && rejExtra.length === 0,
      reason: rej.length === 0
        ? '未解析出 rejected 列表'
        : rejMissing.length === 0 && rejExtra.length === 0
          ? '不上架组与补集完全一致'
          : `不上架组有误，缺少：${rejMissing.join(', ') || '无'}；多出：${rejExtra.join(', ') || '无'}`,
    });
    return checks;
  },
  fallback(raw) {
    if (typeof raw !== 'string') return null;
    const fields = {};
    const sel = raw.match(/(?:上架|selected)[^\n]*?[:：]\s*([^\n]+)/i);
    const rej = raw.match(/(?:不上架|rejected)[^\n]*?[:：]\s*([^\n]+)/i);
    const grab = (t) => (t ? (t[1].match(/S\d{2}/gi) || []).map((x) => x.toUpperCase()) : null);
    if (sel) fields.selected = grab(sel) || [];
    if (rej) fields.rejected = grab(rej) || [];
    return Object.keys(fields).length ? { fields, source: 'prose', problems: [] } : null;
  },
};

/* ============================== I03 · 6 分 ============================== */

const I03 = {
  id: 'I03',
  dimension: DIM,
  difficulty: 'standard',
  points: 6,
  batch: 3,
  title: '多条件优先级、阈值下调与净额口径',
  generate(seed) {
    const rng = makeRng(`${seed}#I03`);
    // 关键：**先等概率选分支，再按分支反推参数**，保证四条规则的答案分布接近均匀。
    // R5 的 A/B 两级白名单必须真的改变结论（否则只是装饰），但 B 级会把 R2 的结论改写成 R4，
    // 直接抬高 R4 占比。因此 B 级只在 R2 分支里以较低概率出现，让 R4 稳定落在 15%~35% 内。
    const branch = rng.pick(['R1', 'R2', 'R3', 'R4']);
    const region = '华东三区';
    let nights;
    let subsidy;
    let net;
    let tier; // 无 / A / B
    let expedite; // bool
    let effRegion = region;

    switch (branch) {
      case 'R1': {
        // 只有「无等级」才会受 R1 约束；加急时阈值 6000，否则 8000
        tier = '无';
        expedite = rng.next() < 0.5;
        const limit = expedite ? 6000 : 8000;
        net = limit + rng.int(1, 1800);
        nights = rng.int(2, 5);
        subsidy = rng.pick([0, 260, 480]);
        break;
      }
      case 'R2': {
        // 住宿 > 5 且净额 > 5000。
        const m = rng.next();
        if (m < 0.40) {
          // A 级豁免 R1：净额可以越过 R1 阈值，结论仍是 R2
          tier = 'A';
          expedite = rng.next() < 0.5;
          net = 5001 + rng.int(1, 6000);
        } else if (m < 0.55) {
          // B 级且同时豁免 R2：R2 本该命中却落到 R4（低频，避免抬高 R4 占比）
          tier = 'B';
          expedite = rng.next() < 0.5;
          net = 5001 + rng.int(1, 4000);
        } else {
          tier = '无';
          expedite = false;
          net = 5001 + rng.int(1, 2999); // ≤ 8000，不触发 R1
        }
        nights = rng.int(6, 10);
        subsidy = rng.pick([0, 300, 520]);
        break;
      }
      case 'R3': {
        // 华东三区 且 净额 ≤ 4000；住宿 ≤ 5 避免命中 R2
        nights = rng.int(2, 5);
        net = 1200 + rng.int(0, 2800);
        tier = rng.pick(['无', 'A', 'B']);
        expedite = rng.next() < 0.5;
        subsidy = rng.pick([0, 200, 450]);
        break;
      }
      default: {
        // R4：既不命中 R1/R2，也不满足 R3（区域不符，或净额 > 4000）
        const m = rng.next();
        if (m < 0.25) {
          // A 级豁免 R1：净额越过 R1 阈值但住宿 ≤5、净额>4000 → 仍是 R4
          tier = 'A';
          expedite = rng.next() < 0.5;
          net = (expedite ? 6000 : 8000) + rng.int(1, 1500);
          nights = rng.int(2, 5);
        } else if (m < 0.40) {
          // B 级：净额 ≤4000 且区域不符 → R4
          tier = 'B';
          expedite = rng.next() < 0.5;
          net = 1500 + rng.int(0, 2400);
          nights = rng.int(2, 5);
          effRegion = '西南一区';
        } else if (rng.next() < 0.5) {
          tier = '无';
          expedite = false;
          nights = rng.int(2, 5);
          net = 4001 + rng.int(0, 3500); // ≤ 8000，不触发 R1
        } else {
          tier = '无';
          expedite = false;
          nights = rng.int(2, 5);
          net = 1500 + rng.int(0, 2400); // 净额 ≤ 4000 但区域不符
          effRegion = '西南一区';
        }
        subsidy = rng.pick([0, 240, 320]);
        break;
      }
    }
    const amount = net + subsidy;
    const applicantPool = ['林可可', '周牧', '陈一舟', '苏晚', '何田田'];
    const applicant = rng.pick(applicantPool);

    const facts = { applicant, region: effRegion, nights, amount, subsidy, tier, expedite, branch };

    const tierText = tier === '无' ? '无' : `${tier} 级白名单`;
    const prompt = [
      `【报销审批】申请人：${applicant}｜区域：${effRegion}｜住宿 ${nights} 晚｜申请金额：${amount} 元｜住宿补贴：${subsidy} 元｜名单等级：${tierText}｜加急标记：${expedite ? '有' : '无'}。`,
      `净额 = 申请金额 − 住宿补贴（若低于 0 则按 0 计）。本例净额 = ${amount} − ${subsidy} = ${amount - subsidy} 元。`,
      '',
      '审批规则（编号越小优先级越高，命中即停止）：',
      'R1 净额超过 8000 元的申请：必须转人工复核。',
      'R2 住宿超过 5 晚且净额超过 5000 元的申请：最多按 80% 批准，其余不批，未批部分需人工核准。',
      'R3 区域为「华东三区」且净额不超过 4000 元的申请：可全额批准。',
      'R4 其余情况：按 50% 批准。',
      'R5 白名单分两级：A 级白名单的申请不适用 R1；B 级白名单的申请既不适用 R1，也不适用 R2。',
      'R6 申请人带「加急」标记时，R1 的净额阈值由 8000 元下调为 6000 元。',
      'R7 若同一申请同时满足 R2 与 R3 的触发条件，以编号靠前者为准。',
      'R8 未被以上任何一条覆盖的申请，一律并入 R4 处理。',
      '',
      '请给出：这条申请最终执行哪条规则、审批结论、是否需要转人工。',
      '只输出一个 JSON 对象（结论只能取 批准 / 部分批准 / 转人工 三者之一）：',
      '{"rule":"<R1|R2|R3|R4>","decision":"<批准|部分批准|转人工>","escalate":<true或false>}',
    ].join('\n');

    return {
      prompt,
      facts,
      schema: {
        rule: { type: 'text', aliases: ['rule', '规则', '适用规则'] },
        decision: { type: 'text', aliases: ['decision', '结论', '审批结论'] },
        escalate: { type: 'bool', aliases: ['escalate', '转人工', '是否需要转人工', 'needHuman', '需要转人工', '需人工', '需要人工', '人工审批'] },
      },
      publicCriteria: [
        { id: 'I03.C1', points: 2, text: 'rule 字段给出实际命中的规则编号' },
        { id: 'I03.C2', points: 2, text: 'decision 字段与命中规则对应的审批结论一致' },
        { id: 'I03.C3', points: 2, text: 'escalate 字段与命中规则对应的人工介入要求一致' },
      ],
    };
  },
  /**
   * 独立重算：从原始参数算出净额，再按 R1→R2→R3→R4 的顺序判。
   * 不读 facts.branch。
   */
  oracle(facts) {
    const net = Math.max(0, facts.amount - facts.subsidy);
    const r1Limit = facts.expedite ? 6000 : 8000;
    const r1Applies = facts.tier === '无'; // A、B 两级都豁免 R1
    if (r1Applies && net > r1Limit) return { rule: 'R1', decision: '转人工', escalate: true };
    const r2Applies = facts.tier !== 'B'; // 只有 B 级豁免 R2
    if (r2Applies && facts.nights > 5 && net > 5000) return { rule: 'R2', decision: '部分批准', escalate: true };
    if (facts.region === '华东三区' && net <= 4000) return { rule: 'R3', decision: '批准', escalate: false };
    return { rule: 'R4', decision: '部分批准', escalate: false };
  },
  grade(parsed, facts) {
    const o = I03.oracle(facts);
    const checks = [];
    const ruleRaw = parsed.fields.rule;
    const rule = ruleRaw ? normText(ruleRaw).toUpperCase().replace(/[^A-Z0-9]/g, '') : null;
    checks.push({
      criterionId: 'I03.C1',
      points: 2,
      passed: rule === o.rule,
      reason: rule === null ? '未解析出 rule 字段' : rule === o.rule ? `适用规则正确：${o.rule}` : `适用规则应为 ${o.rule}，实际为 ${rule}`,
    });
    const dec = parsed.fields.decision;
    const decOk = dec ? sameText(dec, o.decision, { 批准: ['可以批准', '通过', '同意'], 部分批准: ['部分通过', '按比例批准', '部分同意'], 转人工: ['转人工复核', '人工复核', '需要人工'] }) : false;
    checks.push({
      criterionId: 'I03.C2',
      points: 2,
      passed: decOk,
      reason: !dec ? '未解析出 decision 字段' : decOk ? `审批结论正确：${o.decision}` : `审批结论应为「${o.decision}」，实际为「${dec}」`,
    });
    const esc = toBool(parsed.fields.escalate);
    checks.push({
      criterionId: 'I03.C3',
      points: 2,
      passed: esc === o.escalate,
      reason: esc === undefined ? '未解析出 escalate 字段' : esc === o.escalate ? `转人工判断正确：${o.escalate}` : `转人工应为 ${o.escalate}，实际为 ${esc}`,
    });
    return checks;
  },
  fallback(raw) {
    if (typeof raw !== 'string') return null;
    const s = squash(raw);
    const fields = {};
    const r = s.match(/(R[1-8])/i);
    if (r) fields.rule = r[1].toUpperCase();
    if (/部分批准|部分通过/.test(s)) fields.decision = '部分批准';
    else if (/转人工|人工复核/.test(s)) fields.decision = '转人工';
    else if (/批准|通过|同意/.test(s)) fields.decision = '批准';
    if (/不(?:需要|用)转人工|无需转人工/.test(s)) fields.escalate = false;
    else if (/需要转人工|转人工/.test(s)) fields.escalate = true;
    return Object.keys(fields).length ? { fields, source: 'prose', problems: [] } : null;
  },
};

/* ============================== I04 · 9 分 ============================== */

const I04 = {
  id: 'I04',
  dimension: DIM,
  difficulty: 'challenge',
  points: 9,
  batch: 4,
  title: '检查点回滚与条件指令后的最终状态',
  generate(seed) {
    const rng = makeRng(`${seed}#I04`);
    const people = ['小林', '小周', '小陈', '小杨', '小唐', '小许'];
    const [p0, p1, p2, p3, p4] = rng.sample(people, 5);
    const days = ['周三', '周四', '周五', '下周一'];
    const [d0, d1, d2] = rng.sample(days, 3);
    const finalStatus = rng.pick(['已通过', '已驳回']);

    const facts = {
      init: { status: '待审核', owner: p0, deadline: d0 },
      owners: { p0, p1, p2, p3, p4 },
      days: { d0, d1, d2 },
      finalStatus,
      // 最终生效值（供夹具与外部消费者使用）
      finalOwner: p4,
      finalDeadline: d0,
      finalOwnerIfStarted: p1,
      noticeCount: 9,
    };

    const prompt = [
      '一个项目在九个时间点依次收到九条更新指令，请只根据这些指令推导最终状态。',
      `初始状态：状态=待审核；负责人=${p0}；截止时间=${d0}。`,
      '',
      `第1条：负责人由「${p0}」改为「${p1}」。`,
      '第2条：【检查点A】将此刻的「状态」与「截止时间」记录为检查点A，负责人不纳入检查点。',
      `第3条：状态由「待审核」改为「审核中」；截止时间由「${d0}」改为「${d1}」。`,
      `第4条：负责人由「${p1}」改为「${p2}」。`,
      `第5条：仅当状态为「审核中」时，负责人改为「${p3}」。`,
      `第6条：截止时间由「${d1}」改为「${d2}」。`,
      `第7条：仅当状态为「审核中」时，负责人改为「${p4}」（覆盖此前关于负责人的设置）。`,
      '第8条：将「状态」与「截止时间」恢复为检查点A记录的值，负责人不受此条影响。',
      `第9条：状态改为「${finalStatus}」。`,
      '',
      '请给出全部九条指令执行完毕后的最终状态。',
      '只输出一个 JSON 对象：',
      '{"status":"<状态>","owner":"<姓名>","deadline":"<日期>"}',
    ].join('\n');

    return {
      prompt,
      facts,
      schema: {
        status: { type: 'text', aliases: ['status', '状态', 'finalStatus'] },
        owner: { type: 'text', aliases: ['owner', '负责人', 'finalOwner'] },
        deadline: { type: 'text', aliases: ['deadline', '截止时间', 'finalDeadline'] },
      },
      publicCriteria: [
        { id: 'I04.C1', points: 3, text: 'status 字段与九条指令执行完毕后的最终状态一致' },
        { id: 'I04.C2', points: 3, text: 'owner 字段与九条指令执行完毕后的最终负责人一致' },
        { id: 'I04.C3', points: 3, text: 'deadline 字段与九条指令执行完毕后的最终截止时间一致' },
      ],
    };
  },
  /**
   * 独立重放九条指令。检查点只记录「状态 + 截止时间」，负责人不在快照内。
   * 不读 facts.finalStatus / finalOwner / finalDeadline。
   */
  oracle(facts) {
    const { p0, p1, p2, p3, p4 } = facts.owners;
    const { d0, d1, d2 } = facts.days;
    let status = '待审核';
    let owner = p0;
    let deadline = d0;
    // 第1条
    owner = p1;
    // 第2条：记录检查点（此时 status=待审核, deadline=d0）
    const checkpoint = { status, deadline };
    // 第3条
    status = '审核中';
    deadline = d1;
    // 第4条
    owner = p2;
    // 第5条：守卫 status==='审核中' → 命中
    if (status === '审核中') owner = p3;
    // 第6条
    deadline = d2;
    // 第7条：守卫同为「审核中」→ 同样命中，覆盖第5条
    if (status === '审核中') owner = p4;
    // 第8条：恢复检查点里的状态与截止时间（负责人不动）
    status = checkpoint.status;
    deadline = checkpoint.deadline;
    // 第9条
    status = facts.finalStatus;
    return { status, owner, deadline };
  },
  grade(parsed, facts) {
    const o = I04.oracle(facts);
    const checks = [];
    const st = parsed.fields.status ? normText(parsed.fields.status) : null;
    const stOk = st !== null && sameText(st, o.status, { 已通过: ['通过'], 已驳回: ['驳回'], 待审核: ['待审'], 审核中: [] });
    checks.push({
      criterionId: 'I04.C1',
      points: 3,
      passed: stOk,
      reason: !st ? '未解析出 status 字段' : stOk ? '最终状态正确' : `最终状态应为「${o.status}」，实际为「${st}」`,
    });
    const owRaw = parsed.fields.owner;
    const ow = owRaw === undefined || owRaw === null ? null : squash(String(owRaw));
    const owOk = ow !== null && ow === squash(o.owner);
    checks.push({
      criterionId: 'I04.C2',
      points: 3,
      passed: owOk,
      reason: !ow ? '未解析出 owner 字段' : owOk ? '最终负责人正确' : `最终负责人应为「${o.owner}」，实际为「${owRaw}」`,
    });
    const dlRaw = parsed.fields.deadline;
    const dl = dlRaw === undefined || dlRaw === null ? null : squash(String(dlRaw));
    const dlOk = dl !== null && dl === squash(o.deadline);
    checks.push({
      criterionId: 'I04.C3',
      points: 3,
      passed: dlOk,
      reason: !dl ? '未解析出 deadline 字段' : dlOk ? '最终截止时间正确' : `最终截止时间应为「${o.deadline}」，实际为「${dlRaw}」`,
    });
    return checks;
  },
  fallback(raw) {
    if (typeof raw !== 'string') return null;
    const s = squash(raw);
    const fields = {};
    for (const st of ['待审核', '审核中', '已通过', '已驳回']) if (s.includes(st)) { fields.status = st; break; }
    for (const d of ['周三', '周四', '周五', '下周一']) if (s.includes(d)) { fields.deadline = d; break; }
    const m = s.match(/(?:负责人|owner)[:：]?(小林|小周|小陈|小杨|小唐|小许)/);
    if (m) fields.owner = m[1];
    return Object.keys(fields).length ? { fields, source: 'prose', problems: [] } : null;
  },
};

export default [I01, I02, I03, I04];
