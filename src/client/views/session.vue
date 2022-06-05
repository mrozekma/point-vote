<script lang="ts" setup>
	import { message, TableColumnProps } from 'ant-design-vue';
	import { EventNames, EventParams } from 'socket.io/dist/typed-events';
	import { computed, reactive, ref, watch } from 'vue';
	import { useRoute } from 'vue-router';

	import PvUser from '../components/user.vue';
	import PvVoteTag from '../components/vote-tag.vue';

	import { ClientToServer, ErrorObject, isErrorObject, JiraUser, SessionFullJson } from '../../events';
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

	type RemoveCallbackParam<T>    = T extends [...infer U, (obj: infer V | ErrorObject) => void] ? U : never;
	type PromisifyCallbackParam<T> = T extends [...infer U, (obj: infer V | ErrorObject) => void] ? Promise<V> : never;

	// Wrapper around store.socket.emit() that converts the callback into a Promise, and shows a popup when the response is an error.
	// This does assume the callback is last, the typing doesn't enforce it.
	function sendServer<Ev extends EventNames<ClientToServer>>(event: Ev, ...params: RemoveCallbackParam<EventParams<ClientToServer, Ev>>): PromisifyCallbackParam<EventParams<ClientToServer, Ev>> {
		const arr = params as any;
		//@ts-ignore
		return new Promise((resolve, reject) => {
			// Add the missing callback argument and have it resolve/reject the promise depending on the value it's called with
			arr.push((res: any) => {
				if(isErrorObject(res)) {
					message.error(res.error, 5);
					reject(res.error);
				} else {
					resolve(res);
				}
			});
			store.socket.emit(event, ...arr);
		});
	}

	function startRound() {
		newRound.loading = true;
		newRound.error = undefined;
		sendServer('startRound', newRound.description, newRound.options)
			.then(() => {
				newRound.description = '';
			})
			.finally(() => {
				newRound.loading = false;
			});
	}

	function endRound() {
		sendServer('endRound');
	}

	function clearRound() {
		sendServer('clearRound');
	}

	function restartRound() {
		if(isErrorObject(session.value) || !session.value.round) {
			throw new Error("No round");
		}
		const { description, options } = session.value.round;
		sendServer('startRound', description, options);
	}

	let session = ref<SessionFullJson | ErrorObject>(await getSession(route.params.sessionId as string));
	store.socket.on('updateSession', val => session.value = val);
	let isOwner = computed(() => !isErrorObject(session.value) && session.value.owner.key === store.jira?.user.key);
	let myVote = ref<false | string | undefined>();

	watch(session, newVal => {
		if(myVote.value !== undefined && (isErrorObject(newVal) || newVal.round === undefined || (store.jira && newVal.round.votes[store.jira.user.key] === undefined))) {
			myVote.value = undefined;
		}
	});

	interface Vote {
		user: JiraUser;
		vote: boolean | string | undefined; // undefined for no vote yet, true for hidden vote, false for abstention
	}

	const memberVotesColumns = computed<TableColumnProps<Vote>[]>(() => {
		const rtn: TableColumnProps<Vote>[] = [{
			dataIndex: 'user',
			title: 'Member',
			defaultSortOrder: 'ascend',
			sorter: {
				compare(a, b) {
					return a.user.displayName.localeCompare(b.user.displayName);
				},
			}
		}];
		if(!isErrorObject(session.value) && session.value.round) {
			rtn.push({
				dataIndex: 'vote',
				title: 'Vote',
				width: 300,
			});
		}
		return rtn;
	});

	let memberVotesData = computed<Vote[]>(() => {
		if(isErrorObject(session.value)) {
			return [];
		}
		const round = session.value.round;
		return session.value.members.map(user => ({
			user,
			vote: round?.votes[user.key],
		}));
	});

	interface VoteMembers {
		vote: false | string | undefined;
		voters: JiraUser[];
		isPlurality: boolean;
	}

	const voteMembersColumns: TableColumnProps[] = [{
		dataIndex: 'vote',
		title: 'Vote',
		width: 300,
	}, {
		dataIndex: 'voters',
		title: 'Voters',
	}];

	let voteMembersData = computed<VoteMembers[]>(() => {
		if(isErrorObject(session.value) || !session.value.round || !session.value.round.done) {
			return [];
		}
		const rtn: VoteMembers[] = [];
		let largest = 0;
		function process(option: string | false | undefined) {
			const voters: JiraUser[] = [];
			for(const vote of memberVotesData.value) {
				if(vote.vote === option) {
					voters.push(vote.user);
				}
			}
			if(voters.length > 0) {
				rtn.push({
					vote: option,
					voters,
					isPlurality: false,
				});
				if(voters.length > largest) {
					largest = voters.length;
				}
			}
		}
		for(const option of session.value.round.options) {
			process(option);
		}
		// Checking for the plurality is done before processing abstentions/no votes so they can't win
		if(largest > 0) {
			for(const e of rtn) {
				if(e.voters.length == largest) {
					e.isPlurality = true;
				}
			}
		}
		process(false); // Abstain
		process(undefined); // No vote
		return rtn;
	});

	function castVote(vote: string | false) {
		if(isErrorObject(session.value) || !session.value.round) {
			throw new Error("No round");
		}
		if(vote === myVote.value) {
			// Clicked their current vote again; retract it
			sendServer('retractVote').then(() => myVote.value = undefined);
		} else {
			sendServer('castVote', vote).then(() => myVote.value = vote);
		}
	}
