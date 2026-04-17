import type { FormSchemaGetter } from '#/adapter/form';
import type { VxeGridProps } from '#/adapter/vxe-table';

import { h } from 'vue';

import { DictEnum } from '@vben/constants';
import { getPopupContainer } from '@vben/utils';

import { Rate, Tag } from 'ant-design-vue';

import { getDictOptions } from '#/utils/dict';
import { renderDict } from '#/utils/render';

import {
  AUTO_GRADING_OPTIONS,
  getDifficultyText,
  getOptionLabel,
  QUESTION_DIFFICULTY_OPTIONS,
  normalizeDifficulty,
  stripHtml,
} from '../_components/constants';
import { QUESTION_TYPE_DICT } from '../question-types/model';

export const querySchema: FormSchemaGetter = () => [
  {
    component: 'Input',
    fieldName: 'content',
    label: '题目内容',
  },
  {
    component: 'Select',
    componentProps: {
      getPopupContainer,
      options: getDictOptions(QUESTION_TYPE_DICT),
    },
    fieldName: 'questionType',
    label: '题型',
  },
  {
    component: 'Select',
    componentProps: {
      getPopupContainer,
      options: QUESTION_DIFFICULTY_OPTIONS,
    },
    fieldName: 'difficulty',
    label: '难度',
  },
  {
    component: 'Select',
    componentProps: {
      options: AUTO_GRADING_OPTIONS,
    },
    fieldName: 'autoGrading',
    label: '判分方式',
  },
];

export const columns: VxeGridProps['columns'] = [
  { type: 'checkbox', width: 60 },
  {
    field: 'knowledgeCategoryName',
    title: '知识分类',
    minWidth: 140,
  },
  {
    field: 'content',
    title: '题目内容',
    minWidth: 280,
    formatter: ({ cellValue }) => stripHtml(cellValue),
  },
  {
    field: 'questionType',
    title: '题型',
    minWidth: 100,
    slots: {
      default: ({ row }) => renderDict(row.questionType, QUESTION_TYPE_DICT),
    },
  },
  {
    field: 'difficulty',
    title: '难度',
    minWidth: 160,
    slots: {
      default: ({ row }) =>
        h('div', { class: 'flex items-center gap-2' }, [
          h(Rate, {
            allowHalf: false,
            count: 5,
            disabled: true,
            value: normalizeDifficulty(row.difficulty),
          }),
          h('span', { class: 'text-xs text-slate-500' }, getDifficultyText(row.difficulty)),
        ]),
    },
  },
  {
    field: 'autoGrading',
    title: '判分方式',
    minWidth: 120,
    slots: {
      default: ({ row }) =>
        h(
          Tag,
          {
            color: String(row.autoGrading) === '1' ? 'blue' : 'orange',
          },
          () => getOptionLabel(AUTO_GRADING_OPTIONS, row.autoGrading),
        ),
    },
  },
  {
    field: 'status',
    title: '状态',
    minWidth: 100,
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
    width: 180,
  },
];
