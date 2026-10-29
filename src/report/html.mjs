/**
 * 自包含 HTML 报告生成器。
 * 硬性约束：零外链（无 CDN、无远程字体、无追踪脚本），file:// 双击即可看。
 */
import { LEVELS, DIMENSIONS, EXAM_VERSION, GRADER_VERSION } from '../exam/manifest.mjs';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const STATUS_LABEL = {
  COMPLETED: '已完成',
  PARTIAL: '部分完成（含待复核题）',
  NEEDS_REVIEW: '待复核',
  SYSTEM_ERROR: '系统错误',
  MISSING_ANSWER: '缺答',
  UNPARSEABLE: '无法解析',
  SCORER_ERROR: '评分器错误',
  GRADED: '已判分',
};

const STATUS_CLASS = {
  COMPLETED: 'ok',
  PARTIAL: 'warn',
  NEEDS_REVIEW: 'warn',
  SYSTEM_ERROR: 'bad',
  MISSING_ANSWER: 'bad',
  UNPARSEABLE: 'warn',
  SCORER_ERROR: 'bad',
  GRADED: 'ok',
};

function bar(pct, cls = '') {
  return `<div class="bar ${cls}"><span style="width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%"></span></div>`;
}

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { hour12: false });
  } catch {
    return esc(iso);
  }
}

