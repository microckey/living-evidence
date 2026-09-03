// evidence-package.js — strict, local-only authoring interchange.
// Parses data; never executes notebook cells, evaluates formulas, fetches URLs,
// or approves evidence. JSON inputs follow the published schema without coercion;
// CSV text receives only the numeric conversions that its wire format requires.

export const PACKAGE_VERSION = 'living-evidence-smd-package/1';
export const SMD_VARIANTS = ['Hedges_g', 'Cohen_d', 'Glass_delta', 'other'];
export const REQUIRED_COLUMNS = [
  'id', 'author', 'year', 'yi', 'vi', 'weeks', 'source', 'quote',
  'source_locator', 'derivation', 'study_design', 'outcome', 'timepoint',
  'experiment_id', 'risk_of_bias_status',
  // CSV has no outer object, so these package-level fields repeat on every row.
  'smd_variant', 'effect_direction', 'collection_frame',
];
const OPTIONAL_COLUMNS = [
  'setting', 'tester', 'n1i', 'n2i', 'source_url', 'doi', 'record_role',
  'risk_of_bias_instrument', 'risk_of_bias_assessor', 'risk_of_bias_date',
  'risk_of_bias_source', 'risk_of_bias_overall_rationale',
  'risk_of_bias_domains_json', 'smd_variant_detail',
];
const ALLOWED_COLUMNS = new Set([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);
const STUDY_KEYS = new Set([
  'id', 'author', 'year', 'yi', 'vi', 'weeks', 'source', 'quote',
  'source_url', 'source_locator', 'doi', 'derivation', 'setting', 'tester',
  'n1i', 'n2i', 'study_design', 'outcome', 'timepoint', 'experiment_id',
  'record_role', 'risk_of_bias_status', 'risk_of_bias_instrument',
  'risk_of_bias_assessor', 'risk_of_bias_date', 'risk_of_bias_source',
  'risk_of_bias_overall_rationale', 'risk_of_bias_domains',
]);
const DATASET_KEYS = new Set([
  'id', 'label', 'effect_measure', 'smd_variant', 'smd_variant_detail',
  'effect_direction', 'collection_frame',
]);
const TOP_KEYS = new Set(['schema_version', 'dataset', 'studies', 'claims', 'source_artifact']);
const SOURCE_ARTIFACT_KEYS = new Set(['filename', 'media_type', 'sha256']);
const DIRECT_IDENTIFIER_COLUMNS = new Set([
  'name', 'full_name', 'email', 'phone', 'address', 'patient_id',
  'participant_id', 'subject_id', 'medical_record_number',
]);

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function assertKnownKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`${label} has unknown field(s): ${unknown.join(', ')}`);
}

