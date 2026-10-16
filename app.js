import { connect } from './db.js';

/* ───────────── utilidades ───────────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 0 });
const money = n => (n < 0 ? '-' : '') + '₡' + nf.format(Math.abs(Math.round(n || 0)));
const moneyK = n => { const a = Math.abs(n); const s = a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M' : a >= 1e3 ? Math.round(a / 1e3) + 'k' : Math.round(a); return (n < 0 ? '-' : '') + '₡' + s; };
const pct = (n, d = 0) => ((n || 0) * 100).toFixed(d) + '%';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const store = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { } } };
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const ym = d => ymd(d).slice(0, 7);
const todayStr = () => ymd(new Date());
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesLabel = k => { const [y, m] = k.split('-'); return MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1) + ' ' + y; };
const mesShort = k => { const [y, m] = k.split('-'); return MESES[m - 1].slice(0, 3) + " '" + y.slice(2); };
const addMonths = (k, n) => { const [y, m] = k.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return ym(d); };
const fechaCorta = f => { if (!f) return ''; const [y, m, d] = f.split('-'); return `${d}/${m}/${y.slice(2)}`; };
const quincenaDe = f => (+f.slice(8, 10) <= 15 ? 'Primera' : 'Segunda');
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const COLORS = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8', '--c9', '--c10'].map(v => `var(${v})`);

const FACT = { Diario: 30, Semanal: 4.33, Quincenal: 2, Mensual: 1, BiMensual: 0.5, Trimestral: 1 / 3, Cuatrimestral: 1 / 4, Semestral: 1 / 6, Anual: 1 / 12 };
const PERIODS = Object.keys(FACT);
const ING_PERIODS = ['Semanal', 'Quincenal', 'Mensual', 'Anual', 'Puntual'];

/* ───────────── estado ───────────── */
const S = { categorias: [], ingresos: [], gastos: [], metas: [], loaded: {}, mes: store.get('cff_mes', ym(new Date())), view: 'dashboard', db: null,
  f: { q: '', cat: '', ing: '', quin: '', all: false } };
let sim = { red: {}, extra: 0 };

/* ───────────── modelo financiero ───────────── */
function ingresoMes(i, mes) {
  if (i.periodicidad === 'Puntual') return (i.fecha || '').startsWith(mes) ? i.monto : 0;
  return i.monto * (FACT[i.periodicidad] ?? 1);
}
const ingNombre = g => { const i = S.ingresos.find(x => x.id === g.ingresoId); return i ? i.descripcion : (g.ingresoNombre || ''); };

function model(mes) {
  const [Y, M] = mes.split('-').map(Number);
  const dim = new Date(Y, M, 0).getDate();
  const now = new Date(), cur = ym(now);
  const isCur = mes === cur, isPast = mes < cur;
  const elapsed = isCur ? now.getDate() : isPast ? dim : 0;
  const gM = S.gastos.filter(g => (g.fecha || '').startsWith(mes));
  const ingresos = S.ingresos.reduce((a, i) => a + ingresoMes(i, mes), 0);
  const gasto = gM.reduce((a, g) => a + g.monto, 0);

  const names = new Set(S.categorias.filter(c => c.tipo === 'Gasto').map(c => c.nombre));
  gM.forEach(g => names.add(g.categoria));
  const cats = [...names].map(nombre => {
    const c = S.categorias.find(x => x.tipo === 'Gasto' && x.nombre === nombre) || {};
    const spent = gM.filter(g => g.categoria === nombre).reduce((a, g) => a + g.monto, 0);
    const per = c.periodicidad || 'Mensual';
    const budget = (c.presupuesto || 0) * (FACT[per] ?? 1);
    let proj;
    if (isPast) proj = spent;
    else if (!isCur) proj = budget;
    else {
      const w = elapsed / dim, rate = elapsed ? spent / elapsed * dim : 0;
      const exp = budget > 0 ? w * rate + (1 - w) * budget : rate;
      proj = Math.max(spent, exp);
    }
    return { nombre, id: c.id, spent, per, presupuesto: c.presupuesto || 0, budget, proj, over: budget > 0 && proj > budget * 1.0001, pctIng: ingresos ? spent / ingresos : 0 };
  }).sort((a, b) => b.spent - a.spent || b.proj - a.proj);

  const projGasto = cats.reduce((a, c) => a + c.proj, 0);
  const budgetTotal = cats.reduce((a, c) => a + c.budget, 0);
  const balance = ingresos - gasto, balanceProj = ingresos - projGasto;
  const tasa = ingresos ? balance / ingresos : 0, tasaProj = ingresos ? balanceProj / ingresos : 0;
  const dailyRate = elapsed ? gasto / elapsed : 0;
  const restantes = isCur ? dim - elapsed : (isPast ? 0 : dim);
  const dispDia = restantes > 0 ? Math.max(balance, 0) / restantes : 0;
  const coverDays = dailyRate > 0 ? Math.max(balance, 0) / dailyRate : Infinity;
  const runOutDay = isCur && dailyRate > 0 && balance > 0 && coverDays < restantes ? elapsed + Math.floor(coverDays) : null;

  // salud financiera (0-100)
  const budgeted = cats.filter(c => c.budget > 0);
  const adherence = budgeted.length ? budgeted.filter(c => !c.over).length / budgeted.length : 0.5;
  const sScore = clamp(tasaProj / 0.2, 0, 1) * 50 + adherence * 30 + (balanceProj >= 0 ? 20 : clamp(20 + (ingresos ? balanceProj / ingresos : -1) * 100, 0, 20));
  const score = ingresos ? Math.round(sScore) : 0;

  // historial y pronóstico
  const byMonth = {};
  S.gastos.forEach(g => { const k = (g.fecha || '').slice(0, 7); if (k) byMonth[k] = (byMonth[k] || 0) + g.monto; });
  byMonth[mes] = isCur || !isPast ? projGasto : (byMonth[mes] || 0);
  let keys = Object.keys(byMonth).filter(k => k <= mes).sort().slice(-6);
  if (!keys.includes(mes)) keys.push(mes);
  const pts = keys.map((k, i) => [i, byMonth[k]]);
  const real = keys.map(k => k === mes && isCur ? gasto : byMonth[k]);
  let slope = 0, icpt = pts[pts.length - 1][1];
  if (pts.length >= 2) {
    const n = pts.length, sx = pts.reduce((a, p) => a + p[0], 0), sy = pts.reduce((a, p) => a + p[1], 0);
    const sxy = pts.reduce((a, p) => a + p[0] * p[1], 0), sxx = pts.reduce((a, p) => a + p[0] * p[0], 0);
    const den = n * sxx - sx * sx; slope = den ? (n * sxy - sx * sy) / den : 0; icpt = (sy - slope * sx) / n;
  }
  const last = pts.length - 1;
  const forecast = [1, 2, 3].map(j => ({ k: addMonths(mes, j), v: Math.max(0, pts.length >= 2 ? icpt + slope * (last + j) : projGasto) }));
  return { mes, dim, isCur, isPast, elapsed, restantes, gM, ingresos, gasto, cats, projGasto, budgetTotal, balance, balanceProj, tasa, tasaProj, dailyRate, dispDia, coverDays, runOutDay, score, keys, hist: keys.map((k, i) => ({ k, v: pts[i][1], real: real[i] })), forecast, slope, nHist: pts.length };
}

