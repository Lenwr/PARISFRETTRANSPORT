<script setup>
defineProps(['route'])
</script>

<template>
  <div class="bg-primary w-screen h-[4em] flex items-center justify-end pr-4" >
    <router-link :to="'/'+ route">
      <button class="btn btn-neutral">retour</button>
    </router-link>
  </div>
</template>

<style scoped>

</style>