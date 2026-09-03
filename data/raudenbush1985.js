// Teacher-expectancy ("Pygmalion effect") meta-analytic dataset.
// Source of record: Raudenbush, S. W. (1984), J. Educational Psychology 76(1), 85-97;
// Raudenbush & Bryk (1985), J. Educational Statistics 10(2), 75-98.
// Values transcribed from the open metadat distribution (dat.raudenbush1985),
// https://wviechtb.github.io/metadat/reference/dat.raudenbush1985.html
// yi = standardized mean difference (positive = expectancy group scored higher IQ)
// vi = sampling variance of yi
// weeks = weeks of teacher-student contact BEFORE the expectancy induction

const METADAT_URL = 'https://wviechtb.github.io/metadat/reference/dat.raudenbush1985.html';
const SYNTHESIS_DOI = '10.1037/0022-0663.76.1.85';

function enrichRecord(record, index) {
  const splitExperiment = record.id === 's04' || record.id === 's05';
  return {
    ...record,
    experiment_id: splitExperiment ? 'pellegrini-hicks-1972' : `experiment-${record.id}`,
    record_role: splitExperiment ? `${record.tester}-tester condition` : 'experiment estimate',
    smd_variant: 'Hedges_g',
    effect_direction: 'positive = higher measured IQ in the expectancy group than control',
    collection_frame: 'Experiments included in the Raudenbush (1984) teacher-expectancy synthesis',
    study_design: 'expectancy-induction experiment (classification transcribed from the synthesis; primary design not independently verified)',
    outcome: 'pupil IQ',
    timepoint: 'not collected in the analytic dataset',
    provenance: {
      source_type: 'secondary_dataset',
      source: 'metadat::dat.raudenbush1985',
      source_url: METADAT_URL,
      source_locator: `dat.raudenbush1985 row ${index + 1} (${record.id})`,
      quote: null,
      derivation: 'yi and vi transcribed from metadat; not independently re-derived from the primary report',
      synthesis_doi: SYNTHESIS_DOI,
      synthesis_locator: 'Raudenbush (1984), Table 1 and analytic dataset',
      primary_source_checked: false,
      effect_size_derivation_checked: false,
      verification_status: 'secondary_source_transcription',
    },
    risk_of_bias: {
      status: 'not_assessed', instrument: null, domains: [],
      note: 'No structured risk-of-bias assessment ships for this record.',
    },
  };
}