function recomendaciones(m) {
  const r = [];
  if (!S.ingresos.length) r.push(['warn', '📥', 'Aún no hay ingresos registrados. Agrégalos para calcular balance, ahorro y proyecciones.']);
  if (!m.gM.length) r.push(['warn', '🧾', `No hay gastos registrados en ${mesLabel(m.mes)}.`]);
  if (m.ingresos) {
    const t = m.tasaProj;
    if (t >= 0.2) r.push(['ok', '✅', `Vas a cerrar el mes ahorrando ~${pct(t)} (${money(m.balanceProj)}). Considera destinar parte a inversión o a tus metas.`]);
    else if (t >= 0.1) r.push(['warn', '⚠️', `Ahorro proyectado de ${pct(t)}. Para llegar al 20% recomendado necesitas recortar ${money(m.ingresos * 0.2 - m.balanceProj)}.`]);
    else if (t >= 0) r.push(['warn', '⚠️', `Ahorro proyectado bajo (${pct(t)}). Revisa gastos variables y categorías excedidas.`]);
    else r.push(['bad', '🚨', `Déficit proyectado de ${money(-m.balanceProj)} al cierre del mes. Prioriza recortes en las categorías excedidas.`]);
    if (m.projGasto / m.ingresos > 0.8) r.push(['bad', '📉', `Tus gastos proyectados son ${pct(m.projGasto / m.ingresos)} del ingreso: poco margen ante imprevistos.`]);
  }
  if (m.runOutDay) r.push(['bad', '⏳', `Al ritmo actual (${money(m.dailyRate)}/día) los fondos del mes se agotarían hacia el día ${m.runOutDay}. Reduce el gasto diario a ${money(m.dispDia)} o menos.`]);
  m.cats.filter(c => c.over).slice(0, 3).forEach(c => r.push(['bad', '🔴', `${c.nombre}: proyección ${money(c.proj)} vs presupuesto ${money(c.budget)} (exceso ${money(c.proj - c.budget)}).`]));
  const top = m.cats[0];
  if (top && m.gasto > 0 && top.spent / m.gasto > 0.35) r.push(['warn', '🍽️', `${top.nombre} concentra el ${pct(top.spent / m.gasto)} de tus gastos. Es la mayor palanca para ahorrar.`]);
  const sinIng = m.gM.filter(g => !ingNombre(g)).length;
  if (sinIng) r.push(['warn', '🔗', `${sinIng} gasto(s) no tienen ingreso asociado; asócialos para saber de dónde sale cada colón.`]);
  const sinPres = m.cats.filter(c => c.spent > 0 && !c.budget);
  if (sinPres.length) r.push(['warn', '🎯', `Sin presupuesto definido en: ${sinPres.slice(0, 4).map(c => c.nombre).join(', ')}. Defínelo en Presupuesto para recibir alertas.`]);
  if (m.nHist < 3) r.push(['warn', '📈', 'Registra al menos 3 meses de gastos para que el pronóstico use tendencia real y no solo el ritmo actual.']);
  if (m.trendMsg) r.push(['ok', '📊', m.trendMsg]);
  if (m.nHist >= 3) { const up = m.slope > m.ingresos * 0.02; r.push([up ? 'warn' : 'ok', up ? '📈' : '📉', up ? `Tus gastos vienen subiendo ~${money(m.slope)} por mes. Si sigue así, en 3 meses gastarás ${money(m.forecast[2].v)}.` : 'La tendencia de tus gastos es estable o a la baja. ¡Buen control!']); }
  if (!r.length) r.push(['ok', '👍', 'Todo en orden. Sigue registrando tus gastos.']);
  return r;
}

/* ───────────── gráficos SVG ───────────── */
function donut(items) {
  const total = items.reduce((a, i) => a + i.value, 0);
  if (!total) return '<div class="empty">Sin datos</div>';
  const R = 70, C = 2 * Math.PI * R; let off = 0;
  const segs = items.map(i => { const len = i.value / total * C; const s = `<circle r="${R}" cx="100" cy="100" fill="none" stroke="${i.color}" stroke-width="30" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 100 100)"><title>${esc(i.label)}: ${money(i.value)} (${pct(i.value / total, 1)})</title></circle>`; off += len; return s; }).join('');
  return `<div class="donut-wrap"><svg viewBox="0 0 200 200" role="img" aria-label="Gasto por categoría">${segs}<text x="100" y="97" text-anchor="middle" style="font-size:12px">Total</text><text x="100" y="118" text-anchor="middle" style="font-size:17px;font-weight:800;fill:var(--ink)">${moneyK(total)}</text></svg>
  <div class="legend">${items.map(i => `<div><i style="background:${i.color}"></i><span class="nm">${esc(i.label)}</span><b>${pct(i.value / total)}</b></div>`).join('')}</div></div>`;
}
function lineChart({ labels, series, h = 230, xEvery = 1 }) {
  const W = 640, p = { l: 50, r: 14, t: 12, b: 26 };
  const vals = series.flatMap(s => s.values.filter(v => v != null));
  let max = Math.max(...vals, 1); const mag = 10 ** Math.floor(Math.log10(max)); max = Math.ceil(max / (mag / 2)) * (mag / 2);
  const n = labels.length, x = i => p.l + (W - p.l - p.r) * (n > 1 ? i / (n - 1) : .5), y = v => p.t + (h - p.t - p.b) * (1 - v / max);
  let g = '';
  for (let i = 0; i <= 4; i++) { const v = max * i / 4; g += `<line x1="${p.l}" x2="${W - p.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${p.l - 6}" y="${y(v) + 4}" text-anchor="end">${moneyK(v)}</text>`; }
  labels.forEach((l, i) => { if (i % xEvery === 0 || i === n - 1) g += `<text x="${x(i)}" y="${h - 6}" text-anchor="middle">${esc(l)}</text>`; });
  const paths = series.map(s => {
    let d = '', open = false;
    s.values.forEach((v, i) => { if (v == null) { open = false; return; } d += (open ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); open = true; });
    const dots = s.dots ? s.values.map((v, i) => v == null ? '' : `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="${s.color}"><title>${esc(s.name)} · ${esc(labels[i])}: ${money(v)}</title></circle>`).join('') : '';
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.4" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
  }).join('');
  const lg = series.map(s => `<span style="display:inline-flex;align-items:center;gap:6px;margin-right:14px;font-size:12.5px;color:var(--muted)"><i style="width:18px;height:0;border-top:3px ${s.dash ? 'dashed' : 'solid'} ${s.color}"></i>${esc(s.name)}</span>`).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${h}" role="img">${g}${paths}</svg><div style="margin-top:6px">${lg}</div>`;
}
function scoreRing(score) {
  const R = 54, C = 2 * Math.PI * R, col = score >= 75 ? 'var(--ok)' : score >= 55 ? 'var(--c5)' : score >= 35 ? 'var(--warn)' : 'var(--bad)';
  return `<div class="score"><svg viewBox="0 0 132 132"><circle cx="66" cy="66" r="${R}" fill="none" stroke="var(--surface2)" stroke-width="12"/><circle cx="66" cy="66" r="${R}" fill="none" stroke="${col}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${score / 100 * C} ${C}" transform="rotate(-90 66 66)"/></svg><div class="n"><div>${score}<small>de 100</small></div></div></div>`;
}
const barHtml = (v, max, cls = '') => `<div class="bar ${cls}"><i style="width:${clamp(max ? v / max * 100 : 0, 0, 100)}%"></i></div>`;
const estadoPill = c => !c.budget ? '<span class="pill mute">Sin presupuesto</span>' : c.spent > c.budget ? '<span class="pill bad">🔴 Excedido</span>' : c.over ? '<span class="pill warn">⚠️ Se excederá</span>' : '<span class="pill ok">🟢 En meta</span>';

/* ───────────── vistas ───────────── */
const VIEWS = {
  dashboard: { t: 'Resumen', i: '📊', r: vDashboard },
  gastos: { t: 'Gastos', i: '🧾', r: vGastos },
  ingresos: { t: 'Ingresos', i: '💰', r: vIngresos },
  presupuesto: { t: 'Presupuesto', i: '🎯', r: vPresupuesto },
  decisiones: { t: 'Decisiones', i: '🧭', r: vDecisiones },
  categorias: { t: 'Categorías', i: '🏷️', r: vCategorias },
  ajustes: { t: 'Ajustes', i: '⚙️', r: vAjustes },
};

function emptyState() {
  return `<div class="card empty"><div class="big">👋</div><h3>¡Bienvenido! Empecemos</h3><p>Aún no tienes datos. Puedes cargar los datos de tu Excel de ejemplo (categorías, presupuesto, ingresos y gastos) o empezar desde cero.</p>
  <div class="toolbar" style="justify-content:center;margin-top:12px"><button class="btn primary" data-act="seed">📥 Cargar datos del Excel</button><button class="btn" data-act="newCatDefaults">✨ Crear categorías básicas</button><button class="btn" data-act="newIng">＋ Registrar un ingreso</button></div></div>`;
}

