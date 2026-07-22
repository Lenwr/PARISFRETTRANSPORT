<script setup>
import PageLoader from "./components/PageLoader.vue"
</script>

<template>
  <RouterView v-slot="{ Component, route }">
    <Suspense>
      <component :is="Component" :key="route.fullPath" />

      <template #fallback>
        <PageLoader />
      </template>
    </Suspense>
  </RouterView>
</template>
