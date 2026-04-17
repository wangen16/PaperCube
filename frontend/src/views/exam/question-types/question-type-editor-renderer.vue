<script setup lang="ts">
import type { QuestionFormModel } from './model';

import { computed } from 'vue';

import { Alert } from 'ant-design-vue';

import { getQuestionTypeModule } from './registry';

const props = defineProps<{
  modelValue: QuestionFormModel;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: QuestionFormModel];
}>();

const currentModule = computed(() => getQuestionTypeModule(props.modelValue.questionType));
const currentComponent = computed(() => currentModule.value?.editorComponent || null);
</script>

<template>
  <component
    :is="currentComponent"
    v-if="currentComponent"
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <Alert
    v-else
    message="当前题型未注册"
    show-icon
    type="warning"
  />
</template>
