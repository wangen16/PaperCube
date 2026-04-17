export interface QuestionOptionItem {
  key: string;
  label: string;
  value: string;
}

export interface SubjectiveAnswerRule {
  answers?: string[];
  keywords?: string[];
  matchMode?: 'all' | 'any';
}

export interface Question {
  analysis?: string;
  attachments?: string[];
  autoGrading: string;
  content: string;
  createTime?: string;
  difficulty: string;
  knowledgeCategoryId: number;
  knowledgeCategoryName?: string;
  options?: QuestionOptionItem[];
  partialScoreRule?: Record<string, any>;
  questionConfig?: Record<string, any>;
  questionId: number;
  questionType: string;
  remark?: string;
  standardAnswer?: any;
  status: string;
  tags?: string[];
}