function vDashboard() {
  if (!S.categorias.length && !S.ingresos.length && !S.gastos.length) return emptyState();
  const m = model(S.mes);
  const label = m.score >= 75 ? 'Salud financiera excelente' : m.score >= 55 ? 'Salud financiera buena' : m.score >= 35 ? 'Requiere atención' : 'Situación crítica';
  const cierre = m.isPast ? 'Cierre del mes' : m.isCur ? 'Proyección al cierre' : 'Estimado del mes';
  const kpi = (l, v, note, cls = '') => `<div class="card kpi ${cls}"><span class="lbl">${l}</span><span class="val">${v}</span><span class="note">${note}</span></div>`;
  const catItems = m.cats.filter(c => c.spent > 0).map((c, i) => ({ label: c.nombre, value: c.spent, color: COLORS[i % COLORS.length] }));
  const cum = []; let acc = 0;
  for (let d = 1; d <= m.dim; d++) { const dd = String(d).padStart(2, '0'); acc += m.gM.filter(g => g.fecha.slice(8, 10) === dd).reduce((a, g) => a + g.monto, 0); cum.push(d <= (m.isCur ? m.elapsed : m.isPast ? m.dim : 0) ? acc : null); }
  const lastD = m.isCur ? m.elapsed : m.dim;
  const projLine = m.isCur ? cum.map((v, i) => i + 1 === lastD ? v : i + 1 > lastD ? (cum[lastD - 1] ?? 0) + (m.projGasto - (cum[lastD - 1] ?? 0)) * (i + 1 - lastD) / (m.dim - lastD || 1) : null) : null;
  const pace = Array.from({ length: m.dim }, (_, i) => m.budgetTotal * (i + 1) / m.dim);
  const flatIng = Array(m.dim).fill(m.ingresos);
  const trend = lineChart({
    labels: [...m.hist.map(h => mesShort(h.k)), ...m.forecast.map(f => mesShort(f.k))],
    series: [
      { name: 'Gasto real / proyectado', color: 'var(--brand)', dots: true, values: [...m.hist.map(h => h.v), ...m.forecast.map(() => null)] },
      { name: 'Pronóstico', color: 'var(--c2)', dash: '6 5', dots: true, values: [...m.hist.map((h, i) => i === m.hist.length - 1 ? h.v : null), ...m.forecast.map(f => f.v)] },
      { name: 'Ingreso mensual', color: 'var(--ok)', dash: '2 4', values: Array(m.hist.length + 3).fill(m.ingresos) }]
  });
  const topG = [...m.gM].sort((a, b) => b.monto - a.monto).slice(0, 5);
  const porPer = PERIODS.map(p => { const cs = m.cats.filter(c => c.per === p && (c.presupuesto || c.spent)); return { p, real: cs.reduce((a, c) => a + c.spent, 0), pres: cs.reduce((a, c) => a + c.presupuesto, 0) }; }).filter(x => x.real || x.pres);
  const ingUso = S.ingresos.map(i => { const usado = m.gM.filter(g => g.ingresoId === i.id || (!g.ingresoId && g.ingresoNombre === i.descripcion)).reduce((a, g) => a + g.monto, 0); const mm = ingresoMes(i, m.mes); return { i, usado, mm }; });
  const maxCat = Math.max(...m.cats.map(c => Math.max(c.spent, c.budget, c.proj)), 1);
  return `
  <div class="card hero">${scoreRing(m.score)}<div><h2>${label}</h2>
    <p>${m.ingresos ? `${mesLabel(m.mes)}: ${cierre.toLowerCase()} de <b>${money(m.projGasto)}</b> en gastos sobre <b>${money(m.ingresos)}</b> de ingresos → balance estimado <b style="color:var(--${m.balanceProj >= 0 ? 'ok' : 'bad'})">${money(m.balanceProj)}</b> (${pct(m.tasaProj)} de ahorro).` : 'Registra ingresos para calcular tu salud financiera.'}</p>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">${m.tasaProj >= .2 ? '<span class="pill ok">🟢 Excelente ahorro (≥20%)</span>' : m.tasaProj >= .1 ? '<span class="pill warn">🟡 Ahorro aceptable (10-20%)</span>' : m.tasaProj >= 0 ? '<span class="pill warn">🟠 Ahorro bajo (<10%)</span>' : '<span class="pill bad">🔴 Déficit</span>'}
    ${m.runOutDay ? `<span class="pill bad">⏳ Fondos hasta el día ${m.runOutDay}</span>` : ''}<span class="pill mute">${m.cats.filter(c => c.over).length} categoría(s) en riesgo</span></div></div></div>

  <div class="grid g-kpi">
    ${kpi('Ingresos del mes', money(m.ingresos), `${S.ingresos.length} fuente(s) · normalizado`)}
    ${kpi('Gastos a la fecha', money(m.gasto), `${m.gM.length} registros · ${pct(m.ingresos ? m.gasto / m.ingresos : 0)} del ingreso`)}
    ${kpi('Balance actual', money(m.balance), `Tasa de ahorro ${pct(m.tasa)}`, m.balance >= 0 ? 'pos' : 'neg')}
    ${kpi(cierre, money(m.projGasto), `Presupuesto del mes ${money(m.budgetTotal)}`, m.budgetTotal && m.projGasto > m.budgetTotal ? 'neg' : '')}
    ${kpi('Ahorro proyectado', money(m.balanceProj), `Anual ≈ ${moneyK(m.balanceProj * 12)}`, m.balanceProj >= 0 ? 'pos' : 'neg')}
    ${kpi(m.isCur ? 'Disponible por día' : 'Gasto diario medio', money(m.isCur ? m.dispDia : (m.elapsed ? m.gasto / m.elapsed : 0)), m.isCur ? `${m.restantes} días restantes · ritmo actual ${money(m.dailyRate)}/día` : 'promedio del mes')}
  </div>

  <div class="grid g-2">
    <div class="card"><h3>Ritmo de gasto del mes</h3><div class="sub">Acumulado vs. presupuesto lineal e ingresos</div>
      ${lineChart({ labels: Array.from({ length: m.dim }, (_, i) => i + 1), xEvery: 5, series: [{ name: 'Gasto acumulado', color: 'var(--brand)', values: cum }, ...(projLine ? [{ name: 'Proyección', color: 'var(--c2)', dash: '6 5', values: projLine }] : []), ...(m.budgetTotal ? [{ name: 'Presupuesto (ritmo ideal)', color: 'var(--c3)', dash: '2 4', values: pace }] : []), { name: 'Ingresos', color: 'var(--ok)', dash: '2 4', values: flatIng }] })}</div>
    <div class="card"><h3>Pronóstico de gastos · 3 meses</h3><div class="sub">${m.nHist >= 2 ? 'Regresión lineal sobre tu historial' : 'Basado en el ritmo del mes actual'} (${m.nHist} mes(es) de datos)</div>${trend}
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">${m.forecast.map(f => `<span class="pill ${f.v > m.ingresos ? 'bad' : 'mute'}">${mesShort(f.k)}: ${money(f.v)} → ahorro ${money(m.ingresos - f.v)}</span>`).join('')}</div></div>
  </div>

  <div class="grid g-2">
    <div class="card"><h3>Gasto por categoría</h3><div class="sub">${mesLabel(m.mes)}</div>${donut(catItems)}</div>
    <div class="card"><h3>Presupuesto vs. real</h3><div class="sub">Barra = gasto real · marca = presupuesto · ⚠️ proyección excede</div>
      <div class="tbl-wrap"><table><tbody>${m.cats.filter(c => c.spent || c.budget).slice(0, 10).map(c => `<tr><td style="width:36%"><b>${esc(c.nombre)}</b><div class="hint">${money(c.spent)} / ${c.budget ? money(c.budget) : '—'}</div></td><td><div class="bar ${c.spent > c.budget && c.budget ? 'bad' : c.over ? 'warn' : ''}" style="height:12px"><i style="width:${clamp(c.spent / maxCat * 100, 0, 100)}%"></i>${c.budget ? `<span class="mark" style="left:${clamp(c.budget / maxCat * 100, 0, 100)}%"></span>` : ''}</div></td><td class="n">${estadoPill(c)}</td></tr>`).join('') || '<tr><td>Sin datos</td></tr>'}</tbody></table></div></div>
  </div>

  <div class="grid g-2">
    <div class="card"><h3>💡 Recomendaciones y alertas</h3><div class="sub">Generadas automáticamente con tus datos y proyecciones</div><ul class="reco">${recomendaciones(m).map(([c, e, t]) => `<li class="${c}"><span class="e">${e}</span><span>${esc(t)}</span></li>`).join('')}</ul></div>
    <div class="card"><h3>Top 5 gastos más altos</h3><div class="sub">${mesLabel(m.mes)}</div><div class="tbl-wrap"><table><thead><tr><th>#</th><th>Descripción</th><th>Categoría</th><th class="n">Monto</th></tr></thead><tbody>${topG.map((g, i) => `<tr><td>${i + 1}</td><td>${esc(g.descripcion)}</td><td><span class="chip">${esc(g.categoria)}</span></td><td class="n"><b>${money(g.monto)}</b></td></tr>`).join('') || '<tr><td colspan="4" class="hint">Sin gastos</td></tr>'}</tbody></table></div></div>
  </div>

  <div class="grid g-2">
    <div class="card"><h3>Gasto por periodicidad</h3><div class="sub">Gasto real vs. monto presupuestado (por periodo)</div><div class="tbl-wrap"><table><thead><tr><th>Periodicidad</th><th class="n">Real</th><th class="n">Presupuestado</th></tr></thead><tbody>${porPer.map(x => `<tr><td>${x.p}</td><td class="n">${money(x.real)}</td><td class="n">${money(x.pres)}</td></tr>`).join('') || '<tr><td colspan="3" class="hint">Sin datos</td></tr>'}</tbody></table></div></div>
    <div class="card"><h3>Uso de cada ingreso</h3><div class="sub">Cuánto de cada fuente ya se gastó este mes</div>${ingUso.map(({ i, usado, mm }) => `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(i.descripcion)}</b><span class="hint">${money(usado)} de ${money(mm)}</span></div>${barHtml(usado, mm, usado > mm ? 'bad' : usado > mm * .85 ? 'warn' : '')}</div>`).join('') || '<div class="hint">Sin ingresos</div>'}</div>
  </div>`;
}

