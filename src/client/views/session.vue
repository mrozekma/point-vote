<script lang="ts" setup>
	import { ref } from 'vue';
	import { useRoute } from 'vue-router';

	import { ErrorObject, isErrorObject, SessionFullJson } from '../../events';
	import useStore from '../store';

	const route = useRoute();
	const store = useStore();

	// Suspense not supporting errors is...deeply annoying
	// function getSession(id: string): Promise<SessionFullJson> {
	// 	return new Promise((resolve, reject) => {
	// 		store.socket.emit('getSession', id, session => {
	// 			if(isErrorObject(session)) {
	// 				reject(session.error);
	// 			} else {
	// 				resolve(session);
	// 			}
	// 		});
	// 	});
	// }

	function getSession(id: string): Promise<SessionFullJson | ErrorObject> {
		return new Promise(resolve => store.socket.emit('getSession', id, resolve));
	}

	let session = ref<SessionFullJson | ErrorObject>(await getSession(route.params.sessionId as string));
</script>

<template>
	<a-result v-if="isErrorObject(session)" status="404" title="Not found" :sub-title="session.error" />
	<template v-else>
		<h1>{{ session.name }}</h1>

		TODO ({{ session }})
	</template>
</template>
