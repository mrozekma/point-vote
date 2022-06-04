<script lang="ts" setup>
	const props = defineProps<{
		vote: string | boolean | null;
		roundOver: boolean;
	}>();
</script>

<template>
	<a-tag v-if="vote === null && roundOver" color="red">No vote</a-tag>
	<a-tag v-else-if="vote === null" color="yellow">Waiting...</a-tag>
	<a-tag v-else-if="vote === true" color="green">Voted!</a-tag>
	<a-tag v-else-if="vote === false" color="blue">Abstained</a-tag>
	<a-tag v-else>{{ vote }}</a-tag>
</template>
