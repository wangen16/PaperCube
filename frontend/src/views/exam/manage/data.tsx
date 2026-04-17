import type { FormSchemaGetter } from '#/adapter/form';
import type { VxeGridProps } from '#/adapter/vxe-table';

import {
  EXAM_STATUS_OPTIONS,
  EXAM_TIME_MODE_OPTIONS,
  getOptionLabel,
} from '../_components/constants';

export const querySchema: FormSchemaGetter = () => [
  {
    component: 'Input',
    fieldName: 'title',
    label: '考试名称',
  },
  {
    component: 'Select',
    componentProps: {
      options: EXAM_STATUS_OPTIONS,
    },
    fieldName: 'status',
    label: '状态',
  },
];

export const columns: VxeGridProps['columns'] = [
  { type: 'checkbox', width: 60 },
  {
    field: 'title',
    title: '考试名称',
    minWidth: 220,
  },
  {
    field: 'paperTitle',
    title: '试卷',
    minWidth: 180,
  },
  {
    field: 'timeMode',
    title: '时间模式',
    minWidth: 120,
    slots: {
      default: ({ row }) => getOptionLabel(EXAM_TIME_MODE_OPTIONS, row.timeMode),
    },
  },
  {
    field: 'startTime',
    title: '开始时间',
    minWidth: 160,
  },
  {
    field: 'endTime',
    title: '结束时间',
    minWidth: 160,
  },
  {
    field: 'status',
    title: '状态',
    minWidth: 100,
    slots: {
      default: ({ row }) => getOptionLabel(EXAM_STATUS_OPTIONS, row.status),
    },
  },
  {
    field: 'action',
    fixed: 'right',
    slots: { default: 'action' },
    title: '操作',
    width: 260,
  },
];
