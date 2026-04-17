<script lang="ts" setup>
import type { AnalysisOverviewItem } from '@vben/common-ui';
import type { TabOption } from '@vben/types';

import {
  AnalysisChartCard,
  AnalysisChartsTabs,
  AnalysisOverview,
} from '@vben/common-ui';
import {
  SvgBellIcon,
  SvgCakeIcon,
  SvgCardIcon,
  SvgDownloadIcon,
} from '@vben/icons';
import { onMounted, ref } from 'vue';
import { requestClient } from '#/api/request';

import AnalyticsTrends from './analytics-trends.vue';
import AnalyticsVisitsSource from './analytics-visits-source.vue';

const overviewItems = ref<AnalysisOverviewItem[]>([
  { icon: SvgCardIcon, title: '系统用户', totalTitle: '累计用户数', totalValue: 0, value: 0 },
  { icon: SvgCakeIcon, title: '题库容量', totalTitle: '可用试题量', totalValue: 0, value: 0 },
  { icon: SvgDownloadIcon, title: '试卷总量', totalTitle: '累计建卷总量', totalValue: 0, value: 0 },
  { icon: SvgBellIcon, title: '考试人次', totalTitle: '历史参与人次', totalValue: 0, value: 0 },
]);

const chartTabs: TabOption[] = [
  { label: '近七日平台活跃趋势', value: 'trends' }
];

const trendsData = ref<any[]>([]);
const typeDistribution = ref<Record<string, number>>({});

onMounted(async () => {
  try {
    const res = await requestClient.get<any>('/dashboard/stats');
    if (res && res.overview) {
      overviewItems.value = [
        { icon: SvgCardIcon, title: '系统用户', totalTitle: '累计用户数', totalValue: res.overview.users, value: Math.max(1, Math.floor(res.overview.users * 0.1)) },
        { icon: SvgCakeIcon, title: '题库容量', totalTitle: '可用试题量', totalValue: res.overview.questions, value: Math.max(0, Math.floor(res.overview.questions * 0.05)) },
        { icon: SvgDownloadIcon, title: '试卷总量', totalTitle: '累计建卷总量', totalValue: res.overview.papers, value: Math.max(0, Math.floor(res.overview.papers * 0.2)) },
        { icon: SvgBellIcon, title: '考试人次', totalTitle: '历史参与人次', totalValue: res.overview.records, value: Math.max(0, Math.floor(res.overview.records * 0.15)) },
      ];
      trendsData.value = res.trends || [];
      typeDistribution.value = res.typeDistribution || {};
    }
  } catch (err) {
    console.error(err);
  }
});
</script>

<template>
  <div class="p-5">
    <AnalysisOverview :items="overviewItems" />
    <AnalysisChartsTabs :tabs="chartTabs" class="mt-5">
      <template #trends>
        <AnalyticsTrends :data="trendsData" />
      </template>
    </AnalysisChartsTabs>

    <div class="mt-5 w-full md:flex">
      <AnalysisChartCard class="mt-5 md:mr-4 md:mt-0 md:w-1/2" title="系统考题分布">
        <AnalyticsVisitsSource :data="typeDistribution" />
      </AnalysisChartCard>
    </div>
  </div>
</template>
