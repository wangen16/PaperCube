<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Image } from 'ant-design-vue';
import { ossInfo } from '#/api/system/oss/index';

const props = withDefaults(defineProps<{
  attachments?: any[];
}>(), {
  attachments: () => []
});

const urlMap = ref<Record<string, { url: string; type: string }>>({});

function isImageAsset(value: string) {
  return /\.(bmp|gif|jpe?g|png|svg|webp)(\?.*)?$/i.test(String(value || ''));
}

async function resolveAttachments() {
  if (!props.attachments || !props.attachments.length) return;
  
  const pendingIds: string[] = [];
  
  props.attachments.forEach(item => {
    if (typeof item === 'string' || typeof item === 'number') {
      const id = String(item);
      if (!urlMap.value[id]) pendingIds.push(id);
    } else if (item && typeof item === 'object' && item.url) {
      const type = isImageAsset(item.url || item.name) ? 'image' : 'video';
      urlMap.value[item.url] = { url: item.url, type };
    }
  });

  if (pendingIds.length > 0) {
    try {
      const res = await ossInfo(pendingIds.join(','));
      res.forEach(item => {
        const type = isImageAsset(item.url) ? 'image' : 'video';
        urlMap.value[item.ossId] = { url: item.url, type };
      });
    } catch (e) {
      console.error('Failed to fetch attachment info', e);
    }
  }
}

watch(() => props.attachments, resolveAttachments, { deep: true, immediate: true });

const resolvedList = computed(() => {
  if (!props.attachments) return [];
  return props.attachments.map(item => {
    if (typeof item === 'string' || typeof item === 'number') {
      return urlMap.value[String(item)];
    } else if (item && typeof item === 'object' && item.url) {
      return urlMap.value[item.url];
    }
    return null;
  }).filter(Boolean) as Array<{ url: string; type: string }>;
});
</script>

<template>
  <div v-if="resolvedList.length > 0" class="flex flex-wrap gap-2">
    <template v-for="(item, index) in resolvedList" :key="index">
      <div class="relative h-20 w-20 overflow-hidden rounded-md border border-border">
        <Image v-if="item.type === 'image'" :src="item.url"
          class="h-full w-full object-cover cursor-zoom-in hover:opacity-90 transition-opacity"
          :preview="{ src: item.url }" />
        <video v-else-if="item.type === 'video'" :src="item.url"
          class="h-full w-full object-cover" controls preload="metadata"></video>
      </div>
    </template>
  </div>
</template>
