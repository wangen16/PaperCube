import type { KnowledgeCategory, KnowledgeCategoryTree } from './model';

import type { ID } from '#/api/common';

import { requestClient } from '#/api/request';

enum Api {
  list = '/exam/knowledge-category/list',
  root = '/exam/knowledge-category',
  tree = '/exam/knowledge-category/tree',
}

export function knowledgeCategoryList(params?: Record<string, any>) {
  return requestClient.get<KnowledgeCategory[]>(Api.list, { params });
}

export function knowledgeCategoryTree() {
  return requestClient.get<KnowledgeCategoryTree[]>(Api.tree);
}

export function knowledgeCategoryExcludeTree(categoryId: ID) {
  return requestClient.get<KnowledgeCategoryTree[]>(
    `${Api.root}/list/exclude/${categoryId}`,
  );
}

export function knowledgeCategoryInfo(categoryId: ID) {
  return requestClient.get<KnowledgeCategory>(`${Api.root}/${categoryId}`);
}

export function knowledgeCategoryAdd(data: Partial<KnowledgeCategory>) {
  return requestClient.postWithMsg<void>(Api.root, data);
}

export function knowledgeCategoryUpdate(data: Partial<KnowledgeCategory>) {
  return requestClient.putWithMsg<void>(Api.root, data);
}

export function knowledgeCategoryRemove(categoryId: ID) {
  return requestClient.deleteWithMsg<void>(`${Api.root}/${categoryId}`);
}
