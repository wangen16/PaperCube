export const QUESTION_DIFFICULTY_OPTIONS = [
  { label: '1 星', value: '1' },
  { label: '2 星', value: '2' },
  { label: '3 星', value: '3' },
  { label: '4 星', value: '4' },
  { label: '5 星', value: '5' },
];

export const EXAM_STATUS_OPTIONS = [
  { label: '草稿', value: '0' },
  { label: '已发布', value: '1' },
  { label: '已撤回', value: '2' },
  { label: '已归档', value: '3' },
];

export const EXAM_TIME_MODE_OPTIONS = [
  { label: '固定起止', value: '1' },
  { label: '仅限时长', value: '2' },
  { label: '无限制', value: '3' },
];

export const RECORD_STATUS_OPTIONS = [
  { label: '答题中', value: '0' },
  { label: '已交卷', value: '1' },
  { label: '待阅卷', value: '2' },
  { label: '已阅卷', value: '3' },
  { label: '未开始', value: 'NOT_STARTED' },
];

export const AUTO_GRADING_OPTIONS = [
  { label: '自动判分', value: '1' },
  { label: '人工判分', value: '0' },
];

export const MULTI_SELECT_SCORING_OPTIONS = [
  { label: '少选半分', value: 'half_if_partial_correct' },
  { label: '少选零分', value: 'zero_if_not_full_correct' },
];

export const TARGET_TYPE_OPTIONS = [
  { label: '班级', value: '1' },
  { label: '学生', value: '2' },
];

export function getOptionLabel(
  options: Array<{ label: string; value: string }>,
  value: null | number | string | undefined,
) {
  return options.find((item) => String(item.value) === String(value))?.label || '--';
}

export function stripHtml(value: string) {
  if (!value) return '';
  let str = String(value).replaceAll(/<[^>]+>/g, ' ');
  if (typeof document !== 'undefined') {
    const txt = document.createElement('textarea');
    txt.innerHTML = str;
    str = txt.value;
  } else {
    str = str.replaceAll(/&nbsp;/g, ' ');
  }
  return str.replaceAll(/\s+/g, ' ').trim();
}

export function normalizeDifficulty(value: null | number | string | undefined) {
  const difficulty = Number(value || 0);
  if (Number.isNaN(difficulty) || difficulty < 1) {
    return 1;
  }
  if (difficulty > 5) {
    return 5;
  }
  return difficulty;
}

export function getDifficultyText(value: null | number | string | undefined) {
  return `${normalizeDifficulty(value)} 星`;
}
