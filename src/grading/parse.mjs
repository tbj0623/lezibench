/**
 * LeziBench 答案解析工具包
 * ------------------------------------------------------------------
 * 设计红线（来自评分合同 03 §3）：
 *  1. 只做「格式识别」，绝不做「猜测性理解」。识别不出就返回 null，由调用方进入 NEEDS_REVIEW。
 *  2. 不放宽语义：不删否定词、不删数字、不擅自挑选多个冲突值中的一个。
 *  3. 不做 eval / new Function / 动态 import 执行被测答案。
 *  4. 纯函数、无 I/O、无网络，可被独立单测。
 */

/* ------------------------------ 文本归一 ------------------------------ */

const PUNCT_TRAIL = /[。．.、,，;；:：!！?？\s]+$/u;
const WRAP_QUOTES = /^[\s"'`「」『』“”‘’]+|[\s"'`「」『』“”‘’]+$/gu;

/** NFKC + 去首尾引号/标点 + 折叠内部空白（保留内部标点与否定词） */
export function normText(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v !== 'string') return null;
  let s = v.normalize('NFKC').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(WRAP_QUOTES, '');
  s = s.replace(PUNCT_TRAIL, '');
  return s.trim();
}

/** 用于字段名匹配：小写 + 去掉所有非字母数字下划线以外的分隔符 */
export function normKey(k) {
  return String(k).normalize('NFKC').toLowerCase().replace(/[\s_\-·.]/g, '');
}

/** 只是把空白与常见全角标点抹平，用于中文短语比较（不做同义词扩展） */
export function squash(s) {
  const t = normText(s);
  if (t === null) return null;
  return t
    .replace(/\s+/g, '')
    .replace(/[，,]/g, ',')
    .replace(/[。.]/g, '.')
    .replace(/[：:]/g, ':');
}

/* ------------------------------ 中文数字 ------------------------------ */

const CN_DIGIT = { 零: 0, 〇: 0, 一: 1, 壹: 1, 二: 2, 贰: 2, 两: 2, 三: 3, 叁: 3, 四: 4, 肆: 4, 五: 5, 伍: 5, 六: 6, 陆: 6, 七: 7, 柒: 7, 八: 8, 捌: 8, 九: 9, 玖: 9 };
const CN_UNIT = { 十: 10, 拾: 10, 百: 100, 佰: 100, 千: 1000, 仟: 1000 };

/** 支持 0–99999 的中文整数；不认识就返回 null（不猜） */
export function cnToInt(str) {
  if (!str) return null;
  const s = str.normalize('NFKC');
  if (/^[0-9]+$/.test(s)) return Number(s);
  if (!/^[零〇一壹二贰两三叁四肆五伍六陆七柒八捌九玖十拾百佰千仟万]+$/.test(s)) return null;
  if (!/[十拾百佰千仟万]/.test(s)) {
    // 纯数字串，如「五二」在中文里不表意，直接拒绝
    return s.length === 1 ? CN_DIGIT[s] : null;
  }
  let total = 0;
  let section = 0;
  let number = 0;
  for (const ch of s) {
    if (ch in CN_DIGIT) {
      number = CN_DIGIT[ch];
    } else if (ch in CN_UNIT) {
      const unit = CN_UNIT[ch];
      if (number === 0) number = 1; // 十一 → 11
      section += number * unit;
      number = 0;
    } else if (ch === '万') {
      total += (section + number) * 10000;
      section = 0;
      number = 0;
    }
  }
  return total + section + number;
}

/* ------------------------------ 数值 ------------------------------ */

const UNIT_SUFFIX = /(元|块|圆|人民币|人|个|件|次|分|分钟|秒|小时|天|度|米|公斤|千克|斤|张|份|台|条)(?=$|[^0-9])/u;

/**
 * 严格数值解析。options.units=true 时允许剥离常见单位后缀（题目若给出单位才允许）。
 * 返回 number 或 null；拒绝 NaN / Infinity / 空串 / 含多段数字的混杂串。
 */
