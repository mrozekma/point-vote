<script lang="ts" setup>
import { message, TableColumnProps } from 'ant-design-vue';
import hotkeys from 'hotkeys-js';
import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import PvUser from '../components/user.vue';
import PvVoteTag from '../components/vote-tag.vue';

import { ClientToServer, ErrorObject, isErrorObject, JiraUser, Round, SessionFullJson } from '../../events';
import useStore from '../store';

// Vite refuses to let me do this:
//   import { EventNames, EventParams } from 'socket.io/dist/typed-events';
// I get:
//   ERROR: [plugin: vite:dep-scan] Missing "./dist/typed-events" export in "socket.io" package
// So I copied the types I care about:
interface EventsMap { [event: string]: any; }
type EventNames<Map extends EventsMap> = keyof Map & (string | symbol);
type EventParams<Map extends EventsMap, Ev extends EventNames<Map>> = Parameters<Map[Ev]>;

const router = useRouter();
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

const settings = reactive({
	autoEnd: false,
	hideSelf: false,
});

interface Option {
	name: string;
	options: string[];
}

const options: Option[] = [{
	name: 'Modified Fibonacci' as const,
	options: ['.5', '1', '2', '3', '5', '8', '13', '20', '30', '40', '60', '100'],
}, {
	name: 'Confidence' as const,
	options: ['1', '2', '3', '4', '5'],
}];

const newRound = reactive({
	description: '',
	jiraIssue: true,
	options: [...options[0].options],
	loading: false,
	error: undefined as string | undefined,
});

type RemoveCallbackParam<T> = T extends [...infer U, (obj: infer V | ErrorObject) => void] ? U : never;
type PromisifyCallbackParam<T> = T extends [...infer U, (obj: infer V | ErrorObject) => void] ? Promise<V> : never;

// Wrapper around store.socket.emit() that converts the callback into a Promise, and shows a popup when the response is an error.
// This does assume the callback is last, the typing doesn't enforce it.
function sendServer<Ev extends EventNames<ClientToServer>>(event: Ev, ...params: RemoveCallbackParam<EventParams<ClientToServer, Ev>>): PromisifyCallbackParam<EventParams<ClientToServer, Ev>> {
	const arr = params as any;
	//@ts-ignore
	return new Promise((resolve, reject) => {
		// Add the missing callback argument and have it resolve/reject the promise depending on the value it's called with
		arr.push((res: any) => {
			if (isErrorObject(res)) {
				message.error(res.error, 5);
				reject(res.error);
			} else {
				resolve(res);
			}
		});
		store.socket.emit(event, ...arr);
	});
}

function getRound(): Round {
	if (isErrorObject(session.value) || !session.value.round) {
		throw new Error("No round");
	}
	return session.value.round;
}

function startRound() {
	newRound.loading = true;
	newRound.error = undefined;
	sendServer('startRound', newRound.description, newRound.options, newRound.jiraIssue ? store.jira!.auth : undefined)
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
	const { description, options, jiraIssue } = getRound();
	sendServer('startRound', description, options, jiraIssue ? store.jira!.auth : undefined);
}

let session = ref<SessionFullJson | ErrorObject>(await getSession(route.params.sessionId as string));
store.socket.on('updateSession', val => session.value = val);
store.socket.on('endSession', _ => router.push('/'));
let isOwner = computed(() => !isErrorObject(session.value) && session.value.owner.key === store.jira?.user.key);
let myVote = ref<false | string | undefined>();

function checkAutoEnd() {
	if (isOwner.value && settings.autoEnd && !isErrorObject(session.value)) {
		const round = session.value.round;
		if (round && session.value.members.every(member => round.votes[member.key] === true)) {
			setTimeout(() => endRound(), 1);
		}
	}
}

watch(session, newVal => {
	if (myVote.value !== undefined && (isErrorObject(newVal) || newVal.round === undefined || (store.jira && newVal.round.votes[store.jira.user.key] === undefined))) {
		myVote.value = undefined;
	}
	checkAutoEnd();
});
watch(settings, () => checkAutoEnd());

interface Vote {
	user: JiraUser;
	vote: boolean | string | undefined; // undefined for no vote yet, true for hidden vote, false for abstention
	stillHere: boolean;
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
	if (!isErrorObject(session.value) && session.value.round) {
		rtn.push({
			dataIndex: 'vote',
			title: 'Vote',
			width: 300,
		});
	}
	return rtn;
});

