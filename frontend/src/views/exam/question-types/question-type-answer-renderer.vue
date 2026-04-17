<script setup lang="ts">
import type { Question } from '#/api/exam/question/model';

import { computed } from 'vue';

import { Alert } from 'ant-design-vue';

import { getQuestionTypeModule } from './registry';

const props = defineProps<{
  detail?: any;
  modelValue?: any;
  question: Partial<Question>;
  readonly?: boolean;
  standardAnswerRule?: any;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: any];
}>();

const currentModule = computed(() => getQuestionTypeModule(props.question.questionType));
const currentComponent = computed(() => {
  if (!currentModule.value) {
    return null;
  }
  return props.readonly
    ? currentModule.value.historyComponent
    : currentModule.value.answerComponent;
});
</script>

<template>
  <component
    :is="currentComponent"
    v-if="currentComponent"
    :detail="detail"
    :model-value="modelValue"
    :question="question"
    :readonly="readonly"
    :standard-answer-rule="standardAnswerRule"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <Alert
    v-else
    message="当前题型未注册，无法渲染"
    show-icon
    type="warning"
  />
</template>
