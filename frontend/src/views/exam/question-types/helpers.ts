import type { Question, QuestionOptionItem } from '#/api/exam/question/model';

import type { QuestionFormModel } from './model';

export function createDefaultOptions() {
  return ['A', 'B', 'C', 'D'].map((label) => ({
    key: label,
    label,
    value: '',
  }));
}

export function normalizeOptionList(options?: QuestionOptionItem[]) {
  const source = Array.isArray(options) ? options : [];
  return source.map((item, index) => {
    const label = String(item?.label || item?.key || String.fromCharCode(65 + index));
    return {
      key: String(item?.key || label),
      label,
      value: String(item?.value || ''),
    };
  });
}

export function normalizeStringArray(value: any) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  }
  if (typeof value === 'string') {
    return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
  }
  return [];
}

export function extractAnswerArray(standardAnswer: any) {
  if (standardAnswer && typeof standardAnswer === 'object' && 'answers' in standardAnswer) {
    return normalizeStringArray(standardAnswer.answers);
  }
  return normalizeStringArray(standardAnswer);
}

export function normalizeQuestionForm(question?: Partial<QuestionFormModel> | Partial<Question>) {
  return {
    analysis: String(question?.analysis || ''),
    attachments: normalizeStringArray(question?.attachments),
    autoGrading: String(question?.autoGrading ?? '1'),
    content: String(question?.content || ''),
    difficulty: String(question?.difficulty || '2'),
    knowledgeCategoryId: question?.knowledgeCategoryId
      ? Number(question.knowledgeCategoryId)
      : undefined,
    options: normalizeOptionList(question?.options),
    partialScoreRule:
      question?.partialScoreRule && typeof question.partialScoreRule === 'object'
        ? { ...question.partialScoreRule }
        : {},
    questionConfig:
      question?.questionConfig && typeof question.questionConfig === 'object'
        ? { ...question.questionConfig }
        : {},
    questionId: question?.questionId ? Number(question.questionId) : undefined,
    questionType: String(question?.questionType || '1'),
    remark: String(question?.remark || ''),
    standardAnswer:
      question?.standardAnswer && typeof question.standardAnswer === 'object'
        ? { ...question.standardAnswer }
        : {},
    status: String(question?.status ?? '0'),
    tags: normalizeStringArray(question?.tags),
  } satisfies QuestionFormModel;
}

export function createQuestionFormDefaults(
  questionType = '1',
  overrides: Partial<QuestionFormModel> = {},
) {
  return normalizeQuestionForm({
    analysis: '',
    attachments: [],
    autoGrading: '1',
    content: '',
    difficulty: '2',
    options: createDefaultOptions(),
    partialScoreRule: {},
    questionConfig: {},
    questionType,
    remark: '',
    standardAnswer: {},
    status: '0',
    tags: [],
    ...overrides,
  });
}

export function getJudgeOptions() {
  return [
    { key: 'true', label: '正确', value: '正确' },
    { key: 'false', label: '错误', value: '错误' },
  ];
}