</script>

<template>
	<a-result v-if="isErrorObject(session)" status="404" title="Not found" :sub-title="session.error" />
	<template v-else>
		<h1>{{ session.name }}</h1>

		<template v-if="session.round">
			<div class="description">
				{{ session.round.description }}
			</div>
			<div class="button-bar">
				<a-button v-for="option in session.round.options" :type="option === myVote ? 'primary' : 'default'" @click="castVote(option)">{{ option }}</a-button>
				<a-button :type="myVote === false ? 'primary' : 'default'" @click="castVote(false)">Abstain</a-button>
			</div>
			<div v-if="isOwner" class="button-bar">
				<template v-if="!session.round.done">
					<a-button type="danger" @click="endRound">End voting</a-button>
					<a-button type="danger" @click="clearRound">Cancel round</a-button>
				</template>
				<template v-else>
					<a-button type="danger" @click="restartRound">Repeat round</a-button>
					<a-button type="danger" @click="clearRound">Clear results</a-button>
				</template>
			</div>
		</template>
		<a-alert v-else type="info" message="Waiting for next round" show-icon />

		<div class="vote-tables">
			<a-table :data-source="memberVotesData" :columns="memberVotesColumns" :pagination="false">
				<template #bodyCell="{ column, text, record }">
					<template v-if="column.dataIndex == 'user'">
						<pv-user v-bind="text" :badge="record.vote !== undefined ? 'tick' : undefined" />
					</template>
					<template v-else-if="column.dataIndex == 'vote'">
						<pv-vote-tag :vote="text ?? null" :round-over="session.round!.done" />
					</template>
				</template>
			</a-table>
			<a-table :data-source="voteMembersData" :columns="voteMembersColumns" :pagination="false" :locale="{ emptyText: 'Waiting for round to end' }">
				<template #bodyCell="{ column, text, record }">
					<template v-if="column.dataIndex == 'vote'">
						<pv-vote-tag :vote="text ?? null" :round-over="session.round!.done" />
						<a-tooltip v-if="record.isPlurality" placement="bottom" title="Plurality">
							<i class="fas fa-medal"></i>
						</a-tooltip>
					</template>
					<template v-else-if="column.dataIndex == 'voters'">
						<div class="voters">
							<pv-user v-for="voter in text" v-bind="voter" icon-only />
						</div>
					</template>
				</template>
			</a-table>
		</div>

		<template v-if="isOwner">
			<h2>Next round</h2>
			<a-form class="two-col" autocomplete="off" @finish="startRound">
				<a-form-item label="Description">
					<a-input v-model:value="newRound.description" placeholder="JIRA id, etc." />
				</a-form-item>
				<a-form-item label="Options">
					<a-select v-model:value="newRound.options" mode="tags" :open="false" :default-open="false" />
					<div class="button-bar">
						<a-button v-for="set in options" @click="newRound.options = [ ...set.options ]">{{ set.name }}</a-button>
						<a-button @click="newRound.options = []">Clear</a-button>
					</div>
				</a-form-item>
			</a-form>
			<a-button type="primary" @click="startRound" :loading="newRound.loading">Start</a-button>
			<a-alert v-if="newRound.error" message="Error" :description="newRound.error" type="error" show-icon />
		</template>
	</template>
</template>

<style lang="less" scoped>
	.description {
		border: 1px solid #aaa;
		border-radius: 10px;
		margin: 10px 0;
		padding: 10px;
	}

	.button-bar {
		margin: 5px 0;
		display: flex;
		gap: 5px;
	}
	.vote-tables {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}

	.voters {
		display: flex;
		gap: 5px;
	}

	.ant-alert {
		margin: 5px 0;
	}
</style>
