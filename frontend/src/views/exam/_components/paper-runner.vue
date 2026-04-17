<script setup lang="ts">
import { computed, ref } from 'vue';

import { Card, Empty, Progress, Tag, Image, Button } from 'ant-design-vue';

import QuestionAttachments from './question-attachments.vue';
import QuestionTypeAnswerRenderer from '../question-types/question-type-answer-renderer.vue';
import { getQuestionTypeLabel, getQuestionTypeModule } from '../question-types/registry';
const props = defineProps<{
  answers: Record<string, any>;
  loading?: boolean;
  payload: any | null;
  readonly?: boolean;
  remainingSeconds?: null | number;
  submitting?: boolean;
}>();

const emit = defineEmits<{
  'change-answer': [questionId: number, value: any];
  submit: [];
}>();

const currentIndex = ref(0);

const questionList = computed<Array<any>>(
  () => props.payload?.snapshot?.paperJson?.questions || [],
);
const currentQuestion = computed(() => questionList.value[currentIndex.value] || null);
const standardAnswerMap = computed<Map<number, any>>(() => {
  const list = props.payload?.snapshot?.standardAnswerJson?.questions || [];
  return new Map(list.map((item: any) => [Number(item.questionId), item]));
});
const detailMap = computed<Map<number, any>>(() => {
  const list = props.payload?.details || [];
  return new Map(list.map((item: any) => [Number(item.questionId), item]));
});
const answeredCount = computed(() =>
  questionList.value.filter((question) => {
    const value =
      props.answers[String(question.questionId)] ?? props.answers[question.questionId];
    return Array.isArray(value) ? value.length > 0 : !!value;
  }).length,
);
const progressPercent = computed(() => {
  if (!questionList.value.length) {
    return 0;
  }
  return Math.round((answeredCount.value / questionList.value.length) * 100);
});