export function toNumber(v, options = {}) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return null;
  if (typeof v !== 'string') return null;
  let s = v.normalize('NFKC').replace(/\u00a0/g, ' ').trim();
  if (!s) return null;
  s = s.replace(/^[¥￥$]\s*/, '').replace(/^RMB\s*/i, '');
  s = s.replace(/(?<=\d)[,，](?=\d{3}\b)/g, '');
  // 单位后缀默认剥离（题目给了单位时 "52元" 与 52 等价）；
  // 但只剥离「唯一一个」后缀，混杂串（"52 和 57"）仍会被下面的严格正则拒绝。
  if (options.units !== false) s = s.replace(UNIT_SUFFIX, '').trim();
  s = s.replace(/\s+/g, '');

  // 分数 a/b（题目允许时才用，调用方负责判断）
  const frac = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (frac) {
    const den = Number(frac[2]);
    if (!Number.isFinite(den) || den === 0) return null;
    const r = Number(frac[1]) / den;
    return Number.isFinite(r) ? roundTo(r, 9) : null;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  const cn = cnToInt(s);
  return cn === null ? null : cn;
}

export function roundTo(n, digits = 6) {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** 数值相等：整数精确，小数按 1e-6 相对容差（不用浮点直接 ===） */
export function sameNumber(a, b) {
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (Number.isInteger(a) && Number.isInteger(b)) return a === b;
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= 1e-6 * scale;
}

/* ------------------------------ 布尔 / 三态 ------------------------------ */

const TRUE_WORDS = ['true', 'yes', 'y', '是', '对', '需要', '要', '附', '附上', '附带', '包含', '正确', '有错', '有错误', '有误'];
const FALSE_WORDS = ['false', 'no', 'n', '否', '不是', '不对', '不需要', '不要', '不附', '不含', '不包含', '无', '没有', '正确无误', '没错', '无误'];

export function toBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : null;
  if (typeof v !== 'string') return null;
  const s = squash(v).toLowerCase();
  if (!s) return null;
  // 先匹配更长的否定形式，避免「不需要」被「需要」抢先
  for (const w of [...FALSE_WORDS].sort((a, b) => b.length - a.length)) {
    if (s === w) return false;
  }
  for (const w of [...TRUE_WORDS].sort((a, b) => b.length - a.length)) {
    if (s === w) return true;
  }
  return null;
}

/* ------------------------------ 列表 / 集合 ------------------------------ */

/** 把 JSON 数组、逗号分隔串、顿号分隔串、编号列表都转成字符串数组 */
export function toList(v) {
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === 'string' ? normText(x) : x)).filter((x) => x !== null && x !== undefined && x !== '');
  }
  if (typeof v === 'string') {
    let s = v.normalize('NFKC').replace(/\u00a0/g, ' ').trim();
    if (!s) return [];
    s = s.replace(/^\s*\[|\]\s*$/g, '');
    const parts = s
      .split(/[,，、;；\n]+|\s+\/\s+/)
      .map((x) => normText(x.replace(/^\s*(?:\d+\s*[)）.、]|[-*•])\s*/, '')))
      .filter((x) => x !== null && x !== '');
    return parts;
  }
  return [];
}

/** 去重并排序（用于集合比较；缺失与重复分开处理） */
export function normSetOf(arr, norm = normText) {
  const out = [];
  for (const x of arr) {
    const n = norm(x);
    if (n === null || n === '') continue;
    if (!out.includes(n)) out.push(n);
  }
  return out.sort();
}

/** 多重集：保留重复项，排序后比较 */
function normMultisetOf(arr, norm = normText) {
  const out = [];
  for (const x of arr) {
    const n = norm(x);
    if (n === null || n === '') continue;
    out.push(n);
  }
  return out.sort();
}

/** 无序集合相等：先各自去重再比（同一元素写两遍仍等价于写一遍） */
export function sameSet(a, b, norm = normText) {
  const na = normSetOf(a, norm);
  const nb = normSetOf(b, norm);
  if (na.length !== nb.length) return false;
  return na.every((x, i) => x === nb[i]);
}

/** 多重集相等：重复次数必须一致（用于「不能多放/少放」的严格清单题） */
export function sameMultiset(a, b, norm = normText) {
  const na = normMultisetOf(a, norm);
  const nb = normMultisetOf(b, norm);
  if (na.length !== nb.length) return false;
  return na.every((x, i) => x === nb[i]);
}

/** 有序序列相等 */
export function sameSeq(a, b, norm = normText) {
  const na = a.map(norm);
  const nb = b.map(norm);
  if (na.length !== nb.length) return false;
  return na.every((x, i) => x === nb[i]);
}

