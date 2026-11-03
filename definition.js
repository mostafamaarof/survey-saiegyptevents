// Survey definition rules, shared by the Worker (server-side enforcement) and the
// admin editor (instant feedback). ES module, no DOM / Cloudflare APIs.
//   validateDefinition(def)            -> { ok, problems: [{ path, message }] }
//   checkCompatibility(oldDef, newDef) -> [{ id, message }]   (only used once responses exist)

export const QUESTION_TYPES = ['short_text', 'long_text', 'email', 'phone', 'single_choice', 'multiple_choice', 'ranking', 'yes_no', 'matrix'];
export const CHOICE_TYPES = ['single_choice', 'multiple_choice'];

const nonEmpty = v => typeof v === 'string' && v.trim() !== '';
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const bilingual = o => isObj(o) && (nonEmpty(o.en) || nonEmpty(o.ar));
// Respondent-facing texts outside the questions (welcome page, thank-you page). Plain text only; the renderer escapes it.
export const TEXT_LIMITS = { title: 200, subtitle: 300, paragraph: 2000, time: 60, thankTitle: 200, thankBody: 2000, paragraphs: 20 };

const ID_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

// Keys used to store sub-answers; a question id must not be able to collide with them.
const RESERVED = /(__other|_followup)/;

export function flattenQuestions(def) {
  const out = [];
  ((def && def.sections) || []).forEach((s, si) => ((s && s.questions) || []).forEach((q, qi) => out.push({ q, si, qi })));
  return out;
}

// The list of {value,label} entries a question owns, by field name.
export function listFields(q) {
  if (CHOICE_TYPES.includes(q.type)) return { options: q.options };
  if (q.type === 'ranking') return { items: q.items };
  if (q.type === 'matrix') return { rows: q.rows, columns: q.columns };
  return {};
}

// `v` is optional; when present it must be { en?: string, ar?: string } with no text over `max` characters.
function checkText(bad, path, label, v, max) {
  if (v == null) return;
  if (!isObj(v)) { bad(path, `${label} must be an object with optional "en" and "ar" texts.`); return; }
  for (const k of Object.keys(v)) {
    const t = v[k];
    if (k !== 'en' && k !== 'ar') { bad(`${path}.${k}`, `${label}: unsupported language "${k}" (use "en" and "ar").`); continue; }
    if (t != null && typeof t !== 'string') bad(`${path}.${k}`, `${label} (${k.toUpperCase()}) must be plain text, not ${Array.isArray(t) ? 'a list' : typeof t}.`);
    else if (typeof t === 'string' && t.length > max) bad(`${path}.${k}`, `${label} (${k.toUpperCase()}) is too long: ${t.length} characters, the limit is ${max}.`);
  }
}

