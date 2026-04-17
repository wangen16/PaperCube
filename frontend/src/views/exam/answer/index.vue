<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import dayjs from 'dayjs';

import { message, Modal, notification, Button } from 'ant-design-vue';

import {
  answerHeartbeat,
  answerSubmit,
  answerTempSave,
  myPaperStart,
} from '#/api/exam/my-paper';
import { useUserStore } from '@vben/stores';

import PaperRunner from '../_components/paper-runner.vue';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const cacheKey = computed(() => {
  const recordId = payload.value?.record?.recordId || '';
  return `exam_answers_${userStore.userInfo?.userId || ''}_${route.params.examId}_${recordId}`;
});

function encodeAnswers(data: any) {
  try {
    return btoa(encodeURIComponent(JSON.stringify(data)));
  } catch {
    return '';
  }
}

function decodeAnswers(str: string) {
  return JSON.parse(decodeURIComponent(atob(str)));
}

const loading = ref(true);
const submitting = ref(false);
const payload = ref<any>(null);
const answers = ref<Record<string, any>>({});
const serverOffset = ref(0);
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let submitCountdownTimer: ReturnType<typeof setInterval> | null = null;

const remainingSeconds = ref<null | number>(null);
const waitSeconds = ref<null | number>(null);

// 交卷蒙层相关
const submitVisible = ref(false);
const submitConfirmSeconds = ref(3);
const forceSubmitting = ref(false);
// 强制交卷时的关闭页面倒计时
const closePageCountdown = ref(3);
let closePageTimer: ReturnType<typeof setInterval> | null = null;

// 10分钟预警（只触发一次）
let tenMinWarned = false;

const answeredCount = computed(() =>
  Object.keys(answers.value).filter((key) => {
    const value = answers.value[key];
    return Array.isArray(value) ? value.length > 0 : !!value;
  }).length,
);
const totalCount = computed(
  () => payload.value?.snapshot?.paperJson?.questions?.length || 0,
);

function currentServerDate() {
  return new Date(Date.now() + serverOffset.value);
}