/** 文本相等，可带同义别名表（alias: 标准值 → 若干可接受写法） */
export function sameText(a, b, aliases = {}) {
  const na = squash(a);
  const nb = squash(b);
  if (na === null || nb === null) return false;
  if (na === nb) return true;
  const list = aliases[b] || [];
  return list.some((alt) => squash(alt) === na);
}

/* ------------------------------ JSON 抽取 ------------------------------ */

const FENCE = /```(?:json|JSON)?\s*([\s\S]*?)```/g;

/** 从任意文本里找出所有「看起来完整」的 JSON 对象/数组片段 */
export function extractJsonSnippets(raw) {
  if (typeof raw !== 'string') return [];
  const out = [];
  const push = (txt) => {
    const t = txt.trim();
    if (!t || (t[0] !== '{' && t[0] !== '[')) return;
    try {
      out.push({ value: JSON.parse(t), source: 'json' });
    } catch {
      /* 不是合法 JSON，忽略 */
    }
  };
  // 1) 整段
  push(raw.trim());
  // 2) 代码块
  for (const m of raw.matchAll(FENCE)) push(m[1]);
  // 3) 括号配平扫描（只在整段/代码块都失败时兜底，避免把散文里的花括号当 JSON）
  if (out.length === 0) {
    const s = raw.normalize('NFKC');
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== '{' && s[i] !== '[') continue;
      const open = s[i];
      const close = open === '{' ? '}' : ']';
      let depth = 0;
      let inStr = false;
      let esc = false;
      for (let j = i; j < s.length; j++) {
        const c = s[j];
        if (inStr) {
          if (esc) esc = false;
          else if (c === '\\') esc = true;
          else if (c === '"') inStr = false;
          continue;
        }
        if (c === '"') { inStr = true; continue; }
        if (c === open) depth++;
        else if (c === close) {
          depth--;
          if (depth === 0) {
            try {
              out.push({ value: JSON.parse(s.slice(i, j + 1)), source: 'json-embedded' });
            } catch { /* ignore */ }
            i = j;
            break;
          }
        }
      }
    }
  }
  return out;
}

function flattenKeys(obj, depth = 2) {
  const map = new Map();
  const walk = (node, level, prefix) => {
    if (!node || typeof node !== 'object' || level > depth) return;
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, level + 1, `${prefix}[${i}]`));
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      const nk = normKey(k);
      if (!map.has(nk)) map.set(nk, []);
      map.get(nk).push({ value: v, path: `${prefix}${prefix ? '.' : ''}${k}` });
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, level + 1, `${prefix}${prefix ? '.' : ''}${k}`);
    }
  };
  walk(obj, 0, '');
  return map;
}

/** 按别名（大小写/下划线/空格不敏感）在对象（含一层嵌套）里取值 */
export function pickField(obj, aliases) {
  if (!obj || typeof obj !== 'object') return { found: false, value: undefined };
  const map = flattenKeys(obj, 2);
  for (const alias of aliases) {
    const hit = map.get(normKey(alias));
    if (hit && hit.length > 0) {
      // 同名字段出现在多处且值不同 → 交给调用方判定为冲突
      const distinct = new Set(hit.map((h) => JSON.stringify(h.value)));
      return { found: true, value: hit[0].value, path: hit[0].path, conflict: distinct.size > 1, all: hit.map((h) => h.value) };
    }
  }
  return { found: false, value: undefined };
}

/** 把「Q01: 值」这类行格式拆成 {key: value} 片段 */
export function extractLines(raw) {
  if (typeof raw !== 'string') return [];
  const out = [];
  const lines = raw.normalize('NFKC').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*(?:[-*•]\s*)?([A-Za-z][A-Za-z0-9_\- ]{0,40}|[\u4e00-\u9fa5]{1,12})\s*[:：=]\s*(.+?)\s*$/u);
    if (!m) continue;
    out.push({ key: m[1].trim(), value: m[2].trim() });
  }
  return out;
}

/* ------------------------------ 通用字段解析 ------------------------------ */

/**
 * buildParse(raw, specs) → { fields, source, problems, raw }
 * specs: { fieldName: { type:'number'|'text'|'bool'|'list'|'object'|'raw', aliases:[], units?:boolean } }
 * 规则：先找 JSON；再找「key: value」行；都没有时调用 fallback(raw)。
 * 任何字段解析失败都记入 problems，绝不猜值。
 */
