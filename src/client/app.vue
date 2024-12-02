<script setup lang="ts">
import { storeToRefs } from 'pinia';
import Login from './components/login.vue';
import useStore from './store';

const version = {
	version: BUILD_VERSION,
	link: BUILD_LINK,
	date: BUILD_DATE,
	dev: import.meta.env.DEV,
};

const store = useStore();
const { server, jira: loggedIn } = storeToRefs(store);
</script>

<template>
	<Suspense>
		<a-alert v-if="server.error" message="Cannot connect to server" :description="`${store.server.error}. Retrying...`" type="error" show-icon />
		<a-spin v-else-if="!server.connected" />
		<router-view v-else-if="loggedIn" />
		<Login v-else />
		<template #fallback>
			<a-spin size="large" />
		</template>
	</Suspense>
	<footer>
		<a target="_blank" :href="version.link">{{ version.version }}</a>
		| Built {{ version.date }}
		<a-tag v-if="version.dev" color="blue">Dev</a-tag>
	</footer>
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

footer {
	position: absolute;
	bottom: 10px;
	height: 26px;
	right: 10px;
	padding-top: 10px;
	font-size: smaller;
	color: #d9d9d9;
	a {
		color: inherit;
	}
}
</style>
