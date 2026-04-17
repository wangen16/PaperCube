<script setup lang="ts">
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import { Space } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { myPaperList } from '#/api/exam/my-paper';

import { columns } from './data';

const router = useRouter();

const [BasicTable] = useVbenVxeGrid({
  formOptions: {
    showDefaultActions: false,
    wrapperClass: 'hidden',
  },
  gridOptions: {
    columns,
    height: 'auto',
    keepSource: true,
    pagerConfig: {
      enabled: false,
    },
    proxyConfig: {
      ajax: {
        query: async () => {
          const response = await myPaperList();
          return {
            rows: response.rows,
            total: response.total,
          };
        },
      },
    },
    rowConfig: { keyField: 'examId' },
    id: 'exam-my-paper-index',
  },
});

function openInNewTab(path: string) {
  const resolved = router.resolve(path);
  window.open(resolved.href, '_blank');
}
</script>

<template>
  <Page :auto-content-height="true">
    <BasicTable table-title="我的试卷">
      <template #action="{ row }">
        <Space>
          <ghost-button
            v-if="row.canStart"
            class="btn-success"
            v-access:code="['exam:myPaper:list']"
            @click="openInNewTab(`/exam/answer/${row.examId}`)"
          >
            开始考试
          </ghost-button>
          <ghost-button
            v-if="row.canViewDetail"
            v-access:code="['exam:myPaper:list']"
            @click="openInNewTab(`/exam/history/${row.examId}`)"
          >
            查看详情
          </ghost-button>
        </Space>
      </template>
    </BasicTable>
  </Page>
</template>