export function buildParse(raw, specs, fallback = null) {
  const problems = [];
  let source = 'none';
  const fields = {};
  let carrier = null;

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    carrier = raw;
    source = 'object';
  } else {
    const snippets = extractJsonSnippets(raw);
    if (snippets.length === 1) {
      carrier = snippets[0].value;
      source = snippets[0].source;
    } else if (snippets.length > 1) {
      const uniq = new Set(snippets.map((s) => JSON.stringify(s.value)));
      if (uniq.size === 1) {
        carrier = snippets[0].value;
        source = snippets[0].source;
      } else {
        problems.push('检测到多个互相冲突的 JSON 片段，无法判断哪个是最终答案');
      }
    }
  }

  if (carrier && typeof carrier === 'object' && !Array.isArray(carrier)) {
    for (const [name, spec] of Object.entries(specs)) {
      const aliases = spec.aliases || [name];
      const hit = pickField(carrier, aliases);
      if (!hit.found) { problems.push(`缺少字段 ${name}`); continue; }
      if (hit.conflict) { problems.push(`字段 ${name} 存在多个冲突值`); continue; }
      const typed = coerce(hit.value, spec);
      if (typed === null || typed === undefined) { problems.push(`字段 ${name} 无法解析为 ${spec.type}`); continue; }
      fields[name] = typed;
    }
    return { fields, source, problems, raw };
  }

  // 行格式兜底
  if (typeof raw === 'string') {
    const lines = extractLines(raw);
    if (lines.length) {
      let used = 0;
      for (const [name, spec] of Object.entries(specs)) {
        const aliases = spec.aliases || [name];
        const normAliases = new Set(aliases.map(normKey));
        const hits = lines.filter((l) => normAliases.has(normKey(l.key)));
        if (hits.length === 0) continue;
        const vals = new Set(hits.map((h) => squash(h.value)));
        if (vals.size > 1) { problems.push(`字段 ${name} 存在多个冲突值`); continue; }
        const typed = coerce(hits[0].value, spec);
        if (typed === null || typed === undefined) { problems.push(`字段 ${name} 无法解析为 ${spec.type}`); continue; }
        fields[name] = typed;
        used++;
      }
      if (used > 0) return { fields, source: 'lines', problems, raw };
    }
  }

  if (typeof fallback === 'function') {
    // 关键：如果前面已经发现「多个互相冲突的候选值」，绝不能再用宽松的散文兜底
    // 去挑一个有利的出来 —— 那等于替答题者做选择，是可解释性红线。
    const hasConflict = problems.some((p) => p.includes('冲突'));
    if (hasConflict) return { fields, source, problems, raw };
    const r = fallback(raw);
    if (r) {
      for (const [k, v] of Object.entries(r.fields || {})) fields[k] = v;
      if (r.problems) problems.push(...r.problems);
      return { fields, source: r.source || 'prose', problems, raw };
    }
  }
  return { fields, source, problems, raw };
}

export function coerce(v, spec) {
  switch (spec.type) {
    case 'number':
      return toNumber(v, { units: spec.units !== false });
    case 'bool':
      return toBool(v);
    case 'text':
      return normText(v);
    case 'list': {
      if (Array.isArray(v)) {
        const mapped = v.map((x) => (typeof x === 'string' ? normText(x) : x)).filter((x) => x !== null && x !== '');
        return mapped.length ? mapped : null;
      }
      const list = toList(v);
      return list.length ? list : null;
    }
    case 'raw':
      return v;
    case 'object':
      return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    default:
      return null;
  }
}

/**
 * 判定权重：把一次评分归纳为 COMPLETED / NEEDS_REVIEW。
 * 只有「完全没有任何可识别内容」才进入 NEEDS_REVIEW；
 * 「有内容但漏字段」按该条件未通过处理（这是能力问题，不是解析故障）。
 */
export function parseOutcome(parsed, minUsableFields = 1) {
  const got = Object.keys(parsed.fields || {}).length;
  if (got >= minUsableFields) return 'PARSED';
  if (typeof parsed.raw === 'string' && parsed.raw.trim().length > 0) return 'NEEDS_REVIEW';
  return 'EMPTY';
}
