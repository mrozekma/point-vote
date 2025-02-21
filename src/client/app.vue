<script setup lang="ts">
import { theme } from 'ant-design-vue';
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
	<a-config-provider :theme="{algorithm: theme.defaultAlgorithm}">
		<main>
			<Suspense>
				<a-alert v-if="server.error" message="Cannot connect to server" :description="`${store.server.error}. Retrying...`" type="error" show-icon />
				<a-spin v-else-if="!server.connected" />
				<router-view v-else-if="loggedIn" />
				<Login v-else />
				<template #fallback>
					<a-spin size="large" />
				</template>
			</Suspense>
		</main>
		<footer>
			<a target="_blank" :href="version.link">{{ version.version }}</a>
			&nbsp;|&nbsp;Built {{ version.date }}
			<a-tag v-if="version.dev" color="blue">Dev</a-tag>
		</footer>
	</a-config-provider>
</template>

<style lang="less">
#app {
	display: flex;
	flex-direction: column;
	min-height: 100vh;
	padding: 10px;
	font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,Noto Sans,sans-serif,"Apple Color Emoji","Segoe UI Emoji",Segoe UI Symbol,"Noto Color Emoji";
}

main {
	flex-grow: 1;
}

.ant-form.two-col {
	display: grid;
	grid-template-columns: auto 1fr;
	gap: 5px;
	padding: 5px;

	.ant-form-item {
		display: contents;
	}

	.ant-form-item-row {
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
	display: flex;
	justify-content: flex-end;
	padding-top: 10px;
	font-size: smaller;
	color: #d9d9d9;
	a {
		color: inherit;
	}
	.ant-tag {
		position: relative;
		top: -2px;
		left: 5px;
	}
}
</style>
