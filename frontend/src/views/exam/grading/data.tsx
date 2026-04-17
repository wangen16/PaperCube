import type { FormSchemaGetter } from '#/adapter/form';
import type { VxeGridProps } from '#/adapter/vxe-table';

import { getOptionLabel, RECORD_STATUS_OPTIONS } from '../_components/constants';

export const querySchema: FormSchemaGetter = () => [
  {
    component: 'Input',
    fieldName: 'title',
    label: '考试名称',
  },
  {
    component: 'Select',
    componentProps: {
      options: RECORD_STATUS_OPTIONS,
    },
    fieldName: 'status',
    label: '状态',
  },
];

export const columns: VxeGridProps['columns'] = [
  {
    field: 'examTitle',
    title: '考试名称',
    minWidth: 220,
  },
  {
    field: 'userName',
    title: '考生',
    minWidth: 140,
  },
  {
    field: 'totalScore',
    title: '总分',
    width: 100,
  },
  {
    field: 'status',
    title: '状态',
    width: 120,
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
    width: 120,
  },
];
