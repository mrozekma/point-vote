<script lang="ts" setup>
import { ref } from 'vue';

const props = defineProps<{
	dialog?: string,
}>();

const cls = 'fas fa-question-circle';
const open = ref(false);
</script>

<template>
	<a-tooltip v-if="dialog === undefined" placement="left">
		<template v-slot:title>
			<slot />
		</template>
		<i :class="cls"></i>
	</a-tooltip>
	<template v-else>
		<a-tooltip placement="left" title="Click for more information">
			<i :class="cls" style="cursor: pointer" @click="open = true"></i>
		</a-tooltip>
		<a-modal v-model:visible="open" :title="dialog">
			<slot />
			<template #footer>
				<a-button @click="open = false">Close</a-button>
			</template>
		</a-modal>
	</template>
</template>