function filteredGastos() {
  const f = S.f; const q = norm(f.q);
  return S.gastos.filter(g => (f.all || (g.fecha || '').startsWith(S.mes)) && (!f.cat || g.categoria === f.cat) && (!f.ing || g.ingresoId === f.ing) && (!f.quin || g.quincena === f.quin) && (!q || norm(g.descripcion + ' ' + g.categoria + ' ' + g.notas).includes(q)))
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.codigo || '').localeCompare(a.codigo || ''));
}
function vGastos() {
  const list = filteredGastos(), total = list.reduce((a, g) => a + g.monto, 0);
  const cats = [...new Set([...S.categorias.filter(c => c.tipo === 'Gasto').map(c => c.nombre), ...S.gastos.map(g => g.categoria)])].sort();
  return `<div class="card"><div class="toolbar">
    <input type="text" id="fq" placeholder="🔎 Buscar…" value="${esc(S.f.q)}" style="min-width:200px">
    <select id="fcat"><option value="">Todas las categorías</option>${cats.map(c => `<option ${S.f.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <select id="fing"><option value="">Todos los ingresos</option>${S.ingresos.map(i => `<option value="${i.id}" ${S.f.ing === i.id ? 'selected' : ''}>${esc(i.descripcion)}</option>`).join('')}</select>
    <select id="fquin"><option value="">Quincena: todas</option>${['Primera', 'Segunda', 'N/A'].map(q => `<option ${S.f.quin === q ? 'selected' : ''}>${q}</option>`).join('')}</select>
    <label style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="fall" ${S.f.all ? 'checked' : ''}> Todo el historial</label>
    <span class="grow"></span>
    <button class="btn" data-act="exportGastos">⬇️ CSV</button><button class="btn" data-act="importGastos">⬆️ Importar</button><button class="btn primary" data-act="newGas">＋ Nuevo gasto</button></div>
    <p class="hint" style="margin:12px 0 4px"><b>${list.length}</b> registros · total <b>${money(total)}</b></p>
    <div class="tbl-wrap"><table><thead><tr><th>ID</th><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Ingreso asociado</th><th>Quinc.</th><th class="n">Monto</th><th></th></tr></thead><tbody>
    ${list.map(g => `<tr><td class="hint">${esc(g.codigo)}</td><td>${fechaCorta(g.fecha)}</td><td>${esc(g.descripcion)}${g.notas ? `<div class="hint">${esc(g.notas)}</div>` : ''}</td><td><span class="chip">${esc(g.categoria)}</span></td><td>${esc(ingNombre(g)) || '<span class="hint">—</span>'}</td><td>${esc(g.quincena || '')}</td><td class="n"><b>${money(g.monto)}</b></td>
    <td><div class="row-actions"><button class="icon-btn" title="Editar" data-act="editGas" data-id="${g.id}">✏️</button><button class="icon-btn" title="Duplicar" data-act="dupGas" data-id="${g.id}">⧉</button><button class="icon-btn" title="Eliminar" data-act="delGas" data-id="${g.id}">🗑️</button></div></td></tr>`).join('') || `<tr><td colspan="8" class="empty">No hay gastos con estos filtros. Pulsa <b>＋ Nuevo gasto</b> o la tecla <b>N</b>.</td></tr>`}
    </tbody></table></div></div>`;
}

function vIngresos() {
  const m = model(S.mes);
  const rows = [...S.ingresos].sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''));
  const tot = rows.reduce((a, i) => a + ingresoMes(i, S.mes), 0);
  return `<div class="card"><div class="toolbar"><span class="hint grow">Total mensual normalizado (quincenal ×2, semanal ×4.33, anual ÷12): <b>${money(tot)}</b> · anual <b>${money(tot * 12)}</b> · ${rows.length} fuente(s)</span><button class="btn" data-act="exportIngresos">⬇️ CSV</button><button class="btn primary" data-act="newIng">＋ Nuevo ingreso</button></div>
  <div class="tbl-wrap" style="margin-top:10px"><table><thead><tr><th>ID</th><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Periodicidad</th><th class="n">Monto</th><th class="n">Mensual</th><th style="min-width:150px">Usado del mes</th><th></th></tr></thead><tbody>
  ${rows.map(i => { const usado = m.gM.filter(g => g.ingresoId === i.id || (!g.ingresoId && g.ingresoNombre === i.descripcion)).reduce((a, g) => a + g.monto, 0), mm = ingresoMes(i, S.mes); return `<tr><td class="hint">${esc(i.codigo)}</td><td>${fechaCorta(i.fecha)}</td><td><b>${esc(i.descripcion)}</b>${i.notas ? `<div class="hint">${esc(i.notas)}</div>` : ''}</td><td><span class="chip">${esc(i.categoria)}</span></td><td>${esc(i.periodicidad)}</td><td class="n">${money(i.monto)}</td><td class="n">${money(mm)}</td><td>${barHtml(usado, mm, usado > mm ? 'bad' : usado > mm * .85 ? 'warn' : '')}<div class="hint">${money(usado)} · ${mm ? pct(usado / mm) : '—'}</div></td>
  <td><div class="row-actions"><button class="icon-btn" data-act="editIng" data-id="${i.id}">✏️</button><button class="icon-btn" data-act="delIng" data-id="${i.id}">🗑️</button></div></td></tr>`; }).join('') || '<tr><td colspan="9" class="empty">Aún no hay ingresos.</td></tr>'}
  </tbody></table></div></div>`;
}

function vPresupuesto() {
  const m = model(S.mes);
  const sumP = m.cats.reduce((a, c) => a + c.budget, 0);
  return `<div class="card"><div class="toolbar"><span class="hint grow">Los presupuestos se convierten a su equivalente mensual para compararlos con el gasto de <b>${mesLabel(S.mes)}</b>. Presupuesto mensual total: <b>${money(sumP)}</b> (${pct(m.ingresos ? sumP / m.ingresos : 0)} del ingreso).</span></div>
  <div class="tbl-wrap" style="margin-top:10px"><table><thead><tr><th>Categoría</th><th>Presupuesto</th><th class="n">Equiv. mensual</th><th class="n">Gasto real</th><th class="n">Proyección</th><th class="n">Diferencia</th><th>Estado</th><th class="n">% ingreso</th><th></th></tr></thead><tbody>
  ${m.cats.map(c => `<tr><td><b>${esc(c.nombre)}</b></td><td>${money(c.presupuesto)} <span class="hint">${c.per}</span></td><td class="n">${money(c.budget)}</td><td class="n">${money(c.spent)}</td><td class="n">${money(c.proj)}</td><td class="n" style="color:var(--${c.budget - c.spent >= 0 ? 'ok' : 'bad'})">${c.budget ? money(c.budget - c.spent) : '—'}</td><td>${estadoPill(c)}</td><td class="n">${pct(c.pctIng, 1)}</td><td><button class="icon-btn" data-act="editBud" data-name="${esc(c.nombre)}">✏️</button></td></tr>`).join('')}
  </tbody><tfoot><tr><td><b>Total</b></td><td></td><td class="n"><b>${money(sumP)}</b></td><td class="n"><b>${money(m.gasto)}</b></td><td class="n"><b>${money(m.projGasto)}</b></td><td class="n"><b>${money(sumP - m.gasto)}</b></td><td></td><td class="n"><b>${pct(m.ingresos ? m.gasto / m.ingresos : 0, 1)}</b></td><td></td></tr></tfoot></table></div></div>`;
}

function vCategorias() {
  const box = tipo => `<div class="card"><div class="toolbar"><h3 class="grow">${tipo === 'Gasto' ? '🧾 Categorías de gasto' : '💰 Categorías de ingreso'}</h3><button class="btn primary sm" data-act="newCat" data-tipo="${tipo}">＋ Agregar</button></div><div class="tbl-wrap"><table><tbody>
  ${S.categorias.filter(c => c.tipo === tipo).sort((a, b) => a.nombre.localeCompare(b.nombre)).map(c => `<tr><td><b>${esc(c.nombre)}</b>${c.descripcion ? `<div class="hint">${esc(c.descripcion)}</div>` : ''}</td><td class="n"><div class="row-actions"><button class="icon-btn" data-act="editCat" data-id="${c.id}">✏️</button><button class="icon-btn" data-act="delCat" data-id="${c.id}">🗑️</button></div></td></tr>`).join('') || '<tr><td class="hint">Sin categorías</td></tr>'}</tbody></table></div></div>`;
  return `<div class="grid g-2">${box('Gasto')}${box('Ingreso')}</div>`;
}

function vDecisiones() {
  const m = model(S.mes);
  const base = m.balanceProj;
  const cands = m.cats.filter(c => c.proj > 0).slice(0, 8);
  const ahorroRed = cands.reduce((a, c) => a + c.proj * (sim.red[c.nombre] || 0) / 100, 0);
  const nuevo = base + ahorroRed + sim.extra;
  const tasaN = m.ingresos + sim.extra ? nuevo / (m.ingresos + sim.extra) : 0;
  const metaHTML = S.metas.map(g => {
    const falta = Math.max(0, g.objetivo - g.ahorrado), p = g.objetivo ? g.ahorrado / g.objetivo : 0;
    const mesesFecha = g.fecha ? Math.max(1, Math.round((new Date(g.fecha) - new Date()) / (30.4 * 864e5))) : null;
    const necesario = mesesFecha ? falta / mesesFecha : null;
    const mesesRitmo = nuevo > 0 ? Math.ceil(falta / nuevo) : null;
    const ok = necesario != null && nuevo >= necesario;
    return `<div class="goal"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>🎯 ${esc(g.nombre)}</b><div class="row-actions"><button class="icon-btn" data-act="aportar" data-id="${g.id}" title="Aportar">➕</button><button class="icon-btn" data-act="editMeta" data-id="${g.id}">✏️</button><button class="icon-btn" data-act="delMeta" data-id="${g.id}">🗑️</button></div></div>
      ${barHtml(g.ahorrado, g.objetivo)}<div class="hint">${money(g.ahorrado)} de ${money(g.objetivo)} (${pct(p)})${g.fecha ? ` · meta ${fechaCorta(g.fecha)}` : ''}</div>
      <div>${falta === 0 ? '<span class="pill ok">✅ Meta lograda</span>' : `${necesario != null ? `Necesitas ahorrar <b>${money(necesario)}/mes</b>. ` : ''}${mesesRitmo ? `Con tu ahorro (simulado) la alcanzas en <b>${mesesRitmo} mes(es)</b>. ` : '<span class="pill bad">Con tu balance actual no la alcanzas.</span> '}${necesario != null ? (ok ? '<span class="pill ok">Alcanzable</span>' : '<span class="pill warn">Ritmo insuficiente</span>') : ''}`}</div></div>`;
  }).join('');
  return `<div class="grid g-2">
  <div class="card"><h3>🧪 Simulador “¿Y si…?”</h3><div class="sub">Mueve los controles para ver cómo cambia tu ahorro. Base: ahorro proyectado de ${mesLabel(S.mes)} = <b>${money(base)}</b></div>
    ${cands.map(c => `<div class="sim-row"><div><b>${esc(c.nombre)}</b><div class="hint">${money(c.proj)} proyectado</div></div><input type="range" min="0" max="60" step="5" value="${sim.red[c.nombre] || 0}" data-sim="${esc(c.nombre)}"><div class="n" style="text-align:right"><b>−${sim.red[c.nombre] || 0}%</b><div class="hint">${money(c.proj * (sim.red[c.nombre] || 0) / 100)}</div></div></div>`).join('') || '<div class="hint">Registra gastos para simular.</div>'}
    <div class="sim-row"><div><b>Ingreso extra mensual</b><div class="hint">bono, freelance…</div></div><input type="range" min="0" max="300000" step="5000" value="${sim.extra}" data-simextra><div style="text-align:right"><b>+${moneyK(sim.extra)}</b></div></div>
    <div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:16px"><div><div class="hint">Nuevo ahorro mensual</div><div class="big-result" style="color:var(--${nuevo >= 0 ? 'ok' : 'bad'})">${money(nuevo)}</div></div><div><div class="hint">Ahorro anual</div><div class="big-result" style="color:var(--${nuevo >= 0 ? 'ok' : 'bad'})">${money(nuevo * 12)}</div></div><div><div class="hint">Tasa de ahorro</div><div class="big-result" style="color:var(--${tasaN >= .2 ? 'ok' : tasaN >= .1 ? 'warn' : 'bad'})">${pct(tasaN)}</div></div></div>
    <div class="toolbar" style="margin-top:12px"><button class="btn sm" data-act="simAuto">✨ Sugerir recortes para llegar al 20%</button><button class="btn sm ghost" data-act="simReset">Reiniciar</button></div></div>
  <div class="card"><div class="toolbar"><div class="grow"><h3>🎯 Metas de ahorro</h3><div class="sub" style="margin:0">Compáralas con tu ahorro mensual simulado</div></div><button class="btn primary sm" data-act="newMeta">＋ Nueva meta</button></div>
    <div style="display:flex;flex-direction:column;gap:12px;margin-top:10px">${metaHTML || '<div class="empty">Crea una meta (fondo de emergencia, viaje, vehículo…) y descubre cuándo la lograrás.</div>'}</div></div></div>
  <div class="card"><h3>🔮 Escenarios a 3 meses</h3><div class="sub">Pronóstico de tendencia (${m.nHist} mes(es) de historial)</div><div class="tbl-wrap"><table><thead><tr><th>Mes</th><th class="n">Gasto esperado</th><th class="n">Ingreso</th><th class="n">Ahorro esperado</th><th class="n">Ahorro acumulado</th></tr></thead><tbody>${(() => { let a = 0; return m.forecast.map(f => { const s = m.ingresos - f.v; a += s; return `<tr><td>${mesLabel(f.k)}</td><td class="n">${money(f.v)}</td><td class="n">${money(m.ingresos)}</td><td class="n" style="color:var(--${s >= 0 ? 'ok' : 'bad'})">${money(s)}</td><td class="n"><b>${money(a)}</b></td></tr>`; }).join(''); })()}</tbody></table></div>
  <p class="hint">Ingreso asumido constante (fuentes recurrentes). Cuantos más meses registres, más fiable el pronóstico.</p></div>`;
}

function vAjustes() {
  const cfg = store.get('cff_fbconfig', ''); const m = S.db?.mode;
  return `<div class="grid g-2">
  <div class="card"><h3>🔥 Conexión Firestore (tiempo real)</h3><div class="sub">Estado: <b>${m === 'firestore' ? 'Conectado a Firestore' : 'Modo local (sin Firestore)'}</b></div>
    <form id="cfgForm"><div style="margin-bottom:12px"><label>Código de familia (comparte el mismo código en todos los dispositivos)</label><input type="text" name="fam" value="${esc(store.get('cff_fam', ''))}" required></div>
    <div><label>Configuración Firebase (pega el objeto firebaseConfig)</label><textarea class="mono" name="cfg" placeholder='{ apiKey: "...", authDomain: "...", projectId: "...", appId: "..." }'>${esc(cfg)}</textarea></div>
    <div class="modal-f" style="justify-content:flex-start"><button class="btn primary">Guardar y reconectar</button>${cfg ? '<button type="button" class="btn danger" data-act="cfgClear">Volver a modo local</button>' : ''}</div></form>
    <p class="hint">Pasos: 1) Crea un proyecto en Firebase · 2) Authentication → habilita “Anónimo” · 3) Firestore Database → crear base de datos · 4) Publica las reglas del archivo <span class="mono">firestore.rules</span> · 5) Registra una app Web y pega aquí su configuración.</p></div>
  <div class="card"><h3>📦 Datos</h3><div class="sub">Importa, respalda o limpia la información</div><div style="display:flex;flex-direction:column;gap:10px;align-items:flex-start">
    <button class="btn" data-act="seed">📥 Cargar datos de ejemplo del Excel</button>
    <button class="btn" data-act="backup">⬇️ Descargar respaldo (JSON)</button>
    <button class="btn" data-act="restore">⬆️ Restaurar respaldo (JSON)</button>
    <button class="btn" data-act="newCatDefaults">✨ Crear categorías básicas</button>
    <button class="btn danger" data-act="wipe">🗑️ Borrar todos los datos</button></div></div></div>`;
}

/* ───────────── render ───────────── */
function render() {
  const v = VIEWS[S.view] || VIEWS.dashboard;
  $('#title').textContent = v.t;
  $('#nav').innerHTML = Object.entries(VIEWS).map(([k, x]) => `<button class="${k === S.view ? 'on' : ''}" data-nav="${k}"><span class="ic">${x.i}</span>${x.t}</button>`).join('');
  $('#monthInp').value = S.mes;
  const keep = document.activeElement?.id, pos = document.activeElement?.selectionStart;
  const sc = window.scrollY;
  if (!Object.values(S.loaded).every(Boolean)) { $('#view').innerHTML = '<div class="card empty"><div class="big">⏳</div><h3>Cargando tus datos…</h3></div>'; return; }
  $('#view').innerHTML = v.r();
  if (keep && $('#' + keep)) { const el = $('#' + keep); el.focus(); try { if (pos != null) el.setSelectionRange(pos, pos); } catch { } }
  window.scrollTo(0, sc);
}
function setStatus(kind, text) { const b = $('#syncBadge'); b.className = 'sync ' + (kind === 'live' ? 'live' : kind === 'err' ? 'err' : ''); $('span', b).textContent = text; }
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; $('#toasts').append(d); setTimeout(() => d.remove(), 2800); }

/* ───────────── modales ───────────── */
function openModal({ title, body, onSubmit, submit = 'Guardar', wide = false, noFooter = false }) {
  $('#modalTitle').textContent = title; $('.modal').classList.toggle('wide', wide);
  $('#modalBody').innerHTML = `<form id="mf" autocomplete="off">${body}${noFooter ? '' : `<div class="modal-f"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary">${submit}</button></div>`}</form>`;
  $('#modalBg').hidden = false;
  const f = $('#mf');
  f.onsubmit = async e => { e.preventDefault(); const fd = Object.fromEntries(new FormData(f)); try { const r = await onSubmit?.(fd, f); if (r !== false) closeModal(); } catch (err) { console.error(err); toast('Error: ' + (err.message || err)); } };
  setTimeout(() => $('input:not([type=hidden]),select', f)?.focus(), 30);
  return f;
}
const closeModal = () => { $('#modalBg').hidden = true; $('#modalBody').innerHTML = ''; };
function ask(msg, okText = 'Eliminar') { return new Promise(res => { openModal({ title: 'Confirmar', body: `<p>${esc(msg)}</p>`, submit: okText, onSubmit: () => { res(true); } }); const bg = $('#modalBg'); const h = e => { if (e.target.closest('[data-close],#modalX') || e.target === bg) { res(false); bg.removeEventListener('click', h); } }; bg.addEventListener('click', h); }); }
const opts = (arr, sel) => arr.map(o => `<option ${o === sel ? 'selected' : ''}>${esc(o)}</option>`).join('');
const nextCode = (list, p) => p + '-' + String(Math.max(0, ...list.map(x => parseInt((x.codigo || '').split('-')[1]) || 0)) + 1).padStart(3, '0');
const gastoCats = () => S.categorias.filter(c => c.tipo === 'Gasto').map(c => c.nombre).sort();

function suggestFor(desc) {
  const tok = s => norm(s).split(/[^a-z0-9ñ]+/).filter(w => w.length > 2);
  const t = new Set(tok(desc)); if (!t.size) return [];
  const by = {};
  S.gastos.forEach(g => { const gt = tok(g.descripcion); const inter = gt.filter(w => t.has(w) || [...t].some(x => w.startsWith(x) || x.startsWith(w))).length; if (!inter) return; const sim = inter / (gt.length + t.size - inter); const e = (by[g.categoria] ||= { cat: g.categoria, sc: 0, best: null, bs: 0 }); e.sc += sim; if (sim > e.bs || (sim === e.bs && (g.fecha || '') > (e.best?.fecha || ''))) { e.bs = sim; e.best = g; } });
  return Object.values(by).sort((a, b) => b.sc - a.sc).slice(0, 3);
}
function frequent() {
  const map = {}; S.gastos.forEach(g => { const k = norm(g.descripcion); (map[k] ||= { n: 0, g }).n++; if ((g.fecha || '') > (map[k].g.fecha || '')) map[k].g = g; });
  return Object.values(map).sort((a, b) => b.n - a.n || b.g.monto - a.g.monto).slice(0, 6).map(x => x.g);
}

function gastoForm(g) {
  const edit = !!g?.id; const cats = gastoCats();
  const lastIng = S.ingresos[0]?.id;
  const freq = edit ? [] : frequent();
  const f = openModal({
    title: edit ? 'Editar gasto' : 'Nuevo gasto', wide: false,
    body: `${freq.length ? `<div class="sugg" style="margin:0 0 12px"><span class="t">⚡ Frecuentes:</span>${freq.map((x, i) => `<button type="button" data-freq="${i}">${esc(x.descripcion.slice(0, 24))}</button>`).join('')}</div>` : ''}
    <div class="f-grid">
      <div class="full"><label>Descripción</label><input type="text" name="descripcion" value="${esc(g?.descripcion || '')}" required placeholder="Ej.: compra supermercado"><div class="sugg" id="sugg"></div></div>
      <div><label>Monto (₡)</label><input type="number" name="monto" step="0.01" min="0" inputmode="decimal" value="${g?.monto ?? ''}" required></div>
      <div><label>Fecha</label><input type="date" name="fecha" value="${g?.fecha || (S.mes === ym(new Date()) ? todayStr() : S.mes + '-01')}" required></div>
      <div><label>Categoría</label><select name="categoria" required><option value="">Selecciona…</option>${opts(cats, g?.categoria)}</select></div>
      <div><label>Ingreso asociado</label><select name="ingresoId"><option value="">Sin asociar</option>${S.ingresos.map(i => `<option value="${i.id}" ${(g?.ingresoId || (!edit && i.id === lastIng && '')) === i.id ? 'selected' : ''}>${esc(i.descripcion)}</option>`).join('')}</select></div>
      <div><label>Quincena</label><select name="quincena">${opts(['Primera', 'Segunda', 'N/A'], g?.quincena || quincenaDe(g?.fecha || todayStr()))}</select></div>
      <div><label>Notas</label><input type="text" name="notas" value="${esc(g?.notas || '')}"></div>
    </div>${edit ? '' : '<label style="margin-top:12px;display:flex;gap:8px;align-items:center"><input type="checkbox" name="otro"> Registrar otro después de guardar</label>'}`,
    onSubmit: async d => {
      const ing = S.ingresos.find(i => i.id === d.ingresoId);
      const data = { fecha: d.fecha, descripcion: d.descripcion.trim(), categoria: d.categoria, ingresoId: d.ingresoId || '', ingresoNombre: ing?.descripcion || '', monto: +d.monto, quincena: d.quincena, notas: d.notas || '' };
      if (edit) { await S.db.update('gastos', g.id, data); toast('Gasto actualizado'); }
      else { data.codigo = nextCode(S.gastos, 'G'); await S.db.add('gastos', data); toast('Gasto guardado ✔'); if (d.otro) { setTimeout(() => gastoForm({ fecha: d.fecha, ingresoId: d.ingresoId }), 50); } }
    }
  });
  const desc = $('[name=descripcion]', f), cat = $('[name=categoria]', f), ing = $('[name=ingresoId]', f), mon = $('[name=monto]', f), fec = $('[name=fecha]', f), qui = $('[name=quincena]', f);
  let quiManual = !!g?.quincena && edit;
  qui.onchange = () => quiManual = true;
  fec.onchange = () => { if (!quiManual && fec.value) qui.value = quincenaDe(fec.value); };
  if (!edit && !ing.value && lastIng) { const lg = [...S.gastos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0]; ing.value = lg?.ingresoId || lastIng; }
  const apply = s => { cat.value = s.cat; if (s.best?.ingresoId) ing.value = s.best.ingresoId; if (!mon.value && s.best) mon.value = s.best.monto; };
  let cur = [];
  desc.oninput = () => { cur = suggestFor(desc.value); $('#sugg', f).innerHTML = cur.length ? `<span class="t">🔮 Sugerido:</span>` + cur.map((s, i) => `<button type="button" data-s="${i}">${esc(s.cat)}${s.best ? ' · ' + moneyK(s.best.monto) : ''}</button>`).join('') : ''; if (!edit && !cat.value && cur[0] && desc.value.length > 3) cat.value = cur[0].cat; };
  f.addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) apply(cur[+b.dataset.s]); const q = e.target.closest('[data-freq]'); if (q) { const x = freq[+q.dataset.freq]; desc.value = x.descripcion; cat.value = x.categoria; if (x.ingresoId) ing.value = x.ingresoId; mon.value = x.monto; desc.oninput(); mon.focus(); mon.select(); } });
  if (g?.descripcion) desc.oninput();
}
function ingresoForm(i) {
  const edit = !!i?.id;
  const cats = S.categorias.filter(c => c.tipo === 'Ingreso').map(c => c.nombre).sort();
  openModal({ title: edit ? 'Editar ingreso' : 'Nuevo ingreso', body: `<div class="f-grid">
    <div class="full"><label>Descripción</label><input type="text" name="descripcion" value="${esc(i?.descripcion || '')}" required placeholder="Ej.: Salario Papá"></div>
    <div><label>Monto (₡)</label><input type="number" name="monto" step="0.01" min="0" value="${i?.monto ?? ''}" required></div>
    <div><label>Periodicidad</label><select name="periodicidad">${opts(ING_PERIODS, i?.periodicidad || 'Mensual')}</select></div>
    <div><label>Categoría</label><select name="categoria" required><option value="">Selecciona…</option>${opts(cats, i?.categoria)}</select></div>
    <div><label>Fecha de pago</label><input type="date" name="fecha" value="${i?.fecha || todayStr()}" required></div>
    <div class="full"><label>Notas</label><input type="text" name="notas" value="${esc(i?.notas || '')}"></div></div>
    <p class="hint">“Puntual” solo cuenta en el mes de su fecha. Quincenal se multiplica ×2, semanal ×4.33 y anual ÷12 para el cálculo mensual.</p>`,
    onSubmit: async d => { const data = { descripcion: d.descripcion.trim(), monto: +d.monto, periodicidad: d.periodicidad, categoria: d.categoria, fecha: d.fecha, notas: d.notas || '' };
      if (edit) { await S.db.update('ingresos', i.id, data); if (i.descripcion !== data.descripcion) for (const g of S.gastos.filter(g => g.ingresoId === i.id)) await S.db.update('gastos', g.id, { ingresoNombre: data.descripcion }); toast('Ingreso actualizado'); }
      else { data.codigo = nextCode(S.ingresos, 'I'); await S.db.add('ingresos', data); toast('Ingreso guardado ✔'); } } });
}
function catForm(c, tipo) {
  const edit = !!c?.id; tipo = c?.tipo || tipo;
  openModal({ title: (edit ? 'Editar' : 'Nueva') + ' categoría de ' + tipo.toLowerCase(), body: `<div class="f-grid"><div class="full"><label>Nombre</label><input type="text" name="nombre" value="${esc(c?.nombre || '')}" required></div><div class="full"><label>Descripción</label><input type="text" name="descripcion" value="${esc(c?.descripcion || '')}"></div>
    ${tipo === 'Gasto' ? `<div><label>Presupuesto (₡)</label><input type="number" name="presupuesto" min="0" step="0.01" value="${c?.presupuesto ?? 0}"></div><div><label>Periodicidad</label><select name="periodicidad">${opts(PERIODS, c?.periodicidad || 'Mensual')}</select></div>` : ''}</div>`,
    onSubmit: async d => { const nombre = d.nombre.trim(); if (S.categorias.some(x => x.tipo === tipo && norm(x.nombre) === norm(nombre) && x.id !== c?.id)) { toast('Ya existe esa categoría'); return false; }
      const data = { tipo, nombre, descripcion: d.descripcion || '' }; if (tipo === 'Gasto') { data.presupuesto = +d.presupuesto || 0; data.periodicidad = d.periodicidad; }
      if (edit) { await S.db.update('categorias', c.id, data); if (c.nombre !== nombre) { const col = tipo === 'Gasto' ? 'gastos' : 'ingresos'; for (const x of S[col].filter(x => x.categoria === c.nombre)) await S.db.update(col, x.id, { categoria: nombre }); } toast('Categoría actualizada'); }
      else { await S.db.add('categorias', data); toast('Categoría creada'); } } });
}
function budgetForm(name) {
  const c = S.categorias.find(x => x.tipo === 'Gasto' && x.nombre === name);
  openModal({ title: 'Presupuesto · ' + name, body: `<div class="f-grid"><div><label>Monto (₡)</label><input type="number" name="presupuesto" min="0" step="0.01" value="${c?.presupuesto ?? 0}" required></div><div><label>Periodicidad</label><select name="periodicidad">${opts(PERIODS, c?.periodicidad || 'Mensual')}</select></div></div><p class="hint">Se compara con el gasto mensual: por ejemplo ₡25.000 quincenal = ₡50.000 al mes.</p>`,
    onSubmit: async d => { const data = { presupuesto: +d.presupuesto, periodicidad: d.periodicidad }; if (c) await S.db.update('categorias', c.id, data); else await S.db.add('categorias', { tipo: 'Gasto', nombre: name, descripcion: '', ...data }); toast('Presupuesto guardado'); } });
}
function metaForm(g) {
  openModal({ title: g ? 'Editar meta' : 'Nueva meta de ahorro', body: `<div class="f-grid"><div class="full"><label>Nombre</label><input type="text" name="nombre" value="${esc(g?.nombre || '')}" required placeholder="Fondo de emergencia"></div><div><label>Objetivo (₡)</label><input type="number" name="objetivo" min="1" value="${g?.objetivo ?? ''}" required></div><div><label>Ya ahorrado (₡)</label><input type="number" name="ahorrado" min="0" value="${g?.ahorrado ?? 0}"></div><div class="full"><label>Fecha límite (opcional)</label><input type="date" name="fecha" value="${g?.fecha || ''}"></div></div>`,
    onSubmit: async d => { const data = { nombre: d.nombre.trim(), objetivo: +d.objetivo, ahorrado: +d.ahorrado || 0, fecha: d.fecha || '' }; g ? await S.db.update('metas', g.id, data) : await S.db.add('metas', data); toast('Meta guardada'); } });
}

/* ───────────── CSV / respaldo ───────────── */
const csvCell = v => { v = String(v ?? ''); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
function download(name, text, type = 'text/csv') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: type + ';charset=utf-8' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
function parseCSV(t) { const rows = []; let row = [], cur = '', q = false; t = t.replace(/^﻿/, ''); const sep = (t.split('\n')[0].match(/;/g) || []).length > (t.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === sep) { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); if (row.some(x => x.trim())) rows.push(row); row = []; cur = ''; } else cur += c; }
  row.push(cur); if (row.some(x => x.trim())) rows.push(row); return rows; }
const pickFile = accept => new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => i.files[0] ? i.files[0].text().then(res) : res(null); i.click(); });
const normDate = s => { s = String(s).trim(); let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`; m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; return ''; };

