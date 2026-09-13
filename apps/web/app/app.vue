<script setup lang="ts">
import { BRAND } from '@revy/shared/constants'

useHead({
  titleTemplate: (title) => (title ? `${title} · ${BRAND.name}` : BRAND.name),
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
