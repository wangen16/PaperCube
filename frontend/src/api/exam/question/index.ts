import type { Question } from './model';

import type { ID, IDS, PageQuery, PageResult } from '#/api/common';

import { commonExport, ContentTypeEnum } from '#/api/helper';
import { requestClient } from '#/api/request';

enum Api {
  export = '/exam/question/export',
  import = '/exam/question/import',
  list = '/exam/question/list',
  root = '/exam/question',
}

export function questionList(params?: PageQuery) {
  return requestClient.get<PageResult<Question>>(Api.list, { params });
}

export function questionExport(data: Record<string, any>) {
  return commonExport(Api.export, data);
}

export function questionImport(data: FormData) {
  return requestClient.postWithMsg<void>(Api.import, data, {
    headers: {
      'Content-Type': ContentTypeEnum.FORM_DATA,
    },
  });
}

export function questionInfo(questionId: ID) {
  return requestClient.get<Question>(`${Api.root}/${questionId}`);
}

export function questionAdd(data: Partial<Question>) {
  return requestClient.postWithMsg<void>(Api.root, data);
}

export function questionUpdate(data: Partial<Question>) {
  return requestClient.putWithMsg<void>(Api.root, data);
}

export function questionRemove(questionIds: IDS) {
  return requestClient.deleteWithMsg<void>(`${Api.root}/${questionIds}`);
}