async function seedData() {
  const sd = window.SEED; if (!sd) return toast('No hay datos de ejemplo');
  if ((S.gastos.length || S.ingresos.length) && !(await ask('Ya tienes datos. ¿Agregar también los datos del Excel? (puede duplicar registros)', 'Agregar'))) return;
  const haveCat = new Set(S.categorias.map(c => c.tipo + '|' + c.nombre));
  await S.db.addMany('categorias', sd.categorias.filter(c => !haveCat.has(c.tipo + '|' + c.nombre)));
  const ids = await S.db.addMany('ingresos', sd.ingresos); const byName = {}; sd.ingresos.forEach((i, k) => byName[i.descripcion] = ids[k]);
  await S.db.addMany('gastos', sd.gastos.map(g => ({ ...g, ingresoId: byName[g.ingresoNombre] || '' })));
  toast('Datos del Excel cargados ✔');
}
const BASIC_CATS = [['Ingreso', 'Salario'], ['Ingreso', 'Freelance'], ['Ingreso', 'Otros ingresos'], ['Gasto', 'Alimentación'], ['Gasto', 'Vivienda'], ['Gasto', 'Servicios'], ['Gasto', 'Transporte'], ['Gasto', 'Salud'], ['Gasto', 'Educación'], ['Gasto', 'Entretenimiento'], ['Gasto', 'Deudas y financiero'], ['Gasto', 'Otros gastos']];
async function basicCats() { const have = new Set(S.categorias.map(c => c.tipo + '|' + c.nombre)); await S.db.addMany('categorias', BASIC_CATS.filter(([t, n]) => !have.has(t + '|' + n)).map(([tipo, nombre]) => ({ tipo, nombre, descripcion: '', ...(tipo === 'Gasto' ? { presupuesto: 0, periodicidad: 'Mensual' } : {}) }))); toast('Categorías creadas'); }