function renderRemaining() {
  if (props.remainingSeconds == null || props.remainingSeconds < 0) {
    return '不限时';
  }
  const hour = Math.floor(props.remainingSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const minute = Math.floor((props.remainingSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const second = Math.floor(props.remainingSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${hour}:${minute}:${second}`;
}

function getQuestionValue(question: any) {
  return props.answers[String(question.questionId)] ?? props.answers[question.questionId];
}

function questionAnswer(questionId: number, questionType?: string) {
  const question = questionList.value.find(
    (item) => Number(item.questionId) === Number(questionId),
  );
  const rawValue = props.answers[String(questionId)] ?? props.answers[questionId];
  if (rawValue != null) {
    return rawValue;
  }
  const module = getQuestionTypeModule(questionType || question?.questionType);
  return module ? module.getInitialAnswer(question) : '';
}

function updateAnswer(questionId: number, value: any) {
  if (props.readonly) {
    return;
  }
  const question = questionList.value.find(
    (item) => Number(item.questionId) === Number(questionId),
  );
  const module = getQuestionTypeModule(question?.questionType);
  emit(
    'change-answer',
    questionId,
    module ? module.normalizeUserAnswer(value, question) : value,
  );
}

function viewQuestion(index: number) {
  currentIndex.value = index;
}

// 判断题目是否已作答
function isAnswered(question: any) {
  const val = getQuestionValue(question);
  return Array.isArray(val) ? val.length > 0 : !!val;
}

function prevQuestion() {
  currentIndex.value = Math.max(0, currentIndex.value - 1);
}

function nextQuestion() {
  currentIndex.value = Math.min(questionList.value.length - 1, currentIndex.value + 1);
}

function isImageAsset(value: string) {
  return /\.(bmp|gif|jpe?g|png|svg|webp)(\?.*)?$/i.test(String(value || ''));
}

// 从 CSS 变量读取主色，用于无法通过 class 控制的属性（如 antdv Progress stroke-color）
const primaryColor = computed(() => {
  if (typeof window === 'undefined') return '#ec5b13';
  // CSS 变量 --primary 的值为 HSL 数值如 "24 94% 50%"，需要拼装成 hsl()
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue('--primary')
    .trim();
  return val ? `hsl(${val})` : '#ec5b13';
});
</script>

<template>
  <div class="exam-runner min-h-screen font-sans text-foreground bg-background-deep">
    <header class="sticky top-0 z-40 border-b border-border bg-card px-6 py-3 shadow-sm md:px-10">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-6">
        <div class="flex min-w-0 items-center gap-4">
          <div class="flex items-center justify-center rounded-lg text-primary">
            <span class="i-mdi:school-outline text-xl"
              :class="readonly ? 'i-mdi:file-document-check-outline' : 'i-mdi:school-outline'"></span>
          </div>
          <div class="min-w-0">
            <h2 class="truncate text-lg font-bold leading-tight tracking-tight">
              {{ payload?.exam?.title || payload?.snapshot?.paperJson?.title || '在线试卷' }}
            </h2>
            <p class="text-xs font-medium text-muted-foreground">
              {{ readonly ? '历史试卷详情' : '沉浸式在线答题' }}
              <span v-if="payload?.record?.userName"> • {{ payload.record.userName }}</span>
            </p>
          </div>
        </div>
        <div class="flex items-center gap-6">
          <div class="hidden flex-col items-end md:flex">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {{ readonly ? '答卷状态' : '剩余时间' }}
            </span>
            <span class="text-xl font-bold tabular-nums" :class="readonly ? 'text-primary' : 'text-red-500'">
              {{ readonly ? `成绩 ${payload?.record?.totalScore ?? '--'}` : renderRemaining() }}
            </span>
          </div>
          <Button v-if="!readonly"
            class="flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-lg transition-all hover:bg-primary/90"
            :disabled="submitting" @click="$emit('submit')">
            <span class="i-mdi:send text-sm"></span>
            <span>{{ submitting ? '提交中' : '提交试卷' }}</span>
          </Button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-6 py-8 bg-background-deep">

      <div class="flex flex-col gap-8 lg:flex-row">
        <div class="flex flex-[2] flex-col gap-6">
          <Card :bordered="false" class="rounded-xl border border-border bg-card shadow-sm" :loading="loading">
            <template v-if="currentQuestion">
              <div class="mb-6 flex items-start gap-4">
                <span class="mt-1 rounded bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
                  {{ String(currentIndex + 1).padStart(2, '0') }}
                </span>
                <div class="min-w-0 flex-1">
                  <div class="text-lg font-semibold leading-relaxed flex items-center flex-wrap gap-2">
                    <span v-html="currentQuestion.content" class="rich-text-content"></span>
                    <span class="text-sm font-normal text-muted-foreground whitespace-nowrap">
                      ({{ getQuestionTypeLabel(currentQuestion.questionType) }}, {{ currentQuestion.score }} 分)
                    </span>
                  </div>
                  <QuestionAttachments :attachments="currentQuestion.attachments" class="mt-4" />
                </div>
              </div>

              <div class="ml-0 md:ml-12">
                <QuestionTypeAnswerRenderer :detail="detailMap.get(Number(currentQuestion.questionId))"
                  :model-value="questionAnswer(currentQuestion.questionId, currentQuestion.questionType)"
                  :question="currentQuestion" :readonly="readonly"
                  :standard-answer-rule="standardAnswerMap.get(Number(currentQuestion.questionId))"
                  @update:model-value="updateAnswer(currentQuestion.questionId, $event)" />
              </div>

              <div class="mt-8 flex justify-between">
                <Button type="primary" :disabled="currentIndex === 0" @click="prevQuestion">
                  <span class="i-mdi:arrow-left"></span>
                  上一题
                </Button>
                <Button type="primary" :disabled="currentIndex >= questionList.length - 1" @click="nextQuestion">
                  下一题
                  <span class="i-mdi:arrow-right"></span>
                </Button>
              </div>

              <template v-if="readonly">
                <div
                  class="mt-8 rounded-2xl border border-border bg-muted/40 p-4 text-sm leading-7 text-muted-foreground">
                  <div>
                    标准答案：
                    {{
                      JSON.stringify(
                        standardAnswerMap.get(Number(currentQuestion.questionId))?.standardAnswer,
                      )
                    }}
                  </div>
                  <div class="mt-2">
                    我的答案：
                    {{ JSON.stringify(getQuestionValue(currentQuestion)) }}
                  </div>
                  <div class="mt-2">
                    得分：
                    {{ detailMap.get(Number(currentQuestion.questionId))?.score ?? '--' }}
                  </div>
                  <div class="mt-2">
                    解析：
                    {{ currentQuestion.analysis || '暂无解析' }}
                  </div>
                </div>
              </template>
            </template>

            <Empty v-else description="暂无题目" />
          </Card>
        </div>

        <div class="flex flex-1 flex-col gap-6">
          <Card :bordered="false" class="sticky top-24 rounded-xl border border-border bg-card shadow-lg">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="flex items-center gap-2 text-lg font-bold">
                <span class="i-mdi:clipboard-text-outline text-primary"></span>
                答题卡
              </h2>
              <Tag size="large" :bordered="false" class="bg-primary/10 text-primary">{{ answeredCount }}/{{
                questionList.length
                }}</Tag>
            </div>

            <div class="mb-6">
              <div class="mb-2 flex justify-between text-sm font-semibold">
                <span>答题进度</span>
                <span>已完成 {{ progressPercent }}%</span>
              </div>
              <Progress :percent="progressPercent" :show-info="false" :stroke-color="primaryColor"
                :trail-color="'rgba(148,163,184,.18)'" />
            </div>

            <p class="mb-4 text-xs font-medium uppercase text-muted-foreground">题号导航</p>
            <div class="grid grid-cols-5 gap-2">
              <Button v-for="(question, index) in questionList" :key="question.questionId"
                class="!h-10 !w-full !rounded-lg !text-sm !font-bold"
                :type="index === currentIndex || isAnswered(question) ? 'primary' : 'dashed'"
                :ghost="index !== currentIndex && isAnswered(question)" @click="viewQuestion(index)">
                {{ index + 1 }}
              </Button>
            </div>

            <div class="mt-6 space-y-3 border-t border-border pt-4">
              <div class="flex items-center gap-2 text-xs text-muted-foreground">
                <span class="size-3 rounded bg-primary"></span>
                <span>已作答</span>
                <span class="ml-4 size-3 rounded border border-border"></span>
                <span>未作答</span>
              </div>
              <div class="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                <div>当前题号：第 {{ currentIndex + 1 }} 题</div>
                <div class="mt-2">考试总分：{{ payload?.snapshot?.paperJson?.totalScore || 0 }}</div>
                <div class="mt-2">当前状态：{{ readonly ? '只读查看' : '自动暂存中' }}</div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
:deep(.rich-text-content img) {
  max-width: 100%;
  height: auto;
}
:deep(.rich-text-content video) {
  max-width: 100%;
  height: auto;
}
</style>
