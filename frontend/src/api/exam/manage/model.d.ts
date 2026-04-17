export interface ExamTarget {
  targetId?: number;
  targetType: string;
  targetValue: number;
}

export interface ExamManage {
  createTime?: string;
  durationMins?: number;
  endTime?: null | string;
  examId: number;
  paperId: number;
  paperTitle?: string;
  remark?: string;
  startTime?: null | string;
  status: string;
  targetList?: ExamTarget[];
  timeMode: string;
  title: string;
}
