<script setup lang="ts">
import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import {
  Card,
  FormItem,
  InputNumber,
  Select,
  Space,
  Tag,
} from 'ant-design-vue';

import { gradingInfo, gradingScore } from '#/api/exam/grading';

import { stripHtml } from '../_components/constants';

const emit = defineEmits<{ reload: [] }>();

const detail = ref<any>(null);
const scoreItems = ref<Array<{ isCorrect: string; questionId: number; score: number }>>([]);

const totalScore = computed(() =>
  scoreItems.value.reduce((sum, item) => sum + Number(item.score || 0), 0),
);

const [BasicModal, modalApi] = useVbenModal({
  class: 'w-[1000px]',
  onClosed: handleClosed,
  onConfirm: handleConfirm,
  async onOpenChange(isOpen) {
    if (!isOpen) {
      return null;
    }
    modalApi.modalLoading(true);
    const { recordId } = modalApi.getData() as { recordId: number | string };
    detail.value = await gradingInfo(recordId);
    scoreItems.value = detail.value.details.map((item: any) => ({
      isCorrect: String(item.isCorrect || '0'),
      questionId: item.questionId,
      score: Number(item.score || 0),
    }));
    modalApi.modalLoading(false);
  },
});

async function handleConfirm() {
  try {
    modalApi.modalLoading(true);
    await gradingScore({
      details: scoreItems.value.map((item) => ({
        ...item,
        isCorrect: item.isCorrect === '1',
      })),
      recordId: detail.value.record.recordId,
    });
    emit('reload');
    modalApi.close();
  } finally {
    modalApi.modalLoading(false);
  }
}

function handleClosed() {
  detail.value = null;
  scoreItems.value = [];
}
</script>

<template>
  <BasicModal title="阅卷评分">
    <div v-if="detail" class="space-y-4">
      <Card size="small">
        <Space>
          <Tag color="blue">{{ detail.record.examTitle }}</Tag>
          <Tag color="gold">{{ detail.record.userName }}</Tag>
          <Tag color="green">当前总分 {{ totalScore }}</Tag>
        </Space>
      </Card>
      <Card
        v-for="(question, index) in detail.snapshot?.paperJson?.questions || []"
        :key="question.questionId"
        size="small"
      >
        <div class="mb-2 flex items-center justify-between">
          <div class="font-medium">第 {{ index + 1 }} 题</div>
          <Tag>{{ question.score }} 分</Tag>
        </div>
        <div class="mb-3 text-sm leading-6">
          {{ stripHtml(question.content) }}
        </div>
        <div class="mb-3 text-sm text-slate-500">
          考生答案：
          {{
            JSON.stringify(
              detail.details.find((item: any) => item.questionId === question.questionId)?.userAnswer,
            )
          }}
        </div>
        <div class="mb-3 text-sm text-slate-500">
          标准答案：
          {{
            JSON.stringify(
              detail.snapshot?.standardAnswerJson?.questions?.find(
                (item: any) => item.questionId === question.questionId,
              )?.standardAnswer,
            )
          }}
        </div>
        <div class="grid grid-cols-2 gap-4">
          <FormItem v-if="scoreItems[index]" label="得分">
            <InputNumber
              v-model:value="scoreItems[index]!.score"
              class="w-full"
              :max="question.score"
              :min="0"
            />
          </FormItem>
          <FormItem v-if="scoreItems[index]" label="是否正确">
            <Select
              v-model:value="scoreItems[index]!.isCorrect"
              :options="[
                { label: '正确', value: '1' },
                { label: '错误', value: '0' },
              ]"
            />
          </FormItem>
        </div>
      </Card>
    </div>
  </BasicModal>
</template>
