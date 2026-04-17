<script setup lang="ts">
import type { VbenFormProps } from '@vben/common-ui';

import type { VxeGridProps } from '#/adapter/vxe-table';

import { Page, useVbenModal } from '@vben/common-ui';

import { Space } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { gradingList } from '#/api/exam/grading';

import { columns, querySchema } from './data';
import GradingModalView from './grading-modal.vue';

const formOptions: VbenFormProps = {
  commonConfig: {
    labelWidth: 80,
    componentProps: { allowClear: true },
  },
  schema: querySchema(),
  wrapperClass: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
};

const gridOptions: VxeGridProps = {
  columns,
  height: 'auto',
  keepSource: true,
  pagerConfig: {},
  proxyConfig: {
    ajax: {
      query: async ({ page }, formValues = {}) =>
        await gradingList({
          pageNum: page.currentPage,
          pageSize: page.pageSize,
          ...formValues,
        }),
    },
  },
  rowConfig: { keyField: 'recordId' },
  id: 'exam-grading-index',
};

const [BasicTable, tableApi] = useVbenVxeGrid({
  formOptions,
  gridOptions,
});

const [GradingModal, gradingModalApi] = useVbenModal({
  connectedComponent: GradingModalView,
});

function handleGrading(row: any) {
  gradingModalApi.setData({ recordId: row.recordId });
  gradingModalApi.open();
}
</script>

<template>
  <Page :auto-content-height="true">
    <BasicTable table-title="阅卷管理">
      <template #action="{ row }">
        <Space>
          <ghost-button
            v-access:code="['exam:grading:edit', 'exam:grading:list']"
            @click="handleGrading(row)"
          >
            阅卷
          </ghost-button>
        </Space>
      </template>
    </BasicTable>
    <GradingModal @reload="tableApi.query()" />
  </Page>
</template>
