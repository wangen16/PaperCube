export interface PaperStructureItem {
  count?: number;
  filter?: {
    difficulty?: string;
    difficultyMax?: number | string;
    difficultyMin?: number | string;
    knowledgeCategoryId?: number;
    knowledgeCategoryIds?: number[];
    type?: string;
    types?: string[];
  };
  generateTiming?: 'on_exam' | 'on_publish';
  questionId?: number;
  score?: number;
  scorePerItem?: number;
  type: 'fixed' | 'random';
}

export interface ExamPaper {
  createTime?: string;
  paperId: number;
  paperStructure: PaperStructureItem[];
  passScore: number;
  remark?: string;
  status: string;
  title: string;
  totalScore: number;
}
