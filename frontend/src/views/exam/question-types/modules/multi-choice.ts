import ObjectiveAnswer from '../components/objective-answer.vue';
import ObjectiveEditor from '../components/objective-editor.vue';
import ObjectivePreview from '../components/objective-preview.vue';
import {
  createDefaultOptions,
  createQuestionFormDefaults,
  extractAnswerArray,
  normalizeOptionList,
  normalizeQuestionForm,
} from '../helpers';
import type { QuestionTypeModule } from '../model';

export const multiChoiceModule: QuestionTypeModule = {
  answerComponent: ObjectiveAnswer,
  buildDefaultQuestion: () =>
    createQuestionFormDefaults('2', {
      options: createDefaultOptions(),
      partialScoreRule: { mode: 'zero_if_not_full_correct' },
      questionConfig: {},
      standardAnswer: { answers: [] },
    }),
  editorComponent: ObjectiveEditor,
  fallbackLabel: '多选题',
  getInitialAnswer: () => [],
  historyComponent: ObjectiveAnswer,
  normalizeQuestion(question) {
    const normalized = normalizeQuestionForm(question);
    return {
      ...normalized,
      options:
        normalized.options.length > 0 ? normalizeOptionList(normalized.options) : createDefaultOptions(),
      partialScoreRule: {
        mode: normalized.partialScoreRule?.mode || 'zero_if_not_full_correct',
      },
      questionConfig: {},
      standardAnswer: {
        answers: extractAnswerArray(normalized.standardAnswer),
      },
    };
  },
  normalizeUserAnswer(answer) {
    return extractAnswerArray({ answers: answer });
  },
  previewComponent: ObjectivePreview,
  type: '2',
  validateQuestion(question) {
    if (question.options.filter((item) => String(item.value || '').trim()).length < 2) {
      return '多选题至少需要 2 个选项';
    }
    if (extractAnswerArray(question.standardAnswer).length === 0) {
      return '多选题至少需要设置 1 个标准答案';
    }
    return null;
  },
};