export const DATASET = {
  id: 'raudenbush1985',
  label: 'Teacher expectancy and pupil IQ (18 experiments; 19 effect-size records)',
  record_count: 19,
  experiment_count: 18,
  unit_note: 'The source reports 18 experiments. This table has 19 effect-size records because the Pellegrini & Hicks (1972) aware- and blind-tester conditions are represented separately. The reference analysis reproduces the 19-row metafor fit and does not model within-experiment covariance.',
  provenance_note: 'All 19 yi/vi records are secondary-dataset transcriptions. No primary report extraction or structured risk-of-bias assessment is claimed.',
  sources: {
    analytic_dataset: { label: 'metadat::dat.raudenbush1985', url: METADAT_URL },
    synthesis: { doi: SYNTHESIS_DOI, url: `https://doi.org/${SYNTHESIS_DOI}`, locator: 'Raudenbush (1984), pp. 85–97; Table 1' },
  },
  effect_measure: 'SMD',
  smd_variant: 'Hedges_g',
  effect_direction: 'positive = higher measured IQ in the expectancy group than control',
  collection_frame: 'Experiments included in the Raudenbush (1984) teacher-expectancy synthesis',
  fields: {
    yi: 'standardized mean difference (Hedges-type d)',
    vi: 'sampling variance of yi',
    weeks: 'weeks of prior teacher-student contact before induction',
    setting: 'testing setting (group / individual)',
    tester: 'tester aware or blind to condition',
    experiment_id: 'experiment cluster; s04 and s05 are two records from one experiment',
  },
  studies: [
    { id: 's01', author: 'Rosenthal et al.',    year: 1974, weeks: 2,  setting: 'group', tester: 'aware', n1i: 77,  n2i: 339, yi:  0.03, vi: 0.0156 },
    { id: 's02', author: 'Conn et al.',         year: 1968, weeks: 21, setting: 'group', tester: 'aware', n1i: 60,  n2i: 198, yi:  0.12, vi: 0.0216 },
    { id: 's03', author: 'Jose & Cody',         year: 1971, weeks: 19, setting: 'group', tester: 'aware', n1i: 72,  n2i: 72,  yi: -0.14, vi: 0.0279 },
    { id: 's04', author: 'Pellegrini & Hicks',  year: 1972, weeks: 0,  setting: 'group', tester: 'aware', n1i: 11,  n2i: 22,  yi:  1.18, vi: 0.1391 },
    { id: 's05', author: 'Pellegrini & Hicks',  year: 1972, weeks: 0,  setting: 'group', tester: 'blind', n1i: 11,  n2i: 22,  yi:  0.26, vi: 0.1362 },
    { id: 's06', author: 'Evans & Rosenthal',   year: 1969, weeks: 3,  setting: 'group', tester: 'aware', n1i: 129, n2i: 348, yi: -0.06, vi: 0.0106 },
    { id: 's07', author: 'Fielder et al.',      year: 1971, weeks: 17, setting: 'group', tester: 'blind', n1i: 110, n2i: 636, yi: -0.02, vi: 0.0106 },
    { id: 's08', author: 'Claiborn',            year: 1969, weeks: 24, setting: 'group', tester: 'aware', n1i: 26,  n2i: 99,  yi: -0.32, vi: 0.0484 },
    { id: 's09', author: 'Kester',              year: 1969, weeks: 0,  setting: 'group', tester: 'aware', n1i: 75,  n2i: 74,  yi:  0.27, vi: 0.0269 },
    { id: 's10', author: 'Maxwell',             year: 1970, weeks: 1,  setting: 'indiv', tester: 'blind', n1i: 32,  n2i: 32,  yi:  0.80, vi: 0.0630 },
    { id: 's11', author: 'Carter',              year: 1970, weeks: 0,  setting: 'group', tester: 'blind', n1i: 22,  n2i: 22,  yi:  0.54, vi: 0.0912 },
    { id: 's12', author: 'Flowers',             year: 1966, weeks: 0,  setting: 'group', tester: 'blind', n1i: 43,  n2i: 38,  yi:  0.18, vi: 0.0497 },
    { id: 's13', author: 'Keshock',             year: 1970, weeks: 1,  setting: 'indiv', tester: 'blind', n1i: 24,  n2i: 24,  yi: -0.02, vi: 0.0835 },
    { id: 's14', author: 'Henrikson',           year: 1970, weeks: 2,  setting: 'indiv', tester: 'blind', n1i: 19,  n2i: 32,  yi:  0.23, vi: 0.0841 },
    { id: 's15', author: 'Fine',                year: 1972, weeks: 17, setting: 'group', tester: 'aware', n1i: 80,  n2i: 79,  yi: -0.18, vi: 0.0253 },
    { id: 's16', author: 'Grieger',             year: 1970, weeks: 5,  setting: 'group', tester: 'blind', n1i: 72,  n2i: 72,  yi: -0.06, vi: 0.0279 },
    { id: 's17', author: 'Rosenthal & Jacobson',year: 1968, weeks: 1,  setting: 'group', tester: 'aware', n1i: 65,  n2i: 255, yi:  0.30, vi: 0.0193 },
    { id: 's18', author: 'Fleming & Anttonen',  year: 1971, weeks: 2,  setting: 'group', tester: 'blind', n1i: 233, n2i: 224, yi:  0.07, vi: 0.0088 },
    { id: 's19', author: 'Ginsburg',            year: 1970, weeks: 7,  setting: 'group', tester: 'aware', n1i: 65,  n2i: 67,  yi: -0.07, vi: 0.0303 },
  ].map(enrichRecord),
};