let memberVotesData = computed<Vote[]>(() => {
	if (isErrorObject(session.value)) {
		return [];
	}
	const round = session.value.round;
	const rtn: Vote[] = [
		...session.value.members.map(user => ({
			user,
			vote: round?.votes[user.key],
			stillHere: true,
		})),
	];
	if (round) {
		for (const user of round.oldMembers) {
			const vote = round.votes[user.key];
			if (vote !== undefined) {
				rtn.push({
					user, vote,
					stillHere: false,
				});
			}
		}
	}
	return rtn;
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
	if (isErrorObject(session.value) || !session.value.round || !session.value.round.done) {
		return [];
	}
	const rtn: VoteMembers[] = [];
	let largest = 0;
	function process(option: string | false | undefined) {
		const voters: JiraUser[] = [];
		for (const vote of memberVotesData.value) {
			if (vote.vote === option) {
				voters.push(vote.user);
			}
		}
		if (voters.length > 0) {
			rtn.push({
				vote: option,
				voters,
				isPlurality: false,
			});
			if (voters.length > largest) {
				largest = voters.length;
			}
		}
	}
	for (const option of session.value.round.options) {
		process(option);
	}
	// Checking for the plurality is done before processing abstentions/no votes so they can't win
	if (largest > 0) {
		for (const e of rtn) {
			if (e.voters.length == largest) {
				e.isPlurality = true;
			}
		}
	}
	process(false); // Abstain
	process(undefined); // No vote
	return rtn;
});

function castVote(vote: string | false) {
	getRound();
	if (vote === myVote.value) {
		// Clicked their current vote again; retract it
		sendServer('retractVote').then(() => myVote.value = undefined);
	} else {
		sendServer('castVote', vote).then(() => myVote.value = vote);
	}
}

const hiddenVote = ref<string | undefined>(undefined);
function startHiddenVote() {
	getRound();
	if (myVote.value !== undefined) {
		// They already voted; retract it
		castVote(myVote.value);
	}
	hiddenVote.value = '';
	hotkeys.setScope('vote');
}
function castHiddenVote() {
	const round = getRound();
	const search = hiddenVote.value;
	if (search === undefined) {
		return;
	}
	hiddenVote.value = undefined;
	hotkeys.setScope('');
	let vote: string | false;
	// Look for exact matches. If none, then try substring matches (this avoids problems like trying to vote '1' when '13' is also an option)
	if (search == '') {
		return;
	} else if (search == '-') {
		vote = false;
	} else if (round.options.indexOf(search) >= 0) {
		vote = search;
	} else {
		const matches = round.options.filter(opt => opt.includes(search));
		if (matches.length == 0) {
			message.error("Hidden vote does not fit any option", 5);
			return;
		} else if (matches.length > 1) {
			message.error("Hidden vote matches multiple options; be more specific", 5);
			return;
		} else {
			vote = matches[1];
		}
	}
	castVote(vote);
}
function cancelHiddenVote() {
	hiddenVote.value = undefined;
	hotkeys.setScope('');
}
onUnmounted(() => hotkeys.setScope(''));
hotkeys('*', 'vote', e => {
	if (hiddenVote.value !== undefined && e.key.length == 1) {
		hiddenVote.value += e.key;
	}
});
hotkeys('enter', 'vote', () => {
	if (hiddenVote.value !== undefined) {
		castHiddenVote();
	}
});
hotkeys('escape', 'vote', () => cancelHiddenVote());

function setStoryPoints(points: number) {
	if (isErrorObject(session.value) || !session.value.round) {
		throw new Error("No round");
	} else if (!session.value.round.jiraIssue || isErrorObject(session.value.round.jiraIssue)) {
		throw new Error("No JIRA issue");
	}
	const key = session.value.round.jiraIssue.key;
	sendServer('setStoryPoints', points, store.jira!.auth).then(() => {
		message.success(`Set ${key}'s story points to ${points}`, 5);
	});
}
</script>

