<script setup lang="ts">
import type { PropType } from 'vue';

import type { KnowledgeCategoryTree } from '#/api/exam/knowledge-category/model';

import { onMounted, ref } from 'vue';

import { SyncOutlined } from '@ant-design/icons-vue';
import { Empty, InputSearch, Skeleton, Tree, Button } from 'ant-design-vue';

import { knowledgeCategoryTree } from '#/api/exam/knowledge-category';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<Props>(), {
  api: knowledgeCategoryTree,
  showSearch: true,
});

const emit = defineEmits<{
  reload: [];
  select: [];
}>();

interface Props {
  api?: () => Promise<KnowledgeCategoryTree[]>;
  showSearch?: boolean;
}

const selectedCategoryId = defineModel('selectedCategoryId', {
  required: true,
  type: Array as PropType<string[]>,
});

const searchValue = defineModel('searchValue', {
  type: String,
  default: '',
});

const categoryTreeArray = ref<KnowledgeCategoryTree[]>([]);
const showTreeSkeleton = ref(true);

async function loadTree() {
  showTreeSkeleton.value = true;
  searchValue.value = '';
  selectedCategoryId.value = [];
  categoryTreeArray.value = await props.api();
  showTreeSkeleton.value = false;
}

async function handleReload() {
  await loadTree();
  emit('reload');
}

onMounted(loadTree);
</script>

<template>
  <div :class="$attrs.class">
    <Skeleton :loading="showTreeSkeleton" :paragraph="{ rows: 8 }" active class="p-[8px]">
      <div class="bg-background flex h-full flex-col overflow-y-auto rounded-lg">
        <div v-if="showSearch" class="bg-background z-100 sticky left-0 top-0 p-[8px]">
          <InputSearch v-model:value="searchValue" allow-clear placeholder="搜索知识分类" size="small">
            <template #enterButton>
              <Button @click="handleReload">
                <SyncOutlined class="text-primary" />
              </Button>
            </template>
          </InputSearch>
        </div>
        <div class="h-full overflow-x-hidden px-[8px]">
          <Tree v-if="categoryTreeArray.length > 0" v-bind="$attrs" v-model:selected-keys="selectedCategoryId"
            :field-names="{ title: 'label', key: 'id' }" :show-line="{ showLeafIcon: false }"
            :tree-data="categoryTreeArray" :virtual="false" default-expand-all @select="$emit('select')">
            <template #title="{ label }">
              <span v-if="label.includes(searchValue)">
                {{ label.substring(0, label.indexOf(searchValue)) }}
                <span class="text-primary">{{ searchValue }}</span>
                {{
                  label.substring(
                    label.indexOf(searchValue) + searchValue.length,
                  )
                }}
              </span>
              <span v-else>{{ label }}</span>
            </template>
          </Tree>
          <div v-else class="mt-5">
            <Empty :image="Empty.PRESENTED_IMAGE_SIMPLE" description="暂无知识分类" />
          </div>
        </div>
      </div>
    </Skeleton>
  </div>
</template>
