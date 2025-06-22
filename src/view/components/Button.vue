<script setup lang="ts">
import { defineProps, defineEmits } from 'vue';

const props = defineProps<{
  text: string;
}>();

const emit = defineEmits<{
  (e: 'click'): void;
}>();
</script>

<template>
  <button @click="emit('click')">{{ text }}</button>
</template>
