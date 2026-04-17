<script setup lang="ts">
import type { VbenFormProps } from '@vben/common-ui';

import type { VxeGridProps } from '#/adapter/vxe-table';
import type { KnowledgeCategory } from '#/api/exam/knowledge-category/model';

import { nextTick } from 'vue';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { eachTree } from '@vben/utils';

import { Popconfirm, Space, Button } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  knowledgeCategoryList,
  knowledgeCategoryRemove,
} from '#/api/exam/knowledge-category';

import CategoryDrawerView from './category-drawer.vue';
import { columns, querySchema } from './data';

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
  columns,
  height: 'auto',
  keepSource: true,
  pagerConfig: {
    enabled: false,
  },
  proxyConfig: {
    ajax: {
      query: async (_, formValues = {}) => {
        const rows = await knowledgeCategoryList(formValues);
        return { rows };
      },
      querySuccess: () => {
        eachTree(tableApi.grid.getData(), (item) => (item.expand = true));
        nextTick(() => {
          setExpandOrCollapse(true);
        });
      },
    },
  },
  rowConfig: {
    keyField: 'categoryId',
  },
  scrollY: {
    enabled: false,
    gt: 0,
  },
  treeConfig: {
    parentField: 'parentId',
    rowField: 'categoryId',
    transform: true,
  },
  id: 'exam-knowledge-category-index',
};

const [BasicTable, tableApi] = useVbenVxeGrid({
  formOptions,
  gridEvents: {
    cellDblclick: ({ row = {} }) => {
      if (!row?.children) {
        return;
      }
      const expanded = !row.expand;
      tableApi.grid.setTreeExpand(row, expanded);
      row.expand = expanded;
    },
    toggleTreeExpand: ({ expanded, row = {} }) => {
      row.expand = expanded;
    },
  },
  gridOptions,
});

const [CategoryDrawer, drawerApi] = useVbenDrawer({
  connectedComponent: CategoryDrawerView,
});

function handleAdd() {
  drawerApi.setData({ update: false });
  drawerApi.open();
}

function handleSubAdd(row: KnowledgeCategory) {
  drawerApi.setData({ id: row.categoryId, update: false });
  drawerApi.open();
}

function handleEdit(row: KnowledgeCategory) {
  drawerApi.setData({ id: row.categoryId, update: true });
  drawerApi.open();
}

async function handleDelete(row: KnowledgeCategory) {
  await knowledgeCategoryRemove(row.categoryId);
  await tableApi.query();
}

function setExpandOrCollapse(expand: boolean) {
  eachTree(tableApi.grid.getData(), (item) => (item.expand = expand));
  tableApi.grid?.setAllTreeExpand(expand);
}
</script>

<template>
  <Page :auto-content-height="true">
    <BasicTable table-title="知识分类">
      <template #toolbar-tools>
        <Space>
          <Button @click="setExpandOrCollapse(false)">收起</Button>
          <Button @click="setExpandOrCollapse(true)">展开</Button>
          <Button type="primary" v-access:code="['exam:knowledgeCategory:add']" @click="handleAdd">
            {{ $t('pages.common.add') }}
          </Button>
        </Space>
      </template>
      <template #action="{ row }">
        <Space>
          <ghost-button v-access:code="['exam:knowledgeCategory:edit']" @click="handleEdit(row)">
            {{ $t('pages.common.edit') }}
          </ghost-button>
          <ghost-button class="btn-success" v-access:code="['exam:knowledgeCategory:add']" @click="handleSubAdd(row)">
            {{ $t('pages.common.add') }}
          </ghost-button>
          <Popconfirm placement="left" title="确认删除？" @confirm="handleDelete(row)">
            <ghost-button danger v-access:code="['exam:knowledgeCategory:remove']" @click.stop="">
              {{ $t('pages.common.delete') }}
            </ghost-button>
          </Popconfirm>
        </Space>
      </template>
    </BasicTable>
    <CategoryDrawer @reload="tableApi.query()" />
  </Page>
</template>
