import SubjectiveAnswer from '../components/subjective-answer.vue';
import SubjectiveEditor from '../components/subjective-editor.vue';
import SubjectivePreview from '../components/subjective-preview.vue';
import {
  createQuestionFormDefaults,
  normalizeQuestionForm,
  normalizeStringArray,
} from '../helpers';
import type { QuestionTypeModule } from '../model';

export const subjectiveModule: QuestionTypeModule = {
  answerComponent: SubjectiveAnswer,
  buildDefaultQuestion: () =>
    createQuestionFormDefaults('4', {
      options: [],
      partialScoreRule: {},
      questionConfig: {},
      standardAnswer: {
        answers: [],
        keywords: [],
        matchMode: 'any',
      },
    }),
  editorComponent: SubjectiveEditor,
  fallbackLabel: '主观题',
  getInitialAnswer: () => '',
  historyComponent: SubjectiveAnswer,
  normalizeQuestion(question) {
    const normalized = normalizeQuestionForm(question);
    const answerRule = normalized.standardAnswer || {};
    return {
      ...normalized,
      options: [],
      partialScoreRule: {},
      questionConfig:
        normalized.questionConfig && typeof normalized.questionConfig === 'object'
          ? { ...normalized.questionConfig }
          : {},
      standardAnswer: {
        answers: normalizeStringArray(answerRule.answers),
        keywords: normalizeStringArray(answerRule.keywords),
        matchMode: answerRule.matchMode === 'all' ? 'all' : 'any',
      },
    };
  },
  normalizeUserAnswer(answer) {
    return String(answer ?? '').trim();
  },
  previewComponent: SubjectivePreview,
  type: '4',
  validateQuestion(question) {
    if (String(question.autoGrading || '1') === '1') {
      const answers = normalizeStringArray(question.standardAnswer?.answers);
      const keywords = normalizeStringArray(question.standardAnswer?.keywords);
      if (answers.length === 0 && keywords.length === 0) {
        return '主观题开启自动判分时，至少需要配置参考答案或判分关键词';
      }
    }
    return null;
  },
};