/** RFC 4180-style parser: BOM, CRLF, quoted commas/newlines and doubled quotes. */
export function parseCsvRfc4180(text) {
  const source = String(text).replace(/^\uFEFF/, '');
  if (source.includes('\0')) throw new Error('CSV contains a NUL byte');
  const rows = [];
  let row = [];
  let cell = '';
  let state = 'unquoted';
  const finishRow = () => { row.push(cell); rows.push(row); row = []; cell = ''; state = 'unquoted'; };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (state === 'quoted') {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') state = 'after_quote';
      else cell += ch;
    } else if (state === 'after_quote') {
      if (ch === ',') { row.push(cell); cell = ''; state = 'unquoted'; }
      else if (ch === '\n') finishRow();
      else if (ch === '\r' && source[i + 1] === '\n') { i++; finishRow(); }
      else throw new Error(`CSV has unexpected character after a closing quote at offset ${i}`);
    } else if (ch === '"') {
      if (cell !== '') throw new Error(`CSV quote must begin a field at offset ${i}`);
      state = 'quoted';
    } else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') finishRow();
    else if (ch === '\r') {
      if (source[i + 1] !== '\n') throw new Error(`CSV has a bare carriage return at offset ${i}`);
      i++; finishRow();
    } else cell += ch;
  }
  if (state === 'quoted') throw new Error('CSV ends inside a quoted field');
  if (cell !== '' || row.length || state === 'after_quote') { row.push(cell); rows.push(row); }
  while (rows.length && rows.at(-1).every((value) => value === '')) rows.pop();
  if (!rows.length) throw new Error('CSV is empty');
  const headers = rows[0].map((value) => value.trim());
  if (headers.some((header) => !header)) throw new Error('CSV has a blank header');
  if (new Set(headers).size !== headers.length) throw new Error('CSV has duplicate headers');
  const sensitive = headers.filter((header) => DIRECT_IDENTIFIER_COLUMNS.has(header.toLowerCase()));
  if (sensitive.length) throw new Error(`participant-level identifier columns are not accepted: ${sensitive.join(', ')}`);
  const unknown = headers.filter((header) => !ALLOWED_COLUMNS.has(header));
  if (unknown.length) throw new Error(`unknown CSV column(s): ${unknown.join(', ')}`);
  const missing = REQUIRED_COLUMNS.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`missing required CSV column(s): ${missing.join(', ')}`);
  return rows.slice(1).filter((values) => values.some((value) => value !== '')).map((values, index) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${values.length} cells; expected ${headers.length}`);
    return Object.fromEntries(headers.map((header, column) => [header, values[column]]));
  });
}

function finiteNumber(value, field, row, allowNumericStrings) {
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === '' || raw === null || raw === undefined) throw new Error(`record ${row}: missing ${field}`);
  if (typeof raw === 'boolean' || typeof raw === 'object') throw new Error(`record ${row}: ${field} must be a number`);
  if (typeof raw === 'string' && !allowNumericStrings) throw new Error(`record ${row}: ${field} must be a JSON number, not a string`);
  if (typeof raw === 'string' && /\d,\d/.test(raw)) throw new Error(`record ${row}: ${field} must use a dot decimal separator`);
  if (typeof raw === 'string' && !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw)) {
    throw new Error(`record ${row}: ${field} must use JSON-number syntax`);
  }
  const number = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(number)) throw new Error(`record ${row}: ${field} must be a finite number`);
  return number;
}

function stringValue(value, field, { optional = false } = {}) {
  if (value === null || value === undefined || value === '') {
    if (optional) return null;
    throw new Error(`missing ${field}`);
  }
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) {
    if (optional) return null;
    throw new Error(`missing ${field}`);
  }
  return trimmed;
}

const RISK_JUDGMENTS = new Set(['low', 'some_concerns', 'high', 'unclear', 'not_applicable']);

function calendarDate(value, field) {
  const date = stringValue(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)
    || Number.isNaN(Date.parse(`${date}T00:00:00Z`))
    || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error(`${field} must be a real calendar date in YYYY-MM-DD format`);
  }
  return date;
}

function normalizeRiskOfBias(input, row) {
  const status = stringValue(input.risk_of_bias_status, `record ${row}.risk_of_bias_status`);
  if (!['low', 'some_concerns', 'high', 'not_assessed'].includes(status)) {
    throw new Error(`record ${row}: invalid risk_of_bias_status`);
  }
  const instrument = stringValue(input.risk_of_bias_instrument, `record ${row}.risk_of_bias_instrument`, { optional: true });
  const assessor = stringValue(input.risk_of_bias_assessor, `record ${row}.risk_of_bias_assessor`, { optional: true });
  const source = stringValue(input.risk_of_bias_source, `record ${row}.risk_of_bias_source`, { optional: true });
  const overallRationale = stringValue(input.risk_of_bias_overall_rationale, `record ${row}.risk_of_bias_overall_rationale`, { optional: true });
  const date = input.risk_of_bias_date === null || input.risk_of_bias_date === undefined || input.risk_of_bias_date === ''
    ? null : calendarDate(input.risk_of_bias_date, `record ${row}.risk_of_bias_date`);
  const domains = input.risk_of_bias_domains === null || input.risk_of_bias_domains === undefined
    ? [] : input.risk_of_bias_domains;
  if (!Array.isArray(domains)) throw new Error(`record ${row}.risk_of_bias_domains must be an array`);
  const normalizedDomains = domains.map((domain, index) => {
    assertPlainObject(domain, `record ${row}.risk_of_bias_domains[${index}]`);
    assertKnownKeys(domain, new Set(['domain', 'judgment', 'rationale']), `record ${row}.risk_of_bias_domains[${index}]`);
    const judgment = stringValue(domain.judgment, `record ${row}.risk_of_bias_domains[${index}].judgment`);
    if (!RISK_JUDGMENTS.has(judgment)) throw new Error(`record ${row}.risk_of_bias_domains[${index}].judgment is invalid`);
    return {
      domain: stringValue(domain.domain, `record ${row}.risk_of_bias_domains[${index}].domain`),
      judgment,
      rationale: stringValue(domain.rationale, `record ${row}.risk_of_bias_domains[${index}].rationale`),
    };
  });
  const normalizedDomainNames = normalizedDomains.map((domain) => domain.domain.toLocaleLowerCase());
  if (new Set(normalizedDomainNames).size !== normalizedDomainNames.length) {
    throw new Error(`record ${row}: risk_of_bias_domains contains duplicate domain names`);
  }
  if (status === 'not_assessed') {
    if (instrument || assessor || date || source || overallRationale || normalizedDomains.length) {
      throw new Error(`record ${row}: risk_of_bias_status not_assessed cannot carry assessment details`);
    }
  } else if (!instrument || !assessor || !date || !source || !overallRationale || !normalizedDomains.length) {
    throw new Error(`record ${row}: an assessed risk_of_bias_status requires instrument, assessor, date, source, overall rationale, and at least one domain judgment with rationale`);
  } else {
    const judgments = normalizedDomains.map((domain) => domain.judgment).filter((judgment) => judgment !== 'not_applicable');
    if (!judgments.length) throw new Error(`record ${row}: an assessed risk of bias cannot contain only not_applicable domains`);
  }
  return {
    risk_of_bias_status: status,
    risk_of_bias_instrument: instrument,
    risk_of_bias_assessor: assessor,
    risk_of_bias_date: date,
    risk_of_bias_source: source,
    risk_of_bias_overall_rationale: overallRationale,
    risk_of_bias_domains: normalizedDomains,
  };
}

function normalizeDataset(input) {
  assertPlainObject(input, 'dataset');
  assertKnownKeys(input, DATASET_KEYS, 'dataset');
  if (input.effect_measure !== 'SMD') throw new Error('dataset.effect_measure must be SMD');
  const smdVariant = stringValue(input.smd_variant, 'dataset.smd_variant');
  if (!SMD_VARIANTS.includes(smdVariant)) throw new Error(`dataset.smd_variant must be one of: ${SMD_VARIANTS.join(', ')}`);
  const smdVariantDetail = stringValue(input.smd_variant_detail, 'dataset.smd_variant_detail', { optional: true });
  if (smdVariant === 'other' && !smdVariantDetail) throw new Error('dataset.smd_variant_detail is required when smd_variant is other');
  return {
    id: stringValue(input.id, 'dataset.id'),
    label: stringValue(input.label, 'dataset.label'),
    effect_measure: 'SMD',
    smd_variant: smdVariant,
    smd_variant_detail: smdVariantDetail,
    effect_direction: stringValue(input.effect_direction, 'dataset.effect_direction'),
    collection_frame: stringValue(input.collection_frame, 'dataset.collection_frame'),
  };
}

function normalizeRecord(input, index, allowNumericStrings) {
  assertPlainObject(input, `record ${index + 1}`);
  assertKnownKeys(input, STUDY_KEYS, `record ${index + 1}`);
  const row = index + 1;
  const year = finiteNumber(input.year, 'year', row, allowNumericStrings);
  const yi = finiteNumber(input.yi, 'yi', row, allowNumericStrings);
  const vi = finiteNumber(input.vi, 'vi', row, allowNumericStrings);
  const weeks = finiteNumber(input.weeks, 'weeks', row, allowNumericStrings);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw new Error(`record ${row}: year must be an integer from 1900 to 2100`);
  if (Math.abs(yi) > 10) throw new Error(`record ${row}: |yi| must be <= 10`);
  if (!(vi > 0 && vi <= 10)) throw new Error(`record ${row}: vi must be > 0 and <= 10`);
  if (weeks < 0 || weeks > 500) throw new Error(`record ${row}: weeks must be from 0 to 500`);
  const setting = stringValue(input.setting, `record ${row}.setting`, { optional: true });
  const tester = stringValue(input.tester, `record ${row}.tester`, { optional: true });
  if (setting && !['group', 'indiv'].includes(setting)) throw new Error(`record ${row}: setting must be group or indiv`);
  if (tester && !['aware', 'blind'].includes(tester)) throw new Error(`record ${row}: tester must be aware or blind`);
  const risk = normalizeRiskOfBias(input, row);
  const out = {
    id: stringValue(input.id, `record ${row}.id`),
    author: stringValue(input.author, `record ${row}.author`),
    year, yi, vi, weeks, setting, tester,
    source: stringValue(input.source, `record ${row}.source`),
    quote: stringValue(input.quote, `record ${row}.quote`),
    n1i: input.n1i === '' || input.n1i == null ? null : finiteNumber(input.n1i, 'n1i', row, allowNumericStrings),
    n2i: input.n2i === '' || input.n2i == null ? null : finiteNumber(input.n2i, 'n2i', row, allowNumericStrings),
    derivation: stringValue(input.derivation, `record ${row}.derivation`),
    source_url: stringValue(input.source_url, `record ${row}.source_url`, { optional: true }),
    source_locator: stringValue(input.source_locator, `record ${row}.source_locator`),
    doi: stringValue(input.doi, `record ${row}.doi`, { optional: true }),
    study_design: stringValue(input.study_design, `record ${row}.study_design`),
    outcome: stringValue(input.outcome, `record ${row}.outcome`),
    timepoint: stringValue(input.timepoint, `record ${row}.timepoint`),
    experiment_id: stringValue(input.experiment_id, `record ${row}.experiment_id`),
    record_role: stringValue(input.record_role, `record ${row}.record_role`, { optional: true }),
    ...risk,
  };
  for (const name of ['n1i', 'n2i']) {
    if (out[name] !== null && (!Number.isInteger(out[name]) || out[name] < 1)) throw new Error(`record ${row}: ${name} must be a positive integer`);
  }
  return out;
}

function normalizeSourceArtifact(input) {
  if (input === null || input === undefined) return null;
  assertPlainObject(input, 'source_artifact');
  assertKnownKeys(input, SOURCE_ARTIFACT_KEYS, 'source_artifact');
  const sha256 = stringValue(input.sha256, 'source_artifact.sha256');
  if (!/^sha256:[0-9a-f]{64}$/.test(sha256)) throw new Error('source_artifact.sha256 must be sha256: followed by 64 lowercase hex characters');
  return {
    filename: stringValue(input.filename, 'source_artifact.filename'),
    media_type: stringValue(input.media_type, 'source_artifact.media_type'),
    sha256,
  };
}

export function normalizeEvidencePackage(input, { allowNumericStrings = false, sourceArtifact = undefined } = {}) {
  assertPlainObject(input, 'evidence package');
  assertKnownKeys(input, TOP_KEYS, 'evidence package');
  if (input.schema_version !== PACKAGE_VERSION) throw new Error(`schema_version must be ${PACKAGE_VERSION}`);
  const dataset = normalizeDataset(input.dataset);
  if (!Array.isArray(input.studies) || !input.studies.length) throw new Error('evidence package needs a non-empty studies array');
  if (input.studies.length > 100) throw new Error('browser import is capped at 100 records; use a reviewed batch pipeline for larger corpora');
  const studies = input.studies.map((record, index) => normalizeRecord(record, index, allowNumericStrings));
  const ids = new Set();
  const experiments = new Set();
  const exact = [];
  for (const study of studies) {
    if (ids.has(study.id)) throw new Error(`evidence package has duplicate record id ${study.id}`);
    ids.add(study.id);
    if (experiments.has(study.experiment_id)) {
      throw new Error(`experiment_id ${study.experiment_id} appears more than once; v1 cannot model dependent effects, so supply one independent effect per experiment`);
    }
    experiments.add(study.experiment_id);
    const duplicate = exact.find((candidate) => candidate.author === study.author
      && candidate.year === study.year && Math.abs(candidate.yi - study.yi) < 1e-9);
    if (duplicate) throw new Error(`evidence package repeats ${study.author} (${study.year}) with yi=${study.yi}`);
    exact.push(study);
  }
  if (input.claims !== undefined && !Array.isArray(input.claims)) throw new Error('claims must be an array');
  return {
    schema_version: PACKAGE_VERSION,
    dataset,
    studies,
    claims: input.claims || [],
    source_artifact: normalizeSourceArtifact(sourceArtifact === undefined ? input.source_artifact : sourceArtifact),
  };
}

function packageFromCsv(text, name, sourceArtifact) {
  const rows = parseCsvRfc4180(text);
  const same = (field) => {
    const values = [...new Set(rows.map((row) => String(row[field]).trim()))];
    if (values.length !== 1 || !values[0]) throw new Error(`CSV column ${field} must contain one non-empty value repeated for every row`);
    return values[0];
  };
  const sameOptional = (field) => {
    const values = [...new Set(rows.map((row) => String(row[field] ?? '').trim()))];
    if (values.length !== 1) throw new Error(`CSV column ${field} must contain one consistent value repeated for every row`);
    return values[0] || null;
  };
  const smdVariant = same('smd_variant');
  const effectDirection = same('effect_direction');
  const collectionFrame = same('collection_frame');
  const smdVariantDetail = sameOptional('smd_variant_detail');
  const studies = rows.map((row, index) => {
    const record = Object.fromEntries(
      Object.entries(row).filter(([key]) => !['smd_variant', 'smd_variant_detail', 'effect_direction', 'collection_frame', 'risk_of_bias_domains_json'].includes(key)),
    );
    const rawDomains = row.risk_of_bias_domains_json?.trim();
    if (rawDomains) {
      try { record.risk_of_bias_domains = JSON.parse(rawDomains); }
      catch (error) { throw new Error(`CSV row ${index + 2}: risk_of_bias_domains_json is not valid JSON (${error.message})`); }
    } else record.risk_of_bias_domains = [];
    return record;
  });
  const stem = String(name || 'csv-import').replace(/\.[^.]+$/, '');
  return normalizeEvidencePackage({
    schema_version: PACKAGE_VERSION,
    dataset: {
      id: stem, label: name || 'CSV import', effect_measure: 'SMD',
      smd_variant: smdVariant, smd_variant_detail: smdVariantDetail,
      effect_direction: effectDirection, collection_frame: collectionFrame,
    },
    studies,
    source_artifact: sourceArtifact,
  }, { allowNumericStrings: true });
}

function extractQmd(text) {
  const match = String(text).match(/```\{living-evidence\}\s*\n([\s\S]*?)\n```/);
  if (!match) throw new Error('Quarto file needs one ```{living-evidence} fenced JSON package');
  return JSON.parse(match[1]);
}