function formatWaitTime(seconds: number | null) {
  if (seconds == null || seconds < 0) return '00:00:00';
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function computeRemaining() {
  if (!payload.value) {
    remainingSeconds.value = null;
    return;
  }
  const { exam, record, waiting } = payload.value;
  const nowTime = currentServerDate().getTime();

  if (waiting) {
    const startAt = dayjs(exam.startTime).valueOf();
    const diff = Math.max(0, Math.floor((startAt - nowTime) / 1000));

    // 如果之前还在等，现在到时间了，重新要求加载试题
    if (diff === 0 && waitSeconds.value && waitSeconds.value > 0) {
      waitSeconds.value = 0;
      setTimeout(() => {
        loadData();
      }, 1000);
    } else {
      waitSeconds.value = diff;
    }
    remainingSeconds.value = null;
    return;
  }

  if (String(exam.timeMode) === '3') {
    remainingSeconds.value = null;
    return;
  }

  const startTime = dayjs(record.startTime).valueOf();
  let deadline = Number.POSITIVE_INFINITY;

  if (String(exam.timeMode) === '1') {
    if (exam.endTime) {
      deadline = Math.min(deadline, dayjs(exam.endTime).valueOf());
    }
    if (Number(exam.durationMins || 0) > 0) {
      deadline = Math.min(deadline, startTime + Number(exam.durationMins) * 60_000);
    }
  } else if (String(exam.timeMode) === '2') {
    deadline = startTime + Number(exam.durationMins || 0) * 60_000;
  }

  remainingSeconds.value = Math.max(0, Math.floor((deadline - nowTime) / 1000));
}

async function loadData() {
  loading.value = true;
  try {
    const response = await myPaperStart(route.params.examId as string);

    if (!response.waiting && response.record && ['2', '3'].includes(String(response.record.status))) {
      message.info('该试卷已提交，为您跳转至查看详情页面');
      router.replace(`/exam/history/${route.params.examId}`);
      return;
    }

    payload.value = response;
    serverOffset.value = dayjs(response.serverTime).valueOf() - Date.now();

    if (!response.waiting && response.record) {
      let localAnswers = {};
      try {
        if (cacheKey.value) {
          const saved = localStorage.getItem(cacheKey.value);
          if (saved) {
            // 支持向后兼容：如果解包失败，尝试直接 JSON.parse（旧的明文数据）
            try {
              localAnswers = decodeAnswers(saved);
            } catch {
              localAnswers = JSON.parse(saved);
            }
          }
        }
      } catch (e) {
        // failed to parse
      }

      answers.value = {
        ...(response.record.userAnswers || {}),
        ...localAnswers
      };
    }
    computeRemaining();
  } catch (err: any) {
    // requestClient 已经自动 message.error 了，这里只额外处理"考试已结束"场景的弹窗引导
    const msg = err?.message || String(err || '');
    if (msg.includes('已结束')) {
      // 延迟一点展示 Modal，避免和全局 message 冲突
      setTimeout(() => {
        Modal.warning({
          title: '考试已结束',
          content: '本场考试已经结束，无法再次作答，即将为您跳转回试卷列表。',
          okText: '确定',
          onOk() {
            window.close()
          },
        });
      }, 500);
    }
  } finally {
    loading.value = false;
  }
}

async function syncHeartbeat() {
  if (payload.value?.waiting) return;
  const response = await answerHeartbeat();
  serverOffset.value = dayjs(response.serverTime).valueOf() - Date.now();
  computeRemaining();
}

async function tempSave() {
  if (!payload.value || payload.value.readonly || payload.value.waiting) {
    return;
  }
  await answerTempSave({
    examId: payload.value.exam.examId,
    userAnswers: answers.value,
  });
}

function handleChangeAnswer(questionId: number, value: any) {
  answers.value = {
    ...answers.value,
    [questionId]: value,
  };
}



function openSubmitModal() {
  submitVisible.value = true;
  // 清空强制交卷的关闭倒计时（手动打开时不需要）
  closePageCountdown.value = 3;
  if (closePageTimer) {
    clearInterval(closePageTimer);
    closePageTimer = null;
  }
  submitConfirmSeconds.value = 3;
  if (submitCountdownTimer) {
    clearInterval(submitCountdownTimer);
  }
  submitCountdownTimer = setInterval(() => {
    submitConfirmSeconds.value -= 1;
    if (submitConfirmSeconds.value <= 0 && submitCountdownTimer) {
      clearInterval(submitCountdownTimer);
      submitCountdownTimer = null;
    }
  }, 1000);
}

function closeSubmitModal() {
  // 只有非强制交卷时允许关闭
  if (forceSubmitting.value) return;
  submitVisible.value = false;
  if (submitCountdownTimer) {
    clearInterval(submitCountdownTimer);
    submitCountdownTimer = null;
  }
  if (closePageTimer) {
    clearInterval(closePageTimer);
    closePageTimer = null;
  }
}

function startClosePageCountdown() {
  closePageCountdown.value = 3;
  if (closePageTimer) clearInterval(closePageTimer);
  closePageTimer = setInterval(() => {
    closePageCountdown.value -= 1;
    if (closePageCountdown.value <= 0) {
      clearInterval(closePageTimer!);
      closePageTimer = null;
      // 时间到，关闭页面
      window.close();
      setTimeout(() => {
        router.replace('/exam/my-paper');
      }, 300);
    }
  }, 1000);
}

async function confirmSubmit() {
  try {
    submitting.value = true;
    await answerSubmit({
      examId: payload.value.exam.examId,
      userAnswers: answers.value,
    });
    if (cacheKey.value) {
      localStorage.removeItem(cacheKey.value);
    }
    message.success('交卷成功');
    // 交卷成功后，启动关闭倒计时
    startClosePageCountdown();
  } finally {
    submitting.value = false;
  }
}

// studentManualSubmit：学生手动提前关闭（交卷后蒙层里的按钮）
function studentManualClose() {
  if (closePageTimer) {
    clearInterval(closePageTimer);
    closePageTimer = null;
  }
  window.close();
  setTimeout(() => {
    router.replace('/exam/my-paper');
  }, 300);
}

async function handleSubmit(force = false) {
  if (force) {
    // 时间到：显示蒙层，让按钮倒计时3秒（学生也可手动提前确认）
    forceSubmitting.value = true;
    submitVisible.value = true;
    submitConfirmSeconds.value = 3;
    if (submitCountdownTimer) clearInterval(submitCountdownTimer);
    submitCountdownTimer = setInterval(() => {
      submitConfirmSeconds.value -= 1;
      if (submitConfirmSeconds.value <= 0 && submitCountdownTimer) {
        clearInterval(submitCountdownTimer);
        submitCountdownTimer = null;
        // 时间到，自动提交
        confirmSubmit().catch(console.error);
      }
    }, 1000);
    return;
  }
  openSubmitModal();
}

watch(
  answers,
  (newVal) => {
    if (payload.value?.waiting || payload.value?.readonly) return;

    // 防丢本地兜底，使用简单的 Base64 加密避免明文
    if (cacheKey.value) {
      localStorage.setItem(cacheKey.value, encodeAnswers(newVal));
    }

    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
    }
    autosaveTimer = setTimeout(() => {
      tempSave().catch(console.error);
    }, 30_000);
  },
  { deep: true },
);

