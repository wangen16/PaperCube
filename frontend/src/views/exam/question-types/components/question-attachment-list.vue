<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { PaperClipOutlined } from '@ant-design/icons-vue';
import { Tag } from 'ant-design-vue';

import { ossInfo } from '#/api/system/oss';

const props = defineProps<{
  attachments?: string[];
  compact?: boolean;
}>();

const loading = ref(false);
const fileList = ref<
  Array<{
    name: string;
    ossId: string;
    suffix: string;
    type: 'file' | 'image' | 'video';
    url: string;
  }>
>([]);

const imageSuffixSet = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']);
const videoSuffixSet = new Set(['mp4', 'webm', 'ogg', 'mov', 'm4v']);

const attachmentIds = computed(() =>
  Array.isArray(props.attachments)
    ? props.attachments.map((item) => String(item)).filter(Boolean)
    : [],
);

watch(
  attachmentIds,
  async (value) => {
    if (value.length === 0) {
      fileList.value = [];
      return;
    }
    loading.value = true;
    try {
      const response = await ossInfo(value);
      fileList.value = response.map((item) => ({
        name: item.originalName || item.fileName,
        ossId: item.ossId,
        suffix: String(item.fileSuffix || '')
          .replace(/^\./, '')
          .toLowerCase(),
        type: imageSuffixSet.has(
          String(item.fileSuffix || '')
            .replace(/^\./, '')
            .toLowerCase(),
        )
          ? 'image'
          : videoSuffixSet.has(
            String(item.fileSuffix || '')
              .replace(/^\./, '')
              .toLowerCase(),
          )
            ? 'video'
            : 'file',
        url: item.url,
      }));
    } catch {
      fileList.value = value.map((item) => ({
        name: `附件 ${item}`,
        ossId: item,
        suffix: '',
        type: 'file',
        url: '',
      }));
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

const imageList = computed(() => fileList.value.filter((item) => item.type === 'image'));
const videoList = computed(() => fileList.value.filter((item) => item.type === 'video'));
const normalFileList = computed(() => fileList.value.filter((item) => item.type === 'file'));
</script>

<template>
</template>