/* ───────────── acciones ───────────── */
const byId = (list, id) => S[list].find(x => x.id === id);
const ACTIONS = {
  seed: seedData, newCatDefaults: basicCats,
  newGas: () => gastoForm(), newIng: () => ingresoForm(),
  editGas: ({ id }) => gastoForm(byId('gastos', id)),
  dupGas: ({ id }) => { const g = byId('gastos', id); gastoForm({ ...g, id: undefined, fecha: todayStr(), quincena: quincenaDe(todayStr()) }); },
  delGas: async ({ id }) => { if (await ask('¿Eliminar este gasto?')) { await S.db.remove('gastos', id); toast('Gasto eliminado'); } },
  editIng: ({ id }) => ingresoForm(byId('ingresos', id)),
  delIng: async ({ id }) => { const n = S.gastos.filter(g => g.ingresoId === id).length; if (await ask(`¿Eliminar este ingreso?${n ? ` Hay ${n} gasto(s) asociados (se conservarán sin asociar).` : ''}`)) { for (const g of S.gastos.filter(g => g.ingresoId === id)) await S.db.update('gastos', g.id, { ingresoId: '' }); await S.db.remove('ingresos', id); toast('Ingreso eliminado'); } },
  newCat: ({ tipo }) => catForm(null, tipo), editCat: ({ id }) => catForm(byId('categorias', id)),
  delCat: async ({ id }) => { const c = byId('categorias', id); const n = (c.tipo === 'Gasto' ? S.gastos : S.ingresos).filter(x => x.categoria === c.nombre).length; if (await ask(`¿Eliminar la categoría “${c.nombre}”?${n ? ` Tiene ${n} registro(s) que se conservarán con ese nombre.` : ''}`)) { await S.db.remove('categorias', id); toast('Categoría eliminada'); } },
  editBud: ({ name }) => budgetForm(name),
  newMeta: () => metaForm(), editMeta: ({ id }) => metaForm(byId('metas', id)),
  delMeta: async ({ id }) => { if (await ask('¿Eliminar esta meta?')) await S.db.remove('metas', id); },
  aportar: ({ id }) => { const g = byId('metas', id); openModal({ title: 'Aportar a ' + g.nombre, body: `<label>Monto a aportar (₡)</label><input type="number" name="m" min="1" required>`, onSubmit: async d => { await S.db.update('metas', id, { ahorrado: g.ahorrado + +d.m }); toast('Aporte registrado 🎉'); } }); },
  simReset: () => { sim = { red: {}, extra: 0 }; render(); },
  simAuto: () => { const m = model(S.mes); let need = m.ingresos * .2 - m.balanceProj; sim.red = {}; if (need <= 0) { toast('Ya alcanzas el 20% de ahorro 🎉'); return render(); } const c = m.cats.filter(c => c.proj > 0 && c.nombre !== 'Deudas y financiero' && c.nombre !== 'Vivienda'); for (const x of c) { if (need <= 0) break; for (const r of [5, 10, 15, 20, 25, 30]) { sim.red[x.nombre] = r; if (x.proj * r / 100 >= need) { need = 0; break; } } need -= x.proj * (sim.red[x.nombre] || 0) / 100; } render(); toast('Recortes sugeridos aplicados'); },
  exportGastos: () => download('gastos.csv', 'ID,Fecha,Descripción,Categoría,Ingreso asociado,Monto,Quincena,Notas\n' + filteredGastos().map(g => [g.codigo, g.fecha, g.descripcion, g.categoria, ingNombre(g), g.monto, g.quincena, g.notas].map(csvCell).join(',')).join('\n')),
  exportIngresos: () => download('ingresos.csv', 'ID,Fecha,Descripción,Categoría,Monto,Periodicidad,Notas\n' + S.ingresos.map(i => [i.codigo, i.fecha, i.descripcion, i.categoria, i.monto, i.periodicidad, i.notas].map(csvCell).join(',')).join('\n')),
  importGastos: async () => {
    const t = await pickFile('.csv,text/csv'); if (!t) return; const rows = parseCSV(t); const h = rows.shift().map(norm); const ix = (...n) => h.findIndex(x => n.some(y => x.startsWith(y)));
    const I = { f: ix('fecha'), d: ix('descrip'), c: ix('categ'), i: ix('ingreso'), m: ix('monto'), q: ix('quinc'), n: ix('nota') };
    if (I.f < 0 || I.m < 0 || I.d < 0) return toast('El CSV necesita columnas: Fecha, Descripción, Monto (y opcional Categoría, Ingreso asociado, Quincena, Notas)');
    let code = Math.max(0, ...S.gastos.map(g => parseInt((g.codigo || '').split('-')[1]) || 0)); const known = new Set(S.categorias.filter(c => c.tipo === 'Gasto').map(c => c.nombre)); const newCats = new Set();
    const items = rows.map(r => { const fecha = normDate(r[I.f]); const monto = parseFloat(String(r[I.m]).replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.')); if (!fecha || isNaN(monto)) return null; const cat = (I.c >= 0 && r[I.c]?.trim()) || 'Otros gastos'; if (!known.has(cat)) newCats.add(cat); const ing = S.ingresos.find(x => I.i >= 0 && norm(x.descripcion) === norm(r[I.i])); return { codigo: 'G-' + String(++code).padStart(3, '0'), fecha, descripcion: (r[I.d] || '').trim(), categoria: cat, ingresoId: ing?.id || '', ingresoNombre: ing?.descripcion || '', monto, quincena: (I.q >= 0 && r[I.q]) || quincenaDe(fecha), notas: I.n >= 0 ? r[I.n] || '' : '' }; }).filter(Boolean);
    if (newCats.size) await S.db.addMany('categorias', [...newCats].map(nombre => ({ tipo: 'Gasto', nombre, descripcion: '', presupuesto: 0, periodicidad: 'Mensual' })));
    await S.db.addMany('gastos', items); toast(`${items.length} gastos importados`);
  },
  backup: () => download('respaldo-finanzas.json', JSON.stringify({ categorias: S.categorias, ingresos: S.ingresos, gastos: S.gastos, metas: S.metas }, null, 1), 'application/json'),
  restore: async () => { const t = await pickFile('.json'); if (!t) return; try { const d = JSON.parse(t); if (!(await ask('Se agregarán los datos del respaldo a los actuales. ¿Continuar?', 'Restaurar'))) return; for (const c of ['categorias', 'ingresos', 'gastos', 'metas']) await S.db.addMany(c, (d[c] || []).map(({ id, ...r }) => r)); toast('Respaldo restaurado'); } catch { toast('Archivo no válido'); } },
  wipe: async () => { if (await ask('Esto borrará TODAS las categorías, ingresos, gastos y metas de esta familia. No se puede deshacer.', 'Borrar todo')) { await S.db.clearAll(); toast('Datos borrados'); } },
  cfgClear: () => { try { localStorage.removeItem('cff_fbconfig'); } catch { } location.reload(); },
};

function parseFirebaseConfig(t) { const o = {}; for (const m of t.matchAll(/["']?(\w+)["']?\s*:\s*["']([^"']*)["']/g)) o[m[1]] = m[2]; return o; }

/* ───────────── eventos ───────────── */
document.addEventListener('click', e => {
  const nav = e.target.closest('[data-nav]'); if (nav) { go(nav.dataset.nav); $('#side').classList.remove('open'); return; }
  const a = e.target.closest('[data-act]'); if (a) { ACTIONS[a.dataset.act]?.({ ...a.dataset }); return; }
  if (e.target.closest('[data-close],#modalX') || e.target === $('#modalBg')) closeModal();
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'fq') { S.f.q = t.value; render(); }
  else if (t.dataset.sim) { sim.red[t.dataset.sim] = +t.value; render(); }
  else if (t.dataset.simextra !== undefined) { sim.extra = +t.value; render(); }
});
document.addEventListener('change', e => { const t = e.target; const map = { fcat: 'cat', fing: 'ing', fquin: 'quin' }; if (map[t.id]) { S.f[map[t.id]] = t.value; render(); } else if (t.id === 'fall') { S.f.all = t.checked; render(); } else if (t.id === 'monthInp' && t.value) setMes(t.value); });
document.addEventListener('submit', async e => { if (e.target.id === 'cfgForm') { e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target)); store.set('cff_fam', fd.fam.trim().replace(/\s+/g, '-').toLowerCase()); const cfg = (fd.cfg || '').trim(); if (cfg) { const o = parseFirebaseConfig(cfg); if (!o.projectId || !o.apiKey) return toast('La configuración debe incluir apiKey y projectId'); store.set('cff_fbconfig', cfg); } location.reload(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && $('#modalBg').hidden) { e.preventDefault(); gastoForm(); } });
$('#fabGas').onclick = () => gastoForm(); $('#fabIng').onclick = () => ingresoForm();
$('#menuBtn').onclick = () => $('#side').classList.toggle('open');
$('#prevM').onclick = () => setMes(addMonths(S.mes, -1)); $('#nextM').onclick = () => setMes(addMonths(S.mes, 1));
$('#themeBtn').onclick = () => { const d = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = d; store.set('cff_theme', d); };
function setMes(k) { S.mes = k; store.set('cff_mes', k); render(); }
function go(v) { S.view = VIEWS[v] ? v : 'dashboard'; if (location.hash !== '#/' + S.view) history.replaceState(null, '', '#/' + S.view); render(); window.scrollTo(0, 0); }
window.addEventListener('hashchange', () => { const v = location.hash.replace('#/', ''); if (VIEWS[v] && v !== S.view) go(v); });

/* ───────────── arranque ───────────── */
function welcome() {
  return new Promise(res => {
    openModal({ title: '👋 Bienvenido a Finanzas Familiares', submit: 'Comenzar', noFooter: false, body: `<p>Elige un <b>código de familia</b>: todos los dispositivos que lo usen verán los mismos datos en tiempo real.</p>
    <div style="margin:12px 0"><label>Código de familia</label><input type="text" name="fam" value="mi-familia-${Math.random().toString(36).slice(2, 6)}" required></div>
    <div><label>Configuración Firebase (opcional — pégala ahora o más tarde en Ajustes)</label><textarea class="mono" name="cfg" placeholder='{ apiKey: "...", projectId: "...", ... }'></textarea></div>
    <p class="hint">Sin configuración, la app funciona en modo local (datos solo en este navegador) y puedes conectarla a Firestore cuando quieras.</p>`,
      onSubmit: d => { const cfg = (d.cfg || '').trim(); if (cfg) { const o = parseFirebaseConfig(cfg); if (!o.projectId || !o.apiKey) { toast('Config incompleta: falta apiKey o projectId'); return false; } store.set('cff_fbconfig', cfg); } store.set('cff_fam', d.fam.trim().replace(/\s+/g, '-').toLowerCase()); res(); } });
    $('#modalX').onclick = () => { store.set('cff_fam', 'mi-familia'); closeModal(); res(); };
  });
}

(async function init() {
  const th = store.get('cff_theme', ''); document.documentElement.dataset.theme = th || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  const h = location.hash.replace('#/', ''); if (VIEWS[h]) S.view = h;
  render();
  if (!store.get('cff_fam', '')) await welcome();
  const fam = store.get('cff_fam', 'mi-familia');
  let cfg = window.FIREBASE_CONFIG; const saved = store.get('cff_fbconfig', ''); if (saved) cfg = parseFirebaseConfig(saved);
  S.db = await connect(fam, cfg, setStatus);
  ['categorias', 'ingresos', 'gastos', 'metas'].forEach(c => S.db.subscribe(c, list => { S[c] = list; S.loaded[c] = true; if (c === 'ingresos') S.ingresos.sort((a, b) => (a.codigo || '').localeCompare(b.codigo || '')); render(); }));
  if (S.db.mode === 'local' && cfg?.projectId) toast('No se pudo conectar a Firestore; usando modo local');
})();