watch(remainingSeconds, (value) => {
  if (value === null) return;

  // 时间到，强制交卷
  if (value === 0 && !submitting.value && !payload.value?.readonly && !payload.value?.waiting) {
    handleSubmit(true).catch(console.error);
    return;
  }

  // 剩余10分钟预警（只触发一次）
  if (value === 600 && !tenMinWarned && !payload.value?.readonly && !payload.value?.waiting) {
    tenMinWarned = true;
    notification.warning({
      message: '⚠️ 考试时间不足 10 分钟',
      description: '请尽快完成剩余题目并确认提交，避免超时自动收卷。',
      placement: 'topRight',
      duration: 10,
    });
  }
});



onMounted(async () => {
  await loadData();
  heartbeatTimer = setInterval(() => {
    syncHeartbeat().catch(console.error);
  }, 30_000);
  countdownTimer = setInterval(() => {
    computeRemaining();
  }, 1000);
});

onBeforeUnmount(() => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  if (autosaveTimer) clearTimeout(autosaveTimer);
  if (submitCountdownTimer) clearInterval(submitCountdownTimer);
  if (closePageTimer) clearInterval(closePageTimer);
});
</script>

<template>
  <div class="relative">
    <!-- 等待开考页 -->
    <div v-if="payload?.waiting" class="flex min-h-screen flex-col items-center justify-center">
      <div class="rounded-2xl border border-border bg-background-deep p-10 px-16 text-center shadow-xl">
        <div class="mb-6 flex justify-center">
          <div class="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
            <span class="i-mdi:clock-outline text-5xl"></span>
          </div>
        </div>
        <h2 class="mb-2 text-2xl font-bold text-foreground">考试尚未开始</h2>
        <p class="mb-8 text-muted-foreground">
          《{{ payload.exam.title }}》将在此倒计时结束后自动获取试卷
        </p>
        <div class="flex justify-center gap-4 text-4xl font-bold tabular-nums text-primary tracking-widest">
          {{ formatWaitTime(waitSeconds) }}
        </div>
      </div>
    </div>

    <!-- 答题页 -->
    <PaperRunner v-else :answers="answers" :loading="loading" :payload="payload" :remaining-seconds="remainingSeconds"
      :submitting="submitting" :readonly="payload?.readonly" @change-answer="handleChangeAnswer"
      @submit="handleSubmit" />


    <!-- 交卷/强制收卷蒙层 -->
    <Transition name="fade">
      <div v-if="submitVisible"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
        <div class="w-full max-w-md rounded-2xl border border-border bg-background-deep p-8 shadow-2xl">
          <div class="mb-6 flex flex-col items-center text-center">
            <div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
              :class="forceSubmitting ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'">
              <span class="text-4xl"
                :class="forceSubmitting ? 'i-mdi:alarm-off' : 'i-mdi:clipboard-check-outline'"></span>
            </div>
            <h3 class="text-2xl font-bold text-foreground">
              {{ forceSubmitting ? '考试时间已到' : '准备交卷吗？' }}
            </h3>
            <p class="mt-2 text-muted-foreground">
              {{
                forceSubmitting
                  ? '时间到，系统将在倒计时结束后自动收卷并关闭页面。'
                  : '在最终提交前，请检查您的答题状态。提交后将无法修改。'
              }}
            </p>
            <!-- 关闭页面倒计时（交卷成功后显示） -->
            <div v-if="closePageCountdown < 3" class="mt-4 text-3xl font-bold tabular-nums text-destructive">
              {{ closePageCountdown }}s 后自动关闭
            </div>
          </div>

          <!-- 答题统计 -->
          <div class="mb-8 flex flex-col gap-3">
            <div class="flex items-center justify-between rounded-xl border border-border bg-background p-4">
              <div class="flex items-center gap-3">
                <span class="i-mdi:check-circle-outline text-emerald-500 text-xl"></span>
                <span class="font-medium text-foreground">已答题目</span>
              </div>
              <span class="text-lg font-bold text-foreground">{{ answeredCount }}</span>
            </div>
            <div
              class="flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-900/40 dark:bg-orange-950/20">
              <div class="flex items-center gap-3">
                <span class="i-mdi:alert-circle-outline text-orange-500 text-xl"></span>
                <span class="font-medium text-foreground">未答题目</span>
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-3">
            <!-- 确认交卷按钮（有倒计时限制） -->
            <Button block size="large" type="primary" :disabled="submitConfirmSeconds > 0 || submitting"
              :loading="submitting" @click="confirmSubmit">
              {{
                submitConfirmSeconds > 0
                  ? `确认交卷 (${submitConfirmSeconds}s)`
                  : '确认交卷'
              }}
            </Button>

            <!-- 关闭页面按钮（交卷成功后，或强制交卷的手动提前关闭） -->
            <Button v-if="closePageCountdown < 3 || (forceSubmitting && submitConfirmSeconds <= 0 && !submitting)" block
              size="large" @click="studentManualClose">
              立即关闭页面
            </Button>

            <!-- 返回答题按钮（仅非强制时） -->
            <Button v-if="!forceSubmitting && !submitting && closePageCountdown >= 3" block size="large"
              @click="closeSubmitModal">
              返回答题
            </Button>

          </div>

          <p class="mt-6 text-center text-xs font-medium text-muted-foreground">
            {{ forceSubmitting ? '您也可以点击上方"确认交卷"提前结束。' : '倒计时结束时将自动触发上报。' }}
          </p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 蒙层淡入淡出 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 使用系统 CSS 变量确保主题一致 */
.bg-background {
  background-color: hsl(var(--background));
}

.text-foreground {
  color: hsl(var(--foreground));
}

.text-muted-foreground {
  color: hsl(var(--muted-foreground));
}

.border-border {
  border-color: hsl(var(--border));
}

.bg-primary {
  background-color: hsl(var(--primary));
}

.text-primary {
  color: hsl(var(--primary));
}

.bg-primary\/10 {
  background-color: hsl(var(--primary) / 0.1);
}

.text-destructive {
  color: hsl(var(--destructive));
}

.bg-destructive\/10 {
  background-color: hsl(var(--destructive) / 0.1);
}

.bg-muted {
  background-color: hsl(var(--muted));
}

.text-muted-foreground {
  color: hsl(var(--muted-foreground));
}

.text-warning {
  color: hsl(var(--warning, 38 92% 50%));
}

.bg-warning\/10 {
  background-color: hsl(var(--warning, 38 92% 50%) / 0.1);
}
</style>
