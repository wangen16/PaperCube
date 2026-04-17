import { getDictOptions } from '#/utils/dict';

import { judgeModule } from './modules/judge';
import { multiChoiceModule } from './modules/multi-choice';
import { singleChoiceModule } from './modules/single-choice';
import { subjectiveModule } from './modules/subjective';
import type { QuestionFormModel, QuestionTypeModule } from './model';
import { QUESTION_TYPE_DICT } from './model';

const questionTypeModules: QuestionTypeModule[] = [
  singleChoiceModule,
  multiChoiceModule,
  judgeModule,
  subjectiveModule,
];

const questionTypeModuleMap = new Map(
  questionTypeModules.map((item) => [String(item.type), item]),
);

export function getQuestionTypeModule(type?: null | number | string) {
  return questionTypeModuleMap.get(String(type || ''));
}

export function getQuestionTypeModuleOrThrow(type?: null | number | string) {
  const module = getQuestionTypeModule(type);
  if (!module) {
    throw new Error('当前题型未注册');
  }
  return module;
}

export function getQuestionTypeOptions() {
  const dictOptions = getDictOptions(QUESTION_TYPE_DICT);
  if (dictOptions.length > 0) {
    return dictOptions;
  }
  return questionTypeModules.map((item) => ({
    label: item.fallbackLabel,
    value: item.type,
  }));
}

export function getQuestionTypeLabel(type?: null | number | string) {
  const dictLabel = getQuestionTypeOptions().find(
    (item) => String(item.value) === String(type ?? ''),
  )?.label;
  if (dictLabel) {
    return dictLabel;
  }
  return getQuestionTypeModule(type)?.fallbackLabel || '--';
}

export function normalizeQuestionByType(question: Partial<QuestionFormModel>) {
  const module = getQuestionTypeModule(question.questionType);
  if (!module) {
    return question as QuestionFormModel;
  }
  return module.normalizeQuestion(question);
}
