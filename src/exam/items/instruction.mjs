/**
 * 指令理解维度（instruction）—— I01 / I02 / I03 / I04
 * 合计 4 + 6 + 6 + 9 = 25 分
 *
 * 约定：generate(seed) 只产出「题面事实」，绝不产出答案；
 * 答案一律由 oracles.mjs 里独立实现的 oracle(facts) 从事实重新推导。
 */
import { makeRng } from '../rng.mjs';
import { toNumber, toBool, toList, sameSet, sameText, normText, squash } from '../../grading/parse.mjs';

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


/* ============================== I01 · 4 分 ============================== */
const I01 = {
  id: 'I01',
  dimension: DIM,
  difficulty: 'easy',
  points: 4,
  batch: 1,
  title: '最后一条有效通知覆盖原计划',
  generate(seed) {
    const rng = makeRng(`${seed}#I01`);
    const days = ['周二', '周三', '周四'];
    const [d1, d2] = rng.distinctInts(0, 2, 2).sort((a, b) => a - b).map((i) => days[i]);
    const slots = [
      { period: '上午', hour: 10, minute: 0, text: '上午10点' },
      { period: '下午', hour: 2, minute: 0, text: '下午2点' },
      { period: '上午', hour: 9, minute: 30, text: '上午9点30分' },
      { period: '下午', hour: 4, minute: 0, text: '下午4点' },
    ];
    const slot = rng.pick(slots);
    const t = slot.text;
    const facts = {
      originalDay: d1,
      updatedDay: d2,
      updatedSlot: slot,
      updatedTime: t,
      noiseRule: '正文用中文，不要加封面',
    };
    const prompt = [
      '你在帮「海风书店」向商场运营部提交一份活动海报。下面四条通知按时间先后发出：',
      `【通知1 · 周一 09:00】海报截止时间为${d1}中午12点，提交时请附上预算表。`,
      `【通知2 · 周一 15:00】截止时间改为${d2}${t}。`,
      '【通知3 · 周一 18:00】预算表这次不用交了，等版面确认后再单独补。',
      '【通知4 · 周二 09:00】除截止时间和附件要求外，其余安排不变。',
      '',
      '请问：按最终有效的要求，截止时间是哪天、几点？提交时要不要附预算表？',
      '只输出一个 JSON 对象，不要解释：',
      '{"deadline":"<日期+时间，例如 周三上午10点>","budgetAttached":true 或 false}',
    ].join('\n');
    return {
      prompt,
      facts,
      schema: {
        deadline: { type: 'text', aliases: ['deadline', '截止时间', 'finalDeadline', '时间'] },
        budgetAttached: { type: 'bool', aliases: ['budgetAttached', 'budget', 'attachBudget', '是否需要预算表', '预算表'] },
      },
      publicCriteria: [
        { id: 'I01.C1', points: 1, text: '截止时间与第2条通知给出的最终日期和时段完全一致（不得沿用第1条的原始日期或中午12点）' },
        { id: 'I01.C2', points: 3, text: '明确表示不附预算表（budgetAttached=false）' },
      ],
    };
  },
  oracle(facts) {
    return {
      day: facts.updatedDay,
      period: facts.updatedSlot.period,
      hour: facts.updatedSlot.hour,
      minute: facts.updatedSlot.minute,
      text: facts.updatedTime,
      budgetAttached: false,
    };
  },
  grade(parsed, facts) {
    const o = I01.oracle(facts);
    const checks = [];
    const dl = parsed.fields.deadline;
    const dlSq = dl ? squash(dl) : null;
    const dayOk = !!dlSq && dlSq.includes(o.day);
    const wrongDay = !!dlSq && dlSq.includes(facts.originalDay) && !dlSq.includes(o.day);
    const slotOk = !!dlSq && matchesSlot(dlSq, o.period, o.hour, o.minute);
    checks.push({
      criterionId: 'I01.C1',
      points: 1,
      passed: dayOk && slotOk && !wrongDay,
      reason: !dl
        ? '未解析出 deadline 字段'
        : dayOk && slotOk && !wrongDay
          ? `截止时间正确：${dl}`
          : `截止时间不符合最终通知（应为 ${o.day}${o.text}，实际为「${dl}」）`,
    });
    const b = parsed.fields.budgetAttached;
    checks.push({
      criterionId: 'I01.C2',
      points: 3,
      passed: b === false,
      reason: b === undefined || b === null
        ? '未解析出 budgetAttached 字段'
        : b === false
          ? '正确表示不附预算表'
          : '错误地表示仍要附预算表',
    });
    return checks;
  },
  fallback(raw) {
    if (typeof raw !== 'string') return null;
    const s = squash(raw);
    const fields = {};
    const day = s.match(/(周[一二三四五六日天])(上午|下午|晚上)?(\d{1,2}点(\d{1,2}分)?)?/);
    if (day) fields.deadline = `${day[1]}${day[2] || ''}${day[3] || ''}`;
    if (/不附|不需要预算表|无需预算表|不用附|不再附/.test(s)) fields.budgetAttached = false;
    else if (/附预算表|需要预算表|要附|附上预算表/.test(s)) fields.budgetAttached = true;
    return Object.keys(fields).length ? { fields, source: 'prose', problems: [] } : null;
  },
};

