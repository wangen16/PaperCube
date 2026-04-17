import type { ScoreRow } from './model';

import type { PageQuery, PageResult } from '#/api/common';

import { commonExport } from '#/api/helper';
import { requestClient } from '#/api/request';

enum Api {
  export = '/exam/score/export',
  list = '/exam/score/list',
}

export function scoreList(params?: PageQuery) {
  return requestClient.get<PageResult<ScoreRow>>(Api.list, { params });
}

export function scoreExport(data: Record<string, any>) {
  return commonExport(Api.export, data);
}
