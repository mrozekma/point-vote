<script setup lang="ts">
	import { TableColumnProps } from 'ant-design-vue';
	import { reactive, ref } from 'vue';

	import useStore from '../store';
	import { isErrorObject, SessionJson } from '../../events';

	const store = useStore();

	const newSession = reactive({
		name: `${store.jira!.user.displayName}'s session`,
	});

	function createSession() {
		store.socket.emit('createSession', newSession.name, session => {
			console.log(session);
		});
	}

	const sessions = ref<SessionJson[]>([]);
	const sessionsError = ref<string | undefined>(undefined);
	store.socket.on('updateSessions', val => {
		sessions.value = val;
		sessionsError.value = undefined;
	});
	store.socket.emit('getSessions', val => {
		if(isErrorObject(val)) {
			sessionsError.value = val.error;
		} else {
			sessions.value = val;
		}
	});

	const sessionsColumns: TableColumnProps[] = [{
		dataIndex: 'id',
		title: 'ID',
	}, {
		dataIndex: 'name',
		title: 'Name',
	}, {
		dataIndex: 'creator',
		title: 'Creator',
	}, {
		dataIndex: 'created',
		title: 'Created',
	}, {
		dataIndex: 'members',
		title: 'Members',
	}];
</script>

<template>
	<h1>Create session</h1>
	<a-form class="two-col" autocomplete="off" @finish="createSession">
		<a-form-item label="Session name">
			<a-input v-model:value="newSession.name" />
		</a-form-item>
	</a-form>
	<a-button type="primary" @click="createSession">Create</a-button>

	<h1>Join session</h1>
	<a-alert v-if="sessionsError" message="Sessions error" :description="sessionsError" type="error" show-icon />
	<ATable v-else :dataSource="sessions" :columns="sessionsColumns" :foo="bar" />
</template>
