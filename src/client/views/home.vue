<script lang="ts" setup>
import { TableColumnProps } from 'ant-design-vue';
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import PvUser from '../components/user.vue';

import useStore from '../store';
import { SessionJson } from '../../events';

const router = useRouter();
const store = useStore();

function logout() {
	store.onLogout();
}

const newSession = reactive({
	name: `${store.jira!.user.displayName}'s session`,
	loading: false,
	error: undefined as string | undefined,
});

async function createSession() {
	newSession.loading = true;
	try {
		const session = await store.sendServer('createSession', newSession.name);
		router.push(`/${session.id}`);
	} catch(e) {
		newSession.loading = false;
		newSession.error = `${e}`;
	}
}

const sessions = ref<SessionJson[]>([]);
const sessionsError = ref<string | undefined>(undefined);
store.socket.on('updateSessions', val => {
	sessions.value = val;
	sessionsError.value = undefined;
});
store.sendServer('getSessions')
	.then(val => sessions.value = val)
	.catch(e => sessionsError.value = `${e}`);

const sessionsColumns: TableColumnProps[] = [{
	dataIndex: 'id',
	title: 'ID',
}, {
	dataIndex: 'name',
	title: 'Name',
}, {
	dataIndex: 'owner',
	title: 'Owner',
}, {
	dataIndex: 'created',
	title: 'Created',
}, {
	dataIndex: 'members',
	title: 'Members',
}];

function customRow(session: SessionJson) {
	return {
		onClick(e: PointerEvent) {
			router.push(`/${session.id}`);
		},
		onMousedown(e: MouseEvent) {
			if (e.button == 1) {
				window.open(`/${session.id}`, '_blank');
			}
		},
	};
}
</script>

<template>
	<div class="login-info">
		<pv-user v-bind="store.jira!.user" size="large" />
		<a-button type="primary" danger size="small" @click="logout">Logout</a-button>
	</div>

	<div class="sections">
		<a-card title="Create session" size="small">
			<a-form class="two-col" autocomplete="off" @finish="createSession">
				<a-form-item label="Session name">
					<a-input v-model:value="newSession.name" />
				</a-form-item>
			</a-form>
			<a-button type="primary" @click="createSession" :loading="newSession.loading">Create</a-button>
			<a-alert v-if="newSession.error" message="Error" :description="newSession.error" type="error" show-icon />
		</a-card>

		<a-card title="Join session" size="small">
			<a-alert v-if="sessionsError" message="Sessions error" :description="sessionsError" type="error" show-icon />
			<a-table v-else :data-source="sessions" :columns="sessionsColumns" :custom-row="customRow" :pagination="false" :locale="{ emptyText: 'No sessions exist' }">
				<template #bodyCell="{ column, text, record }">
					<template v-if="column.dataIndex == 'owner'">
						<pv-user v-bind="text" />
					</template>
					<template v-else-if="column.dataIndex == 'members'">
						<div class="users">
							<pv-user v-for="user in text" v-bind="user" icon-only />
						</div>
					</template>
				</template>
			</a-table>
		</a-card>
	</div>
</template>

<style lang="less" scoped>
.ant-table-wrapper :deep(.ant-table-row) {
	cursor: pointer;
}

.login-info {
	display: flex;
	gap: 20px;
	align-items: center;
	margin-bottom: 20px;
}

.sections {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 30px;
}

.users {
	display: flex;
	gap: 5px;
}
</style>
