import ObjectiveAnswer from '../components/objective-answer.vue';
import ObjectiveEditor from '../components/objective-editor.vue';
import ObjectivePreview from '../components/objective-preview.vue';
import {
  createQuestionFormDefaults,
  extractAnswerArray,
  normalizeQuestionForm,
} from '../helpers';
import type { QuestionTypeModule } from '../model';

export const judgeModule: QuestionTypeModule = {
  answerComponent: ObjectiveAnswer,
  buildDefaultQuestion: () =>
    createQuestionFormDefaults('3', {
      options: [],
      partialScoreRule: {},
      questionConfig: {},
      standardAnswer: { answers: ['true'] },
    }),
  editorComponent: ObjectiveEditor,
  fallbackLabel: '判断题',
  getInitialAnswer: () => '',
  historyComponent: ObjectiveAnswer,
  normalizeQuestion(question) {
    const normalized = normalizeQuestionForm(question);
    const answers = extractAnswerArray(normalized.standardAnswer);
    return {
      ...normalized,
      options: [],
      partialScoreRule: {},
      questionConfig: {},
      standardAnswer: {
        answers: answers.length > 0 ? [answers[0]] : ['true'],
      },
    };
  },
  normalizeUserAnswer(answer) {
    return String(answer ?? '').trim();
  },
  previewComponent: ObjectivePreview,
  type: '3',
  validateQuestion(question) {
    const answer = extractAnswerArray(question.standardAnswer)[0];
    if (!['false', 'true'].includes(String(answer || ''))) {
      return '判断题标准答案必须是正确或错误';
    }
    return null;
  },
};
