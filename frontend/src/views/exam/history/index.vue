<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import { myPaperDetail } from '#/api/exam/my-paper';

import PaperRunner from '../_components/paper-runner.vue';

const route = useRoute();
const loading = ref(true);
const payload = ref<any>(null);
const answers = ref<Record<string, any>>({});

onMounted(async () => {
  loading.value = true;
  try {
    const response = await myPaperDetail(route.params.examId as string);
    payload.value = response;
    answers.value = { ...(response.record.userAnswers || {}) };
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <PaperRunner
    :answers="answers"
    :loading="loading"
    :payload="payload"
    readonly
  />
</template>
