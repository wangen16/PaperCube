<script setup lang="ts">
import type { Question } from '#/api/exam/question/model';

import { computed } from 'vue';

import { Alert } from 'ant-design-vue';

import { getQuestionTypeModule } from './registry';

const props = defineProps<{
  question: Partial<Question>;
}>();

const currentModule = computed(() => getQuestionTypeModule(props.question.questionType));
const currentComponent = computed(() => currentModule.value?.previewComponent || null);
</script>

<template>
  <component
    :is="currentComponent"
    v-if="currentComponent"
    :question="question"
  />
  <Alert
    v-else
    message="当前题型未注册，无法预览"
    show-icon
    type="warning"
  />
</template>