function extractNotebook(text) {
  const notebook = JSON.parse(text);
  if (notebook?.metadata?.living_evidence) return notebook.metadata.living_evidence;
  const cell = (notebook?.cells || []).find((item) => Array.isArray(item?.metadata?.tags) && item.metadata.tags.includes('living-evidence-manifest'));
  if (!cell) throw new Error('Notebook needs metadata.living_evidence or a cell tagged living-evidence-manifest');
  return JSON.parse(Array.isArray(cell.source) ? cell.source.join('') : String(cell.source || ''));
}

/** Parse supported authoring artifacts without executing them or fetching links. */
export function parseEvidenceContent(text, filename = 'evidence.json', { sourceArtifact = undefined } = {}) {
  const content = String(text);
  if (new TextEncoder().encode(content).length > 1024 * 1024) throw new Error('import exceeds the 1 MiB browser limit');
  const lower = String(filename).toLowerCase();
  if (lower.endsWith('.csv')) return packageFromCsv(content, filename, sourceArtifact);
  if (lower.endsWith('.qmd')) return normalizeEvidencePackage(extractQmd(content), { sourceArtifact });
  if (lower.endsWith('.ipynb')) return normalizeEvidencePackage(extractNotebook(content), { sourceArtifact });
  return normalizeEvidencePackage(JSON.parse(content), { sourceArtifact });
}
