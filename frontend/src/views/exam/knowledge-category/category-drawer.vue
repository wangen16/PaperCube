<script setup lang="ts">
import { computed, ref } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';
import { $t } from '@vben/locales';
import { cloneDeep } from '@vben/utils';

import { useVbenForm } from '#/adapter/form';
import {
  knowledgeCategoryAdd,
  knowledgeCategoryExcludeTree,
  knowledgeCategoryInfo,
  knowledgeCategoryTree,
  knowledgeCategoryUpdate,
} from '#/api/exam/knowledge-category';
import { defaultFormValueGetter, useBeforeCloseDiff } from '#/utils/popup';

import { drawerSchema } from './data';

const emit = defineEmits<{ reload: [] }>();

interface DrawerProps {
  id?: number | string;
  update: boolean;
}

const isUpdate = ref(false);
const title = computed(() => {
  return isUpdate.value ? $t('pages.common.edit') : $t('pages.common.add');
});

const [BasicForm, formApi] = useVbenForm({
  commonConfig: {
    componentProps: {
      class: 'w-full',
    },
    formItemClass: 'col-span-2',
    labelWidth: 90,
  },
  schema: drawerSchema(),
  showDefaultActions: false,
  wrapperClass: 'grid-cols-2',
});

async function setupParentTree(categoryId?: number | string) {
  const treeData = categoryId
    ? await knowledgeCategoryExcludeTree(categoryId)
    : await knowledgeCategoryTree();
  formApi.updateSchema([
    {
      componentProps: {
        allowClear: true,
        fieldNames: {
          children: 'children',
          label: 'label',
          value: 'id',
        },
        placeholder: '留空表示顶级分类',
        showSearch: true,
        treeData,
        treeDefaultExpandAll: true,
        treeLine: { showLeafIcon: false },
        treeNodeFilterProp: 'label',
      },
      fieldName: 'parentId',
    },
  ]);
}

const { onBeforeClose, markInitialized, resetInitialized } = useBeforeCloseDiff(
  {
    initializedGetter: defaultFormValueGetter(formApi),
    currentGetter: defaultFormValueGetter(formApi),
  },
);

const [BasicDrawer, drawerApi] = useVbenDrawer({
  onBeforeClose,
  onClosed: handleClosed,
  onConfirm: handleConfirm,
  async onOpenChange(isOpen) {
    if (!isOpen) {
      return null;
    }
    drawerApi.drawerLoading(true);

    const { id, update } = drawerApi.getData() as DrawerProps;
    isUpdate.value = update;

    if (id) {
      await formApi.setFieldValue('parentId', Number(id));
      if (update) {
        const record = await knowledgeCategoryInfo(id);
        await formApi.setValues(record);
      }
    }

    await setupParentTree(update ? id : undefined);
    await markInitialized();

    drawerApi.drawerLoading(false);
  },
});

async function handleConfirm() {
  try {
    drawerApi.lock(true);
    const { valid } = await formApi.validate();
    if (!valid) {
      return;
    }
    const data = cloneDeep(await formApi.getValues());
    data.parentId = Number(data.parentId || 0);
    delete data.categoryCode;
    await (isUpdate.value
      ? knowledgeCategoryUpdate(data)
      : knowledgeCategoryAdd(data));
    resetInitialized();
    emit('reload');
    drawerApi.close();
  } catch (error) {
    console.error(error);
  } finally {
    drawerApi.lock(false);
  }
}

async function handleClosed() {
  await formApi.resetForm();
  await formApi.setFieldValue('parentId', 0);
  resetInitialized();
}
</script>

<template>
  <BasicDrawer :title="title" class="w-[620px]">
    <BasicForm />
  </BasicDrawer>
</template>