/* ============================== I02 · 6 分 ============================== */
const I02 = {
  id: 'I02',
  dimension: DIM,
  difficulty: 'standard',
  points: 6,
  batch: 2,
  title: '白名单 + 例外 + 状态过滤',
  generate(seed) {
    const rng = makeRng(`${seed}#I02`);
    const pool = ['青竹','白桦','红枫','银杏','紫藤','玉兰','海棠','雪松','梧桐','木棉'];
    const names = rng.sample(pool, 8);
    const items = names.map((name, i) => ({
      name,
      channel: i % 2 === 0 ? '线上' : '线下',
      status: i % 3 === 0 ? '下架' : '在售',
    }));
    // 规则：纳入「线上」且「在售」的商品；但名称为「备用位」的商品即使下架也纳入。
    const extra = rng.pick(pool.filter((p) => !names.includes(p)));
    items.push({ name: extra, channel: '线下', status: '下架', isBackup: true });
    const shuffled = rng.shuffle(items).map((x, i) => ({ ...x, code: `S${String(i + 1).padStart(2, '0')}` }));
    const facts = { items: shuffled, backupName: extra };
    const table = shuffled.map((x) => `- ${x.code}：${x.name}｜渠道=${x.channel}｜状态=${x.status}`).join('\n');
    const prompt = [
      '你是「小巷便利店」的上架审核员。下面是本次待审的 9 个商品：',
      table,
      '',
      '上架规则（按顺序执行，后面的规则可以覆盖前面的结论）：',
      '1) 只上架「渠道=线上」的商品。',
      '2) 状态为「下架」的商品不上架。',
      '3) 例外：名称为「' + extra + '」的商品是预留备用位，无论渠道和状态都必须上架。',
      '',
      '请把 9 个商品分成「上架」和「不上架」两组。',
      '只输出一个 JSON 对象：',
      '{"selected":["S01","S03"],"rejected":["S02"]}',
      '数组里填商品编码（例如 S01），不要填名称；每个编码必须且只能出现在其中一组里。',
      '两组内部顺序不限。',
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
    const selected = [];
    const rejected = [];
    for (const it of facts.items) {
      const inByRule = it.channel === '线上' && it.status === '在售';
      const byException = it.name === facts.backupName;
      (inByRule || byException ? selected : rejected).push(it.code);
    }
    return { selected: selected.sort(), rejected: rejected.sort() };
  },
  grade(parsed, facts) {
    const o = I02.oracle(facts);
    // 名称 → 编码 的映射只做「格式归一」，不改变语义：写了唯一对应名称与写编码等价。
    const nameToCode = new Map(facts.items.map((x) => [squash(x.name), x.code]));
    const normTokens = (arr) =>
      arr
        .map((x) => {
          const raw = String(x).normalize('NFKC').trim();
          const code = raw.toUpperCase().replace(/\s/g, '').match(/S\d{1,2}/);
          if (code) return code[0].length === 2 ? `S0${code[0][1]}` : code[0];
          const byName = nameToCode.get(squash(raw));
          return byName || raw.toUpperCase().replace(/\s/g, '');
        })
        .filter(Boolean);
    const sel = normTokens(parsed.fields.selected || []);
    const rej = normTokens(parsed.fields.rejected || []);
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
  title: '多条件优先级与例外',
  generate(seed) {
    const rng = makeRng(`${seed}#I03`);
    const applicant = rng.pick(['林可可', '周牧', '陈一舟', '许知远']);
    const nights = rng.int(2, 6);
    const amount = rng.int(3000, 9000);
    const facts = { applicant, nights, amount, region: '华东三区' };
    const prompt = [
      `【报销审批】申请人：${applicant}｜区域：${facts.region}｜住宿 ${nights} 晚｜申请金额 ${amount} 元。`,
      '',
      '审批规则（编号越小优先级越高，命中即停止）：',
      'R1 金额超过 8000 元：必须转人工复核。',
      'R2 住宿超过 5 晚且金额超过 5000 元：最多只能按 80% 批准，其余不批。',
      'R3 区域为「华东三区」且金额不超过 4000 元：可全额批准。',
      'R4 其余情况：按 50% 批准。',
      'R5 例外：若申请人属于「白名单」，R1 与 R2 不适用；白名单只有「许知远」。',
      '',
      '请给出：这条申请最终执行哪条规则、审批结论、是否需要转人工。',
      '只输出一个 JSON 对象（结论只能取 批准 / 部分批准 / 转人工 三者之一）：',
      '{"rule":"R1","decision":"转人工","escalate":true}',
    ].join('\n');
    return {
      prompt,
      facts,
      schema: {
        rule: { type: 'text', aliases: ['rule', '规则', '适用规则'] },
        decision: { type: 'text', aliases: ['decision', '结论', '审批结论'] },
        escalate: { type: 'bool', aliases: ['escalate', '转人工', '是否需要转人工', 'needHuman'] },
      },
      publicCriteria: [
        { id: 'I03.C1', points: 2, text: 'rule 字段命中正确的规则编号' },
        { id: 'I03.C2', points: 2, text: 'decision 字段命中正确的审批结论' },
        { id: 'I03.C3', points: 2, text: 'escalate 字段正确' },
      ],
    };
  },
  oracle(facts) {
    const whitelist = facts.applicant === '许知远';
    const r1 = facts.amount > 8000;
    const r2 = facts.nights > 5 && facts.amount > 5000;
    if (!whitelist && r1) return { rule: 'R1', decision: '转人工', escalate: true };
    if (!whitelist && r2) return { rule: 'R2', decision: '部分批准', escalate: false };
    if (facts.region === '华东三区' && facts.amount <= 4000) return { rule: 'R3', decision: '批准', escalate: false };
    return { rule: 'R4', decision: '部分批准', escalate: false };
  },
  grade(parsed, facts) {
    const o = I03.oracle(facts);
    const checks = [];
    const rule = parsed.fields.rule ? normText(parsed.fields.rule).toUpperCase().replace(/[^A-Z0-9]/g, '') : null;
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
    const esc = parsed.fields.escalate;
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
    const r = s.match(/(R[1-5])/i);
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
  title: '四步指令更新后的一致状态',
  generate(seed) {
    const rng = makeRng(`${seed}#I04`);
    const people = ['小林', '小周', '小陈', '小杨'];
    const [p1, p2, p3] = rng.distinctInts(0, 3, 3).map((i) => people[i]);
    const days = ['周三', '周四', '周五', '下周一'];
    const [d0, d1, d2] = rng.distinctInts(0, 3, 3).map((i) => days[i]);
    const facts = {
      init: { status: '待审核', owner: p1, deadline: d0 },
      steps: [
        { no: 1, text: `负责人由「${p1}」改为「${p2}」；状态仍为待审核。` },
        { no: 2, text: `状态由「待审核」改为「审核中」，截止时间由「${d0}」调整为「${d1}」。` },
        { no: 3, text: `负责人由「${p2}」改为「${p3}」，此条覆盖此前所有关于负责人的设置。` },
        { no: 4, text: `状态由「审核中」改为「已通过」，同时截止时间恢复为最初的「${d0}」。` },
      ],
      finalOwner: p3,
      finalDeadline: d0,
      finalStatus: '已通过',
    };
    const prompt = [
      '一个项目在四个时间点依次收到四条更新指令，请只根据这些指令推导最终状态。',
      `初始状态：状态=待审核；负责人=${p1}；截止时间=${d0}。`,
      ...facts.steps.map((s) => `第${s.no}条：${s.text}`),
      '',
      '注意：第 4 条同时包含两项独立改动，两项都要生效。',
      '请给出全部四条指令执行完毕后的最终状态。',
      '只输出一个 JSON 对象：',
      '{"status":"待审核|审核中|已通过|已驳回 之一","owner":"姓名","deadline":"周三|周四|周五|下周一 之一"}',
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
        { id: 'I04.C1', points: 3, text: '最终状态 = 已通过' },
        { id: 'I04.C2', points: 3, text: '最终负责人 = 第3条指定的负责人' },
        { id: 'I04.C3', points: 3, text: '最终截止时间 = 恢复后的初始日期' },
      ],
    };
  },
  oracle(facts) {
    return { status: facts.finalStatus, owner: facts.finalOwner, deadline: facts.finalDeadline };
  },
  grade(parsed, facts) {
    const o = I04.oracle(facts);
    const checks = [];
    const st = parsed.fields.status;
    checks.push({
      criterionId: 'I04.C1',
      points: 3,
      passed: st === o.status,
      reason: !st ? '未解析出 status 字段' : st === o.status ? '最终状态正确' : `最终状态应为「${o.status}」，实际为「${st}」`,
    });
    const ow = parsed.fields.owner;
    checks.push({
      criterionId: 'I04.C2',
      points: 3,
      passed: ow === o.owner,
      reason: !ow ? '未解析出 owner 字段' : ow === o.owner ? '最终负责人正确' : `最终负责人应为「${o.owner}」，实际为「${ow}」`,
    });
    const dl = parsed.fields.deadline;
    checks.push({
      criterionId: 'I04.C3',
      points: 3,
      passed: dl === o.deadline,
      reason: !dl ? '未解析出 deadline 字段' : dl === o.deadline ? '最终截止时间正确' : `最终截止时间应为「${o.deadline}」，实际为「${dl}」`,
    });
    return checks;
  },
  fallback(raw) {
    if (typeof raw !== 'string') return null;
    const s = squash(raw);
    const fields = {};
    for (const st of ['待审核', '审核中', '已通过', '已驳回']) if (s.includes(st)) { fields.status = st; break; }
    for (const d of ['周三', '周四', '周五', '下周一']) if (s.includes(d)) { fields.deadline = d; break; }
    const m = s.match(/(?:负责人|owner)[:：]?(小林|小周|小陈|小杨)/);
    if (m) fields.owner = m[1];
    return Object.keys(fields).length ? { fields, source: 'prose', problems: [] } : null;
  },
};

export default [I01, I02, I03, I04];
