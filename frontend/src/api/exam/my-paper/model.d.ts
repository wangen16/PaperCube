import type { ExamManage } from '../manage/model';
import type { ExamRecordDetail, ExamRecordRow } from '../grading/model';

export interface MyPaperRow {
  canStart: boolean;
  canViewDetail: boolean;
  examId: number;
  score?: null | number;
  snapshotId?: null | number;
  startTime?: string;
  status: string;
  submitTime?: string;
  timeMode: string;
  title: string;
}

export interface StartPaperResponse {
  exam: ExamManage;
  readonly: boolean;
  record: ExamRecordRow | null;
  serverTime: string;
  waiting?: boolean;
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

export interface HistoryPaperResponse {
  details?: ExamRecordDetail[];
  exam: ExamManage;
  readonly: boolean;
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
  };
}
