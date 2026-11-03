// Survey definition rules, shared by the Worker (server-side enforcement) and the
// admin editor (instant feedback). ES module, no DOM / Cloudflare APIs.
//   validateDefinition(def)            -> { ok, problems: [{ path, message }] }
//   checkCompatibility(oldDef, newDef) -> [{ id, message }]   (only used once responses exist)

export const QUESTION_TYPES = ['short_text', 'long_text', 'email', 'phone', 'single_choice', 'multiple_choice', 'ranking', 'yes_no', 'matrix'];
export const CHOICE_TYPES = ['single_choice', 'multiple_choice'];

const nonEmpty = v => typeof v === 'string' && v.trim() !== '';
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const bilingual = o => isObj(o) && (nonEmpty(o.en) || nonEmpty(o.ar));
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

export function validateDefinition(def) {
  const problems = [];
  const bad = (path, message) => problems.push({ path, message });

  if (!isObj(def)) return { ok: false, problems: [{ path: '', message: 'Definition must be a JSON object.' }] };
  if (!bilingual(def.title)) bad('title', 'Survey title needs an English or Arabic text.');
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
