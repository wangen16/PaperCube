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

export const singleChoiceModule: QuestionTypeModule = {
  answerComponent: ObjectiveAnswer,
  buildDefaultQuestion: () =>
    createQuestionFormDefaults('1', {
      options: createDefaultOptions(),
      partialScoreRule: {},
      questionConfig: {},
      standardAnswer: { answers: [] },
    }),
  editorComponent: ObjectiveEditor,
  fallbackLabel: '单选题',
  getInitialAnswer: () => '',
  historyComponent: ObjectiveAnswer,
  normalizeQuestion(question) {
    const normalized = normalizeQuestionForm(question);
    const answers = extractAnswerArray(normalized.standardAnswer);
    return {
      ...normalized,
      options:
        normalized.options.length > 0 ? normalizeOptionList(normalized.options) : createDefaultOptions(),
      partialScoreRule: {},
      questionConfig: {},
      standardAnswer: {
        answers: answers.length > 0 ? [answers[0]] : [],
      },
    };
  },
  normalizeUserAnswer(answer) {
    return String(answer ?? '').trim();
  },
  previewComponent: ObjectivePreview,
  type: '1',
  validateQuestion(question) {
    if (question.options.filter((item) => String(item.value || '').trim()).length < 2) {
      return '单选题至少需要 2 个选项';
    }
    if (extractAnswerArray(question.standardAnswer).length !== 1) {
      return '单选题必须设置 1 个标准答案';
    }
    return null;
  },
};
