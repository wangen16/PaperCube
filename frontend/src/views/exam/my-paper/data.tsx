import type { VxeGridProps } from '#/adapter/vxe-table';

import { getOptionLabel, RECORD_STATUS_OPTIONS } from '../_components/constants';

export const columns: VxeGridProps['columns'] = [
  {
    field: 'title',
    title: '试卷名称',
    minWidth: 240,
  },
  {
    field: 'timeMode',
    title: '时间模式',
    minWidth: 120,
  },
  {
    field: 'score',
    title: '成绩',
    minWidth: 100,
    slots: {
      default: ({ row }) => row.score ?? '--',
    },
  },
  {
    field: 'status',
    title: '状态',
    minWidth: 120,
    slots: {
      default: ({ row }) => getOptionLabel(RECORD_STATUS_OPTIONS, row.status),
    },
  },
  {
    field: 'submitTime',
    title: '交卷时间',
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
