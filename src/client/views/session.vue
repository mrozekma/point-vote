<script lang="ts" setup>
	import { message } from 'ant-design-vue';
import { EventNames, EventParams } from 'socket.io/dist/typed-events';
	import { computed, reactive, ref } from 'vue';
	import { useRoute } from 'vue-router';

	import { ClientToServer, ErrorObject, isErrorObject, SessionFullJson } from '../../events';
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

	interface Option {
		name: string;
		options: string[];
	}

	const options: Option[] = [{
		name: 'Modified Fibonacci' as const,
		options: [ '.5', '1', '2', '3', '5', '8', '13', '20', '40', '60', '100' ],
	}, {
		name: 'Confidence' as const,
		options: [ '1', '2', '3', '4', '5' ],
	}];

	const newRound = reactive({
		description: '',
		options: [ ...options[0].options ],
		loading: false,
		error: undefined as string | undefined,
	});

	// Given a function type like:
	//     (a: A, b: B, cb: (result: R | ErrorObject) => void) => void
	// removes the error possibility from the callback parameter:
	//     (a: A, b: B, cb: (result: R) => void) => void
	type RemoveErrorFromCallbackParam<Params extends readonly any[]> = {
		[K in keyof Params]: Params[K] extends (arg: infer T | ErrorObject) => void ? (arg: T) => void : Params[K];
	}

	// Wrapper around store.socket.emit() that turns an error response into a popup and forwards a successful response to the callback.
	// This does assume the callback is last, the typing doesn't enforce it.
	//@ts-ignore Typescript is erroring with "a rest parameter must be of an array type". Don't know why, but works fine
	function sendServer<Ev extends EventNames<ClientToServer>>(event: Ev, ...params: RemoveErrorFromCallbackParam<EventParams<ClientToServer, Ev>>) {
		const arr = params as any;
		const cb = arr.pop();
		arr.push((res: any) => {
			if(isErrorObject(res)) {
				message.error(res.error, 5);
			} else {
				cb(res);
			}
		});
		store.socket.emit(event, ...arr);
	}

	function startRound() {
		newRound.loading = true;
		newRound.error = undefined;
		sendServer('startRound', newRound.description, newRound.options, () => {
			//TODO Need a way to run this on error (return a promise from sendServer)
			newRound.loading = false;
			newRound.description = '';
		});
	}

	function endRound() {
		store.socket.emit('endRound', res => {});
	}

	let session = ref<SessionFullJson | ErrorObject>(await getSession(route.params.sessionId as string));
	store.socket.on('updateSession', val => session.value = val);
	let isOwner = computed(() => !isErrorObject(session.value) && session.value.owner.key === store.jira?.user.key);
</script>

<template>
	<a-result v-if="isErrorObject(session)" status="404" title="Not found" :sub-title="session.error" />
	<template v-else>
		<h1>{{ session.name }}</h1>

		<template v-if="session.round">
			{{ session.round }}
			<template v-if="isOwner">
				<a-button @click="endRound">End voting</a-button>
				<a-button type="danger" @click="abortRound">Cancel round</a-button>
			</template>
		</template>

		<a-alert v-else type="info" message="Waiting for next round" show-icon />

		<template v-if="isOwner">
			<h2>Next round</h2>
			<a-form class="two-col" autocomplete="off" @finish="startRound">
				<a-form-item label="Description">
					<a-input v-model:value="newRound.description" placeholder="JIRA id, etc." />
				</a-form-item>
				<a-form-item label="Options">
					<a-select v-model:value="newRound.options" mode="tags" :open="false" :default-open="false" />
					<a-button v-for="set in options" @click="newRound.options = [ ...set.options ]">{{ set.name }}</a-button>
					<a-button @click="newRound.options = []">Clear</a-button>
				</a-form-item>
			</a-form>
			<a-button type="primary" @click="startRound" :loading="newRound.loading">Start</a-button>
			<a-alert v-if="newRound.error" message="Error" :description="newRound.error" type="error" show-icon />
		</template>
		<i class="fas fa-check"></i>
	</template>
</template>
