import type { FormSchemaGetter } from '#/adapter/form';
import type { VxeGridProps } from '#/adapter/vxe-table';

import { DictEnum } from '@vben/constants';
import { getPopupContainer } from '@vben/utils';

import { getDictOptions } from '#/utils/dict';
import { renderDict } from '#/utils/render';

export const querySchema: FormSchemaGetter = () => [
  {
    component: 'Input',
    fieldName: 'title',
    label: '试卷名称',
  },
  {
    component: 'Select',
    componentProps: {
      getPopupContainer,
      options: getDictOptions(DictEnum.SYS_NORMAL_DISABLE),
    },
    fieldName: 'status',
    label: '状态',
  },
];

export const columns: VxeGridProps['columns'] = [
  { type: 'checkbox', width: 60 },
  {
    field: 'title',
    title: '试卷标题',
    minWidth: 220,
  },
  {
    field: 'totalScore',
    title: '总分',
    width: 100,
  },
  {
    field: 'passScore',
    title: '及格分',
    width: 100,
  },
  {
    field: 'paperStructure',
    title: '题目结构',
    minWidth: 140,
    slots: {
      default: ({ row }) => `${row.paperStructure?.length || 0} 项`,
    },
  },
  {
    field: 'status',
    title: '状态',
    width: 100,
    slots: {
      default: ({ row }) => renderDict(row.status, DictEnum.SYS_NORMAL_DISABLE),
    },
  },
  {
    field: 'createTime',
    title: '创建时间',
    minWidth: 160,
  },
  {
    field: 'action',
    fixed: 'right',
    slots: { default: 'action' },
    title: '操作',
    width: 200,
  },
];