<template>
	<a-result v-if="isErrorObject(session)" status="404" title="Not found">
		<template #subTitle>
			<div>
				{{ session.error }}
			</div><br>
			<a-button type="primary" @click="router.push('/')">Home</a-button>
		</template>
	</a-result>
	<template v-else>
		<h1>{{ session.name }}</h1>

		<a-alert v-if="!session.alive" type="warning" message="Session ending" description="The session owner has disconnected. The session will close shortly." show-icon />
		<template v-else-if="session.round">
			<div class="description">
				{{ session.round.description }}
				<template v-if="session.round.jiraIssue">
					<a-alert v-if="isErrorObject(session.round.jiraIssue)" type="error" :message="session.round.jiraIssue.error" />
					<a-card v-else :title="`${session.round.jiraIssue.key}: ${session.round.jiraIssue.summary}`" size="small">
						<div v-html="session.round.jiraIssue.descriptionHtml" />
						<template #extra>
							<a-tag v-if="!isErrorObject(session.round.jiraIssue) && session.round.jiraIssue.storyPoints !== undefined">{{ session.round.jiraIssue.storyPoints }}</a-tag>
							<a-button v-if="!isErrorObject(session.round.jiraIssue)" :href="session.round.jiraIssue.url" target="_blank" size="small"><i class="fab fa-jira"></i></a-button>
						</template>
					</a-card>
				</template>
			</div>
			<template v-if="isOwner && settings.hideSelf && !session.round.done">
				<a-button v-if="myVote !== undefined" size="large" type="primary" @click="startHiddenVote">Vote cast. Click to change vote</a-button>
				<a-button v-else-if="hiddenVote === undefined" size="large" @click="startHiddenVote">Click to vote</a-button>
				<a-button v-else size="large" loading @click="cancelHiddenVote">Type your vote and press Enter</a-button>
			</template>
			<div v-else class="button-bar">
				<a-button v-for="option in session.round.options" :disabled="session.round.done" :type="option === myVote ? 'primary' : 'default'" @click="castVote(option)">{{ option }}</a-button>
				<a-button :disabled="session.round.done" :type="myVote === false ? 'primary' : 'default'" @click="castVote(false)">Abstain</a-button>
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
						<pv-user v-bind="text" :badge="!record.stillHere ? 'skull' : record.vote !== undefined ? 'tick' : undefined" />
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
						<a-tooltip v-if="isOwner && session.round!.jiraIssue && !isErrorObject(session.round!.jiraIssue) && typeof text === 'string' && /^[0-9]+$/.test(text)" placement="bottom" title="Set the issue's story points to this value">
							<a-button size="small" class="push-to-jira" @click="setStoryPoints(parseInt(text))"><i class="fas fa-arrow-right"></i><i class="fab fa-jira"></i></a-button>
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

		<div v-if="isOwner" class="round-settings-panels">
			<a-card title="Next round" size="small">
				<a-form class="two-col" autocomplete="off" @finish="startRound">
					<a-form-item label="Description">
						<a-input v-model:value="newRound.description" placeholder="JIRA key, etc." @pressEnter="startRound" />
					</a-form-item>
					<a-form-item label="JIRA">
						<div class="switches">
							<a-switch v-model:checked="newRound.jiraIssue" /> Show JIRA issue details (description must be a JIRA key or URL).
						</div>
					</a-form-item>
					<a-form-item label="Options">
						<a-select v-model:value="newRound.options" mode="tags" :open="false" :default-open="false" />
						<div class="button-bar">
							<a-button v-for="set in options" @click="newRound.options = [...set.options]">{{ set.name }}</a-button>
							<a-button @click="newRound.options = []">Clear</a-button>
						</div>
					</a-form-item>
				</a-form>
				<a-button type="primary" htmlType="submit" @click="startRound" :loading="newRound.loading">Start</a-button>
				<a-alert v-if="newRound.error" message="Error" :description="newRound.error" type="error" show-icon />
			</a-card>

			<a-card title="Settings" size="small">
				<div class="switches">
					<a-switch v-model:checked="settings.autoEnd" /> Automatically end the round when everyone has voted.
					<a-switch v-model:checked="settings.hideSelf" /> Hide your vote on your screen (intended for screen sharing).
				</div>
			</a-card>
		</div>
	</template>
</template>

<style lang="less" scoped>
.description {
	border: 1px solid #aaa;
	border-radius: 10px;
	margin: 10px 0;
	padding: 10px;

	.ant-card {
		margin-top: 10px;
	}
}

.button-bar {
	margin: 5px 0;
	display: flex;
	gap: 5px;

	.ant-btn-primary:disabled {
		background-color: #1890ff;
		color: #fff;
	}
}

.vote-tables,
.round-settings-panels {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 10px;
	margin: 10px 0;
}

.voters {
	display: flex;
	gap: 5px;
}

.ant-alert {
	margin: 5px 0;
}

.push-to-jira {
	float: right;

	>i:not(:first-child) {
		margin-left: 2px;
	}
}

.switches {
	display: grid;
	grid-template-columns: auto 1fr;
	gap: 10px;
}

.ant-btn.green {
	background-color: #52c41a;
	border-color: #52c41a;
}
</style>
