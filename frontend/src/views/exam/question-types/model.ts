import type { Question, QuestionOptionItem } from '#/api/exam/question/model';

import type { Component } from 'vue';

export const QUESTION_TYPE_DICT = 'exam_question_type';

export interface QuestionFormModel extends Partial<Question> {
  analysis: string;
  attachments: string[];
  autoGrading: string;
  content: string;
  difficulty: string;
  knowledgeCategoryId?: number;
  options: QuestionOptionItem[];
  partialScoreRule: Record<string, any>;
  questionConfig: Record<string, any>;
  questionType: string;
  remark: string;
  standardAnswer: Record<string, any>;
  status: string;
  tags: string[];
}

export interface QuestionPreviewProps {
  question: Partial<Question>;
}

export interface QuestionAnswerProps extends QuestionPreviewProps {
  detail?: any;
  modelValue?: any;
  readonly?: boolean;
  standardAnswerRule?: any;
}

export interface QuestionEditorProps {
  modelValue: QuestionFormModel;
}

export interface QuestionTypeModule {
  answerComponent: Component;
  buildDefaultQuestion: () => Partial<QuestionFormModel>;
  editorComponent: Component;
  fallbackLabel: string;
  getInitialAnswer: (question?: Partial<Question>) => any;
  historyComponent: Component;
  normalizeQuestion: (question: Partial<QuestionFormModel>) => QuestionFormModel;
  normalizeUserAnswer: (answer: any, question?: Partial<Question>) => any;
  previewComponent: Component;
  type: string;
  validateQuestion: (question: QuestionFormModel) => null | string;
}
