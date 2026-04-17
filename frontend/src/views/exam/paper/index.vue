<script setup lang="ts">
import type { VbenFormProps } from '@vben/common-ui';

import type { VxeGridProps } from '#/adapter/vxe-table';
import type { ExamPaper } from '#/api/exam/paper/model';

import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { Modal, Space, Button } from 'ant-design-vue';

import { useVbenVxeGrid, vxeCheckboxChecked } from '#/adapter/vxe-table';
import { paperList, paperRemove } from '#/api/exam/paper';

import { columns, querySchema } from './data';

const router = useRouter();

const formOptions: VbenFormProps = {
  commonConfig: {
    labelWidth: 80,
    componentProps: {
      allowClear: true,
    },
  },
  schema: querySchema(),
  wrapperClass: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
};

const gridOptions: VxeGridProps = {
  checkboxConfig: {
    highlight: true,
    reserve: true,
    trigger: 'default',
  },
  columns,
  height: 'auto',
  keepSource: true,
  pagerConfig: {},
  proxyConfig: {
    ajax: {
      query: async ({ page }, formValues = {}) =>
        await paperList({
          pageNum: page.currentPage,
          pageSize: page.pageSize,
          ...formValues,
        }),
    },
  },
  rowConfig: {
    keyField: 'paperId',
  },
  id: 'exam-paper-index',
};

const [BasicTable, tableApi] = useVbenVxeGrid({
  formOptions,
  gridOptions,
});

function handleAdd() {
  router.push('/exam/paper-editor');
}

function handleEdit(row: ExamPaper) {
  router.push(`/exam/paper-editor/${row.paperId}`);
}

async function handleDelete(row: ExamPaper) {
  await paperRemove([row.paperId]);
  await tableApi.query();
}

function handleMultiDelete() {
  const rows = tableApi.grid.getCheckboxRecords();
  const ids = rows.map((row: ExamPaper) => row.paperId);
  Modal.confirm({
    content: `确认删除选中的${ids.length}张试卷吗？`,
    okType: 'danger',
    title: '提示',
    onOk: async () => {
      await paperRemove(ids);
      await tableApi.query();
    },
  });
}
</script>

<template>
  <Page :auto-content-height="true">
    <BasicTable table-title="试卷管理">
      <template #toolbar-tools>
        <Space>
          <Button :disabled="!vxeCheckboxChecked(tableApi)" danger type="primary" v-access:code="['exam:paper:remove']"
            @click="handleMultiDelete">
            {{ $t('pages.common.delete') }}
          </Button>
          <Button type="primary" v-access:code="['exam:paper:add']" @click="handleAdd">
            新建试卷
          </Button>
        </Space>
      </template>
      <template #action="{ row }">
        <Space>
          <ghost-button v-access:code="['exam:paper:edit']" @click="handleEdit(row)">
            编辑
          </ghost-button>
          <ghost-button danger v-access:code="['exam:paper:remove']" @click="handleDelete(row)">
            删除
          </ghost-button>
        </Space>
      </template>
    </BasicTable>
  </Page>
</template>
