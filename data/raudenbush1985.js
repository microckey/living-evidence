// Teacher-expectancy ("Pygmalion effect") meta-analytic dataset.
// Source of record: Raudenbush, S. W. (1984), J. Educational Psychology 76(1), 85-97;
// Raudenbush & Bryk (1985), J. Educational Statistics 10(2), 75-98.
// Values transcribed from the open metadat distribution (dat.raudenbush1985),
// https://wviechtb.github.io/metadat/reference/dat.raudenbush1985.html
// yi = standardized mean difference (positive = expectancy group scored higher IQ)
// vi = sampling variance of yi
// weeks = weeks of teacher-student contact BEFORE the expectancy induction

export const DATASET = {
  id: 'raudenbush1985',
  label: 'Teacher expectancy and pupil IQ (19 studies)',
  effect_measure: 'SMD',
  fields: {
    yi: 'standardized mean difference (Hedges-type d)',
    vi: 'sampling variance of yi',
    weeks: 'weeks of prior teacher-student contact before induction',
    setting: 'testing setting (group / individual)',
    tester: 'tester aware or blind to condition',
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
  ],
};
