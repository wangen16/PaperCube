export interface KnowledgeCategory {
  ancestors: string;
  categoryCode: string;
  categoryId: number;
  categoryName: string;
  createTime?: string;
  orderNum: number;
  parentId: number;
  parentName?: string;
  remark?: string;
  status: string;
}

export interface KnowledgeCategoryTree {
  children?: KnowledgeCategoryTree[];
  code?: string;
  id: number;
  key: string;
  label: string;
  parentId: number;
  weight: number;
}