export function renderHtml(report) {
  const { summary, items, meta } = report;
  const isDemo = report.demo === true;
  const score = summary.total;
  const max = summary.maxTotal || 100;
  const pct = (score / max) * 100;
  const level = summary.level || '待复核';
  const pending = summary.pendingCount || 0;
  const dimBars = summary.dimensions
    .map((d) => {
      const p = d.max ? (d.awarded / d.max) * 100 : 0;
      return `<div class="dim">
        <div class="dim-head"><span>${esc(d.label)}</span><b>${d.awarded}<i>/${d.max}</i></b></div>
        ${bar(p)}
      </div>`;
    })
    .join('');

  const itemRows = items
    .map((it) => {
      const checks = it.checks
        .map(
          (c) => `<li class="${c.passed ? 'pass' : 'fail'}">
            <span class="tag">${c.passed ? 'PASS' : 'FAIL'}</span>
            <span class="ck-id">${esc(c.criterionId)}</span>
            <span class="ck-pts">${c.points}分</span>
            <span class="ck-reason">${esc(c.reason)}</span>
          </li>`,
        )
        .join('');
      const parsed = it.parsedAnswer && Object.keys(it.parsedAnswer).length
        ? `<pre class="parsed">${esc(JSON.stringify(it.parsedAnswer, null, 2))}</pre>`
        : '<p class="muted">（无可用的解析结果）</p>';
      const notes = (it.parseNotes || []).length
        ? `<p class="muted small">解析备注：${esc(it.parseNotes.join('；'))}</p>`
        : '';
      return `<details class="item">
        <summary>
          <span class="iid">${esc(it.id)}</span>
          <span class="ititle">${esc(it.title || '')}</span>
          <span class="ipoints">${it.awarded}/${it.maxPoints}</span>
          <span class="pill ${STATUS_CLASS[it.gradingStatus] || ''}">${esc(STATUS_LABEL[it.gradingStatus] || it.gradingStatus)}</span>
        </summary>
        <div class="item-body">
          <ul class="checks">${checks}</ul>
          <div class="parsed-wrap"><div class="label">解析后的答案</div>${parsed}</div>
          ${notes}
          <p class="muted small">答案指纹 SHA-256：<code>${esc((it.rawAnswerSha256 || '').slice(0, 16))}…</code> · 判分器 v${esc(it.graderVersion)}</p>
        </div>
      </details>`;
    })
    .join('');

  const levelLadder = LEVELS.map(
    (l) => `<div class="lvl ${summary.level === l.label ? 'cur' : ''}">
      <span>${esc(l.label)}</span><small>${l.min}–${l.max}</small>
    </div>`,
  ).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>乐子跑分 LeziBench · ${esc(report.runId || 'Report')}</title>
<style>
:root{
  --bg:#0f1115; --card:#171a21; --card2:#1e222b; --line:#2a2f3a;
  --fg:#e8eaf0; --muted:#98a0b3; --accent:#ffb84d; --ok:#3ddc97; --warn:#ffcc55; --bad:#ff6b6b;
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
}
@media (prefers-color-scheme: light){
  :root{--bg:#f6f7fb;--card:#fff;--card2:#f1f3f8;--line:#e2e6ef;--fg:#1b1f2a;--muted:#5c6478;}
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--font);line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:920px;margin:0 auto;padding:28px 18px 64px}
header{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:6px}
h1{font-size:22px;margin:0;letter-spacing:.5px}
.brand-sub{color:var(--muted);font-size:13px}
.demo{display:inline-block;background:var(--accent);color:#1b1b1b;font-weight:700;font-size:12px;padding:2px 10px;border-radius:999px;letter-spacing:1px}
.hero{background:linear-gradient(160deg,var(--card),var(--card2));border:1px solid var(--line);border-radius:18px;padding:26px;margin:18px 0 16px;position:relative;overflow:hidden}
.hero:after{content:"";position:absolute;right:-60px;top:-60px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(255,184,77,.22),transparent 65%)}
.score{display:flex;align-items:flex-end;gap:10px}
.score b{font-size:64px;line-height:1;font-variant-numeric:tabular-nums}
.score .of{font-size:18px;color:var(--muted);padding-bottom:8px}
.lvl-tag{margin-left:auto;font-size:20px;font-weight:700;color:var(--accent);padding-bottom:8px}
.conclusion{color:var(--muted);margin:12px 0 0;font-size:14px}
.bar{height:9px;background:rgba(128,128,128,.22);border-radius:999px;overflow:hidden}
.bar span{display:block;height:100%;background:linear-gradient(90deg,#ffb84d,#ff8a3d);border-radius:999px}
.dims{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin:16px 0}
.dim{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}
.dim-head{display:flex;justify-content:space-between;font-size:14px;margin-bottom:8px}
.dim-head b{font-variant-numeric:tabular-nums}
.dim-head i{color:var(--muted);font-style:normal;font-weight:400}
.ladder{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 24px}
.lvl{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:5px 12px;font-size:13px;color:var(--muted)}
.lvl small{margin-left:6px;opacity:.7}
.lvl.cur{border-color:var(--accent);color:var(--accent);font-weight:700}
.section-title{font-size:15px;margin:26px 0 12px;color:var(--muted);letter-spacing:1px;text-transform:uppercase}
.item{background:var(--card);border:1px solid var(--line);border-radius:12px;margin-bottom:10px;overflow:hidden}
.item summary{display:flex;align-items:center;gap:12px;padding:13px 16px;cursor:pointer;list-style:none}
.item summary::-webkit-details-marker{display:none}
.iid{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:700;color:var(--accent);min-width:40px}
.ititle{flex:1;font-size:14px}
.ipoints{font-variant-numeric:tabular-nums;font-weight:700}
.pill{font-size:11px;padding:2px 9px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
.pill.ok{color:var(--ok);border-color:rgba(61,220,151,.4)}
.pill.warn{color:var(--warn);border-color:rgba(255,204,85,.4)}
.pill.bad{color:var(--bad);border-color:rgba(255,107,107,.4)}
.item-body{padding:4px 16px 16px;border-top:1px solid var(--line)}
.checks{list-style:none;padding:0;margin:12px 0}
.checks li{display:flex;gap:10px;align-items:baseline;padding:6px 0;font-size:13.5px;border-bottom:1px dashed rgba(128,128,128,.16)}
.checks li:last-child{border-bottom:0}
.tag{font-size:11px;font-weight:700;padding:1px 7px;border-radius:5px;flex:none}
.pass .tag{background:rgba(61,220,151,.16);color:var(--ok)}
.fail .tag{background:rgba(255,107,107,.16);color:var(--bad)}
.ck-id{font-family:ui-monospace,monospace;color:var(--muted);flex:none}
.ck-pts{color:var(--muted);flex:none;font-size:12px}
.ck-reason{flex:1}
.parsed-wrap{margin-top:12px}
.label{font-size:12px;color:var(--muted);margin-bottom:6px}
pre.parsed{background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto;font-size:12.5px;margin:0;max-height:320px}
code{font-family:ui-monospace,monospace;font-size:12px}
.muted{color:var(--muted)}
.small{font-size:12px}
.meta{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;font-size:13px}
.meta dl{display:grid;grid-template-columns:130px 1fr;gap:6px 14px;margin:0}
.meta dt{color:var(--muted)}
.meta dd{margin:0;word-break:break-all}
.disclaimer{margin-top:22px;padding:14px 16px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);font-size:12.5px}
footer{margin-top:26px;color:var(--muted);font-size:12px;text-align:center}
@media print{body{background:#fff;color:#000}.item,.hero,.dim,.meta{border-color:#ddd}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>乐子跑分 <span class="brand-sub">LeziBench</span></h1>
    ${isDemo ? '<span class="demo">DEMO · 演示数据</span>' : ''}
    <span class="brand-sub">名字轻松，成绩认真。</span>
  </header>

  <section class="hero">
    <div class="score">
      <b>${score}</b><span class="of">/ ${max}</span>
      <span class="lvl-tag">${esc(level)}</span>
    </div>
    ${bar(pct)}
    <p class="conclusion">${esc(conclusionText(summary))}</p>
  </section>

  <div class="dims">${dimBars}</div>
  <div class="ladder">${levelLadder}</div>

  <div class="section-title">逐题判分依据（点击展开）</div>
  ${itemRows}

  <div class="section-title">运行信息</div>
  <div class="meta">
    <dl>
      <dt>运行编号</dt><dd><code>${esc(report.runId || '—')}</code></dd>
      <dt>成绩状态</dt><dd><b>${esc(STATUS_LABEL[summary.status] || summary.status)}</b>${pending ? `（${pending} 题待复核：${esc((summary.pendingIds || []).join(', '))}）` : ''}</dd>
      <dt>题库版本</dt><dd>exam v${esc(meta.examVersion || EXAM_VERSION)} · 契约 v${esc(meta.contractVersion || '1.0.0')}</dd>
      <dt>判分器版本</dt><dd>grader v${esc(meta.graderVersion || GRADER_VERSION)}</dd>
      <dt>随机种子</dt><dd><code>${esc(report.seed || '—')}</code></dd>
      <dt>题库指纹</dt><dd><code>${esc(meta.catalogFingerprint || '—')}</code></dd>
      <dt>开始时间</dt><dd>${fmtTime(report.startedAt)}</dd>
      <dt>结束时间</dt><dd>${fmtTime(report.finishedAt)}</dd>
      <dt>总耗时</dt><dd>${report.durationMs != null ? `${(report.durationMs / 1000).toFixed(1)} 秒` : '—'}</dd>
      <dt>运行环境</dt><dd>${esc(report.environment || '—')}</dd>
      <dt>成绩性质</dt><dd><b>本地规则核验 · 非认证成绩（LOCAL_SELF_TEST）</b></dd>
    </dl>
  </div>

  <div class="disclaimer">
    <b>关于这份成绩</b>：本报告由你本机的 <code>lezi-bench</code> 判分器依据公开评分规则逐条核验生成，未使用任何在线模型给自己打分。
    题库与判分器均为公开源码，因此它<strong>不能</strong>防止有意改题、改答案或改判分器，也<strong>不是</strong>权威认证或全球排行榜。
    请只与<strong>同题库版本、同判分器版本</strong>的成绩比较。
  </div>
  <footer>LeziBench ${esc(meta.examVersion || EXAM_VERSION)} · 由本地脚本生成，无外部资源、无追踪</footer>
</div>
</body>
</html>
`;
}

export function conclusionText(summary) {
  if (summary.status !== 'COMPLETED') return '本次存在待复核题目，暂不给出完整总分评价。';
  const t = summary.total;
  if (t >= 90) return '四个方向都相当稳定，可以放心把常规整理与推理任务交给它。';
  if (t >= 80) return '整体扎实，个别条件下会掉分，建议看逐题理由里的失分点。';
  if (t >= 65) return '基本能力可用，复杂条件组合和细节校验上还有明显短板。';
  if (t >= 50) return '简单任务能完成，多条件与状态更新类任务容易出错。';
  return '本次分数偏低，建议先看逐题理由，确认是理解偏差还是格式问题。';
}

/** 终端 / 聊天用的紧凑摘要（纯文本，便于 Agent 直接贴出） */
export function renderSummaryText(report) {
  const { summary, items, meta } = report;
  const lines = [];
  const statusText = STATUS_LABEL[summary.status] || summary.status;
  lines.push(`乐子跑分 LeziBench · ${summary.status === 'COMPLETED' ? '标准局成绩' : '标准局（未完成）'}`);
  lines.push('');
  if (summary.status === 'COMPLETED') {
    lines.push(`总分：${summary.total} / ${summary.maxTotal}　段位：${summary.level}`);
  } else {
    lines.push(`已判得分：${summary.total} / ${summary.maxTotal}　状态：${statusText}`);
    if (summary.pendingIds?.length) lines.push(`待复核题目：${summary.pendingIds.join(', ')}`);
  }
  lines.push('');
  for (const d of summary.dimensions) {
    const p = d.max ? (d.awarded / d.max) * 100 : 0;
    const filled = Math.round(p / 10);
    lines.push(`  ${d.label.padEnd(7, '　')} ${String(d.awarded).padStart(2)}/${d.max}  ${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`);
  }
  lines.push('');
  const lost = items.filter((i) => i.awarded < i.maxPoints);
  if (lost.length === 0) {
    lines.push('本次全部题目满分。');
  } else {
    lines.push(`失分题（${lost.length}）：`);
    for (const it of lost) {
      const failed = it.checks.filter((c) => !c.passed).map((c) => `${c.criterionId} ${c.reason}`);
      lines.push(`  · ${it.id} ${it.title}　${it.awarded}/${it.maxPoints}`);
      for (const f of failed) lines.push(`      - ${f}`);
    }
  }
  lines.push('');
  lines.push(`题库 exam v${meta.examVersion} · 判分器 grader v${meta.graderVersion} · 种子 ${report.seed}`);
  if (report.durationMs != null) lines.push(`实测耗时：${(report.durationMs / 1000).toFixed(1)} 秒`);
  lines.push(`成绩性质：本地规则核验 · 非认证成绩（LOCAL_SELF_TEST）`);
  return lines.join('\n');
}

export { esc, DIMENSIONS };
