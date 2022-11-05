<script setup lang="ts">
import { storeToRefs } from 'pinia';
import Login from './components/login.vue';
import useStore from './store';

const store = useStore();
const loggedIn = storeToRefs(store).jira;
</script>

<template>
	<Suspense>
		<router-view v-if="loggedIn" />
		<Login v-else />
		<template #fallback>
			<a-spin size="large" />
		</template>
	</Suspense>
</template>

<style lang="less">
#app {
	padding: 10px;
}

.ant-form.two-col {
	display: grid;
	grid-template-columns: auto 1fr;
	gap: 5px;
	padding: 5px;

	.ant-form-item {
		display: contents;

		// Someday I'll probably come to regret this, but not using these currently and they make large empty grid rows in Firefox
		&::before,
		&::after {
			display: none;
		}

		.ant-form-item-label {
			grid-column: 1;
			font-weight: bold;
			text-align: right;
		}

		.ant-form-item-control-wrapper {
			grid-column: 2;
		}
	}
}
</style>