export function validateDefinition(def) {
  const problems = [];
  const bad = (path, message) => problems.push({ path, message });

  if (!isObj(def)) return { ok: false, problems: [{ path: '', message: 'Definition must be a JSON object.' }] };
  if (!bilingual(def.title)) bad('title', 'Survey title needs an English or Arabic text.');
  if (def.intro != null) {
    if (!isObj(def.intro)) bad('intro', 'The welcome page settings (intro) must be an object.');
    else {
      const i = def.intro;
      checkText(bad, 'intro.title', 'Welcome title', i.title, TEXT_LIMITS.title);
      checkText(bad, 'intro.subtitle', 'Welcome subtitle', i.subtitle, TEXT_LIMITS.subtitle);
      checkText(bad, 'intro.estimated_time', 'Estimated time', i.estimated_time, TEXT_LIMITS.time);
      if (i.body != null) {
        if (!Array.isArray(i.body)) bad('intro.body', 'Welcome paragraphs (intro.body) must be a list.');
        else {
          if (i.body.length > TEXT_LIMITS.paragraphs) bad('intro.body', `Too many welcome paragraphs: ${i.body.length}, the limit is ${TEXT_LIMITS.paragraphs}.`);
          i.body.forEach((p, n) => checkText(bad, `intro.body[${n}]`, `Welcome paragraph ${n + 1}`, p, TEXT_LIMITS.paragraph));
        }
      }
      for (const f of ['show_deadline', 'show_time']) if (i[f] != null && typeof i[f] !== 'boolean') bad(`intro.${f}`, `intro.${f} must be true or false.`);
    }
  }
  if (def.thank_you != null) {
    if (!isObj(def.thank_you)) bad('thank_you', 'The thank-you page settings (thank_you) must be an object.');
    else {
      checkText(bad, 'thank_you.title', 'Thank-you title', def.thank_you.title, TEXT_LIMITS.thankTitle);
      checkText(bad, 'thank_you.body', 'Thank-you text', def.thank_you.body, TEXT_LIMITS.thankBody);
    }
  }
  if (!Array.isArray(def.sections) || def.sections.length === 0) {
    bad('sections', 'At least one section is required.');
    return { ok: false, problems };
  }

  const secIds = new Set(), qIds = new Set();
  def.sections.forEach((s, si) => {
    const sp = `sections[${si}]`;
    if (!isObj(s)) { bad(sp, 'Section must be an object.'); return; }
    if (!nonEmpty(s.id)) bad(`${sp}.id`, 'Section id is required.');
    else if (secIds.has(s.id)) bad(`${sp}.id`, `Duplicate section id "${s.id}".`);
    else secIds.add(s.id);
    if (!bilingual(s.title)) bad(`${sp}.title`, 'Section title needs an English or Arabic text.');
    if (!Array.isArray(s.questions)) { bad(`${sp}.questions`, 'questions must be an array.'); return; }

    s.questions.forEach((q, qi) => {
      const p = `${sp}.questions[${qi}]`;
      if (!isObj(q)) { bad(p, 'Question must be an object.'); return; }
      const tag = nonEmpty(q.id) ? q.id : p;
      if (!nonEmpty(q.id) || !ID_RE.test(q.id)) bad(`${p}.id`, `Question id "${q.id}" must start with a letter and use only letters, digits and underscores (max 64).`);
      else if (RESERVED.test(q.id)) bad(`${p}.id`, `Question id "${q.id}" may not contain "__other" or "_followup".`);
      else if (qIds.has(q.id)) bad(`${p}.id`, `Duplicate question id "${q.id}".`);
      else qIds.add(q.id);
      if (!QUESTION_TYPES.includes(q.type)) bad(`${p}.type`, `${tag}: unsupported type "${q.type}".`);
      if (!bilingual(q.label)) bad(`${p}.label`, `${tag}: label needs an English or Arabic text.`);
      if (q.required != null && typeof q.required !== 'boolean') bad(`${p}.required`, `${tag}: required must be true/false.`);
      if (q.hidden != null && typeof q.hidden !== 'boolean') bad(`${p}.hidden`, `${tag}: hidden must be true/false.`);
      if (q.allow_other != null && typeof q.allow_other !== 'boolean') bad(`${p}.allow_other`, `${tag}: allow_other must be true/false.`);

      const lists = listFields(q);
      for (const [field, arr] of Object.entries(lists)) {
        if (!Array.isArray(arr) || arr.length === 0) { bad(`${p}.${field}`, `${tag}: at least one entry is required in "${field}".`); continue; }
        const seen = new Set();
        arr.forEach((o, oi) => {
          const op = `${p}.${field}[${oi}]`;
          if (!isObj(o)) { bad(op, `${tag}: entry must be an object.`); return; }
          if (!nonEmpty(o.value) || String(o.value).length > 100 || o.value === '__other__') bad(`${op}.value`, `${tag}: each entry needs a unique non-empty value (not "__other__").`);
          else if (seen.has(o.value)) bad(`${op}.value`, `${tag}: duplicate value "${o.value}" in "${field}".`);
          else seen.add(o.value);
          if (!bilingual(o.label)) bad(`${op}.label`, `${tag}: entry ${oi + 1} of "${field}" needs an English or Arabic text.`);
        });
      }
      if (q.type === 'yes_no' && q.followup != null) {
        if (!isObj(q.followup) || !['short_text', 'long_text'].includes(q.followup.type)) bad(`${p}.followup`, `${tag}: follow-up must be short_text or long_text.`);
        else if (!bilingual(q.followup.label)) bad(`${p}.followup.label`, `${tag}: follow-up label needs an English or Arabic text.`);
        if (q.followup_if != null && !['yes', 'no'].includes(q.followup_if)) bad(`${p}.followup_if`, `${tag}: followup_if must be "yes" or "no".`);
      }
    });
  });
  return { ok: problems.length === 0, problems };
}

// Rules once a survey has responses: nothing that already holds data may be
// deleted or re-typed. Adding, relabelling, reordering and required toggles are fine;
// questions are retired with "hidden": true instead of being removed.
export function checkCompatibility(oldDef, newDef) {
  const problems = [];
  const add = (id, message) => problems.push({ id, message });
  const next = new Map(flattenQuestions(newDef).map(x => [x.q.id, x.q]));

  for (const { q: oq } of flattenQuestions(oldDef)) {
    const nq = next.get(oq.id);
    if (!nq) { add(oq.id, 'question deleted — use "Hide question" instead'); continue; }
    if (nq.type !== oq.type) { add(oq.id, `type changed from ${oq.type} to ${nq.type}`); continue; }
    const oldLists = listFields(oq), newLists = listFields(nq);
    for (const field of Object.keys(oldLists)) {
      const have = new Set((newLists[field] || []).map(o => o && o.value));
      const gone = (oldLists[field] || []).map(o => o.value).filter(v => !have.has(v));
      if (gone.length) add(oq.id, `${field} removed or re-valued: ${gone.join(', ')}`);
    }
    if (oq.allow_other && !nq.allow_other) add(oq.id, '"Other" option removed');
    if (oq.type === 'yes_no' && oq.followup && !nq.followup) add(oq.id, 'follow-up question removed');
  }
  return problems;
}

