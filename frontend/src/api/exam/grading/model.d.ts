export interface ExamRecordRow {
  createTime?: string;
  examId?: number;
  examTitle?: string;
  recordId: number;
  startTime?: string;
  status: string;
  submitTime?: string;
  totalScore?: number;
  userAnswers?: Record<string, any>;
  userId?: number;
  userName?: string;
}

export interface ExamRecordDetail {
  detailId?: number;
  isCorrect?: string;
  questionId: number;
  score: number;
  userAnswer?: any;
}

export interface GradingDetailResponse {
  details: ExamRecordDetail[];
  record: ExamRecordRow;
  snapshot: {
    paperJson: {
      passScore?: number;
      questions: Array<Record<string, any>>;
      title?: string;
      totalScore?: number;
    };
    standardAnswerJson: {
      questions: Array<Record<string, any>>;
    };
  } | null;
}
