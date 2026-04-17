<script setup lang="ts">
import type { VbenFormProps } from '@vben/common-ui';

import type { VxeGridProps } from '#/adapter/vxe-table';
import type { Question } from '#/api/exam/question/model';

import { ref } from 'vue';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { Button, Modal, Space } from 'ant-design-vue';

import { useVbenVxeGrid, vxeCheckboxChecked } from '#/adapter/vxe-table';
import {
  questionExport,
  questionList,
  questionRemove,
} from '#/api/exam/question';
import { commonDownloadExcel } from '#/utils/file/download';

import CategoryTree from './category-tree.vue';
import { columns, querySchema } from './data';
import QuestionDrawerView from './question-drawer.vue';

const selectedCategoryId = ref<string[]>([]);

const formOptions: VbenFormProps = {
  commonConfig: {
    labelWidth: 80,
    componentProps: {
      allowClear: true,
    },
  },
  handleReset: async () => {
    selectedCategoryId.value = [];
    const { formApi, reload } = tableApi;
    await formApi.resetForm();
    const formValues = formApi.form.values;
    formApi.setLatestSubmissionValues(formValues);
    await reload(formValues);
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
      query: async ({ page }, formValues = {}) => {
        if (selectedCategoryId.value.length === 1) {
          formValues.knowledgeCategoryId = selectedCategoryId.value[0];
        } else {
          Reflect.deleteProperty(formValues, 'knowledgeCategoryId');
        }
        return await questionList({
          pageNum: page.currentPage,
          pageSize: page.pageSize,
          ...formValues,
        });
      },
    },
  },
  rowConfig: {
    keyField: 'questionId',
  },
  id: 'exam-question-index',
};

const [BasicTable, tableApi] = useVbenVxeGrid({
  formOptions,
  gridOptions,
});

const [QuestionDrawer, drawerApi] = useVbenDrawer({
  connectedComponent: QuestionDrawerView,
});

function handleAdd() {
  drawerApi.setData({
    knowledgeCategoryId:
      selectedCategoryId.value.length === 1
        ? selectedCategoryId.value[0]
        : undefined,
  });
  drawerApi.open();
}

function handleEdit(row: Question) {
  drawerApi.setData({ id: row.questionId });
  drawerApi.open();
}

async function handleDelete(row: Question) {
  await questionRemove([row.questionId]);
  await tableApi.query();
}

function handleMultiDelete() {
  const rows = tableApi.grid.getCheckboxRecords();
  const ids = rows.map((row: Question) => row.questionId);
  Modal.confirm({
    content: `确认删除选中的${ids.length}条题目吗？`,
    okType: 'danger',
    title: '提示',
    onOk: async () => {
      await questionRemove(ids);
      await tableApi.query();
    },
  });
}

function handleExport() {
  commonDownloadExcel(questionExport, '题库管理', tableApi.formApi.form.values);
}
</script>

<template>
  <Page :auto-content-height="true">
    <div class="flex h-full gap-[8px]">
      <CategoryTree v-model:selected-category-id="selectedCategoryId" class="w-[260px]"
        @reload="() => tableApi.reload()" @select="() => tableApi.reload()" />
      <BasicTable class="flex-1 overflow-hidden" table-title="题库列表">
        <template #toolbar-tools>
          <Space>
            <Button v-access:code="['exam:question:export']" @click="handleExport">
              {{ $t('pages.common.export') }}
            </Button>
            <Button :disabled="!vxeCheckboxChecked(tableApi)" danger type="primary"
              v-access:code="['exam:question:remove']" @click="handleMultiDelete">
              {{ $t('pages.common.delete') }}
            </Button>
            <Button type="primary" v-access:code="['exam:question:add']" @click="handleAdd">
              {{ $t('pages.common.add') }}
            </Button>
          </Space>
        </template>
        <template #action="{ row }">
          <Space>
            <ghost-button v-access:code="['exam:question:edit']" @click="handleEdit(row)">
              {{ $t('pages.common.edit') }}
            </ghost-button>
            <ghost-button danger v-access:code="['exam:question:remove']" @click="handleDelete(row)">
              {{ $t('pages.common.delete') }}
            </ghost-button>
          </Space>
        </template>
      </BasicTable>
    </div>
    <QuestionDrawer @reload="tableApi.query()" />
  </Page>
</template>