// ─────────────────────────────────────────────────────────────
// Answer formatting — ONE formatter shared by the respondent's printable summary (app.js)
// and the admin CSV export, so both always describe an answer the same way.
//
//   answerLines(q, answers, lang, detail) -> string[]   ([] = unanswered)
//   answerText(q, answers, lang, detail, sep) -> string ('' = unanswered)
//   summarize(def, answers, lang) -> [{ title, questions: [{ num, id, type, kind, label, lines }] }]
//
// detail=false is the compact value used in one CSV cell (typed "Other" text and follow-ups have their own columns);
// detail=true adds the typed "Other" text and the yes/no follow-up text, for the printable summary.
// Hidden questions are skipped by summarize(); numbering matches what respondents saw (hidden ones are not counted).
// ─────────────────────────────────────────────────────────────
const WORDS = { en: { yes: 'Yes', no: 'No', other: 'Other' }, ar: { yes: 'نعم', no: 'لا', other: 'أخرى' } };
const labelOf = (o, lang) => (o == null ? '' : typeof o === 'string' ? o : (o[lang] || o.en || o.ar || ''));
const typed = v => (typeof v === 'string' ? v.trim() : '');

export function answerLines(q, answers, lang = 'en', detail = false) {
  const W = WORDS[lang] || WORDS.en, a = answers || {}, v = a[q.id];
  const other = typed(a[q.id + '__other']);
  const optLabel = (list, value) => { const o = (list || []).find(x => x.value === value); return o ? labelOf(o.label, lang) : String(value); };
  const otherLine = () => (detail && other ? `${W.other}: ${other}` : W.other);

  switch (q.type) {
    case 'single_choice': {
      if (v == null || v === '') return [];
      return [v === '__other__' ? otherLine() : optLabel(q.options, v)];
    }
    case 'multiple_choice': {
      const arr = Array.isArray(v) ? v.filter(x => x !== '' && x != null) : [];
      return arr.map(x => (x === '__other__' ? otherLine() : optLabel(q.options, x)));
    }
    case 'ranking': {
      const arr = Array.isArray(v) ? v : [];
      return arr.map((x, i) => {
        const it = (q.items || []).find(y => y.value === x);
        const base = it ? labelOf(it.label, lang) : String(x);
        return `${i + 1}. ${it && it.is_other && detail && other ? `${base}: ${other}` : base}`;
      });
    }
    case 'yes_no': {
      if (v !== 'yes' && v !== 'no') return [];
      const lines = [W[v]];
      const fu = typed(a[q.id + '_followup']);
      if (detail && q.followup && v === (q.followup_if || 'yes') && fu) lines.push(`${labelOf(q.followup.label, lang)} ${a[q.id + '_followup'].trim()}`.trim());
      return lines;
    }
    case 'matrix': {
      const m = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
      if (!Object.keys(m).length) return [];
      return (q.rows || []).map(r => `${labelOf(r.label, lang)}: ${m[r.value] != null ? optLabel(q.columns, m[r.value]) : (detail ? '—' : '')}`);
    }
    default: {   // short_text, long_text, email, phone
      return typeof v === 'string' && v.trim() !== '' ? [v] : [];
    }
  }
}

export function answerText(q, answers, lang = 'en', detail = false, sep = ' | ') {
  return answerLines(q, answers, lang, detail).join(sep);
}

export function summarize(def, answers, lang = 'en') {
  let n = 0;
  return ((def && def.sections) || []).map(s => ({
    title: labelOf(s.title, lang),
    questions: ((s && s.questions) || []).filter(q => !q.hidden).map(q => {
      n++;
      return {
        num: n, id: q.id, type: q.type, label: labelOf(q.label, lang),
        kind: ['short_text', 'long_text', 'email', 'phone'].includes(q.type) ? 'text' : q.type === 'ranking' ? 'ranking' : q.type === 'matrix' ? 'matrix' : 'list',
        lines: answerLines(q, answers, lang, true)
      };
    })
  })).filter(s => s.questions.length);
}
