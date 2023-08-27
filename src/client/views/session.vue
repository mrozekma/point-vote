<script lang="ts" setup>
import { message, TableColumnProps } from 'ant-design-vue';
import hotkeys from 'hotkeys-js';
import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import PvHelp from '../components/help.vue';
import PvUser from '../components/user.vue';
import PvVoteTag from '../components/vote-tag.vue';

import { ClientToServer, ErrorObject, isErrorObject, JiraUser, Round, SessionFullJson } from '../../events';
import useStore from '../store';

// Importing these types from socket.io keeps causing random transient build problems I'm tired of, so they're copy/pasted here:
// import { EventNames, EventParams } from 'socket.io/dist/typed-events';
interface EventsMap { [event: string]: any }
declare type EventNames<Map extends EventsMap> = keyof Map & (string | symbol);
declare type EventParams<Map extends EventsMap, Ev extends EventNames<Map>> = Parameters<Map[Ev]>;

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

const roundSettings = reactive((() => {
	const saved: { [K: string]: boolean } = JSON.parse(localStorage.getItem('settings') ?? '{}');
	return {
		autoEnd: saved['autoEnd'] ?? true,
		hideMidRound: saved['hideMidRound'] ?? true,
		revoting: saved['revoting'] ?? true,
		anonymize: saved['anonymize'] ?? false,
		autoStartRoundOnPush: saved['autoStartRoundOnPush'] ?? true,
	};
})());

watch(roundSettings, newSettings => {
	localStorage.setItem('settings', JSON.stringify(newSettings));
	if(isRoundActive()) {
		sendServer('setRoundSettings', newSettings);
	}
});

const userSettings = reactive((() => {
	const saved: { [K: string]: boolean } = JSON.parse(localStorage.getItem('userSettings') ?? '{}');
	return {
		hideSelf: saved['hideSelf'] ?? false,
		autoAbstain: saved['autoAbstain'] ?? false,
	};
})());

watch(userSettings, newSettings => {
	localStorage.setItem('userSettings', JSON.stringify(newSettings));
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
}, {
	name: 'Boolean' as const,
	options: ['Yes', 'No'],
}];

const newRound = reactive({
	description: '',
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

function isRoundActive(): boolean {
	try {
		getRound();
		return true;
	} catch(e) {
		return false;
	}
}

function startRound() {
	newRound.loading = true;
	newRound.error = undefined;
	sendServer('startRound', newRound.description, newRound.options, roundSettings, store.jira!.auth)
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
	const { description, options } = getRound();
	sendServer('startRound', description, options, roundSettings, store.jira!.auth);
}

let session = ref<SessionFullJson | ErrorObject>(await getSession(route.params.sessionId as string));
let isOwner = computed(() => !isErrorObject(session.value) && session.value.owner.key === store.jira?.user.key);
let myVote = ref<false | string | undefined>();

store.socket.on('updateSession', val => session.value = val);
store.socket.on('endSession', _ => router.push('/'));
store.socket.on('pushNewRoundDescription', (description, isJira, optionSet) => {
	if(isOwner.value) {
		newRound.description = description;
		if(isJira !== undefined) {
			newRound.jiraIssue = isJira
		}
		if(optionSet !== undefined) {
			const opt = options.find(opt => opt.name === optionSet)
			if(opt) {
				newRound.options = opt.options;
			}
		}
		if(!isRoundActive() && roundSettings.autoStartRoundOnPush) {
			startRound();
		}
	}
});

watch(session, (newVal, oldVal) => {
	if (myVote.value !== undefined && (isErrorObject(newVal) || newVal.round === undefined || (!newVal.round.settings.anonymize && store.jira && newVal.round.votes[store.jira.user.key] === undefined))) {
		myVote.value = undefined;
	}
	const newRoundStarted = ((isErrorObject(oldVal) || !oldVal.round) && !isErrorObject(newVal) && newVal.round !== undefined);
	if(newRoundStarted && userSettings.autoAbstain && myVote.value === undefined) {
		castVote(false);
	}
});

watch(() => userSettings.autoAbstain, newVal => {
	if(newVal && isRoundActive() && myVote.value === undefined) {
		castVote(false);
	}
});

interface Vote {
	user: JiraUser | undefined;
	vote: boolean | string | undefined; // undefined for no vote yet, true for hidden vote, false for abstention
	previousVote: false | string | undefined;
	stillHere: boolean;
}

const memberVotesColumns = computed<TableColumnProps<Vote>[]>(() => {
	const rtn: TableColumnProps<Vote>[] = [{
		dataIndex: 'user',
		title: 'Member',
		defaultSortOrder: 'ascend',
		sorter: {
			compare(a, b) {
				return (!a.user && !b.user) ? 0 : !a.user ? 1 : !b.user ? -1 : a.user.displayName.localeCompare(b.user.displayName);
			},
		}
	}];
	if (!isErrorObject(session.value) && session.value.round && !session.value.round.settings.anonymize) {
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
			previousVote: round?.originalVotes[user.key],
			stillHere: true,
		})),
	];
	if (round) {
		for (const user of round.oldMembers) {
			const vote = round.votes[user.key];
			if (vote !== undefined) {
				rtn.push({
					user, vote,
					previousVote: round.originalVotes[user.key],
					stillHere: false,
				});
			}
		}
	}
	return rtn;
});

interface VoteMembers {
	vote: false | string | undefined;
	voters: (JiraUser | undefined)[];
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
	if (isErrorObject(session.value) || !session.value.round || (session.value.round.settings.hideMidRound && !session.value.round.done)) {
		return [];
	}
	const round = session.value.round;
	const rtn: VoteMembers[] = [];
	let largest = 0;
	function process(option: string | false | undefined) {
		const voters: (JiraUser | undefined)[] = [];
		if (!round.settings.anonymize) {
			for (const vote of memberVotesData.value) {
				if (vote.vote === option) {
					voters.push(vote.user);
				}
			}
		} else if (option !== undefined) {
			for (const vote of round.anonymousVotes) {
				if (vote === option) {
					voters.push(undefined);
				}
			}
		} else {
			voters.push(...new Array(memberVotesData.value.length - round.anonymousVotes.length));
		}
		if (voters.length > 0) {
			voters.sort((a, b) => (!a && !b) ? 0 : !a ? 1 : !b ? -1 : a.displayName.localeCompare(b.displayName));
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
	for (const option of round.options) {
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

let voteStats = computed(() => {
	if (isErrorObject(session.value) || !session.value.round) {
		return undefined;
	}
	const options = session.value.round.options.map(n => parseFloat(n));
	if (options.some(isNaN)) {
		return undefined;
	}

	const numericVotes = voteMembersData.value.filter(v => typeof (v.vote) === 'string').map(v => ({ ...v, vote: parseFloat(v.vote as string) }));
	if (numericVotes.length === 0) {
		return undefined;
	}

	const min = Math.min(...numericVotes.map(v => v.vote));
	const max = Math.max(...numericVotes.map(v => v.vote));
	// Should the number of votes include abstentions? It feels like no.
	const numVotes = numericVotes.reduce((acc, v) => acc + v.voters.length, 0);
	const mean = numericVotes.reduce((acc, v) => acc + v.vote * v.voters.length, 0) / numVotes;
	const modes = numericVotes.filter(v => v.isPlurality).map(v => v.vote);
	const stddev = Math.sqrt(numericVotes.reduce((acc, v) => acc + Math.pow(v.vote - mean, 2) * v.voters.length, 0) / numVotes)
	return { min, max, numVotes, mean, modes, stddev };
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
			<template v-if="userSettings.hideSelf && !session.round.done">
				<a-button v-if="myVote !== undefined" size="large" type="primary" @click="startHiddenVote">Vote cast. Click to change vote</a-button>
				<a-button v-else-if="hiddenVote === undefined" size="large" @click="startHiddenVote">Click to vote</a-button>
				<a-button v-else size="large" loading @click="cancelHiddenVote">Type your vote and press Enter</a-button>
			</template>
			<div v-else class="button-bar votes">
				<a-button v-for="option in session.round.options" :disabled="session.round.done && !session.round.settings.revoting" :type="option === myVote ? 'primary' : 'default'" @click="castVote(option)">{{ option }}</a-button>
				<a-button :disabled="session.round.done && !session.round.settings.revoting" :type="myVote === false ? 'primary' : 'default'" @click="castVote(false)">Abstain</a-button>
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
			<a-table :data-source="memberVotesData" :columns="memberVotesColumns" :pagination="false" bordered style="grid-area: members">
				<template #bodyCell="{ column, text, record }">
					<template v-if="column.dataIndex == 'user'">
						<pv-user v-bind="text" :badge="!record.stillHere ? 'skull' : record.vote !== undefined ? 'tick' : undefined" />
					</template>
					<template v-else-if="column.dataIndex == 'vote'">
						<div v-if="record.previousVote !== undefined && record.previousVote !== record.vote" class="previous-vote">
							<pv-vote-tag :vote="record.previousVote" round-over />
							<i class="fas fa-arrow-right"></i>
						</div>
						<pv-vote-tag :vote="text ?? null" :round-over="session.round!.done" />
					</template>
				</template>
			</a-table>

			<a-table :data-source="voteMembersData" :columns="voteMembersColumns" :pagination="false" :locale="{ emptyText: session.round ? 'Waiting for round to end' : 'Waiting for next round' }" bordered style="grid-area: votes">
				<template #bodyCell="{ column, text, record }">
					<template v-if="column.dataIndex == 'vote'">
						<pv-vote-tag :vote="text ?? null" :round-over="session.round!.done" />
						<a-tooltip v-if="record.isPlurality" placement="bottom" title="Plurality">
							<i class="fas fa-medal"></i>
						</a-tooltip>
						<a-tooltip v-if="isOwner && session.round!.jiraIssue && !isErrorObject(session.round!.jiraIssue) && typeof text === 'string' && /^[0-9.]+$/.test(text)" placement="bottom" title="Set the issue's story points to this value">
							<a-button size="small" class="push-to-jira" @click="setStoryPoints(parseFloat(text))"><i class="fas fa-arrow-right"></i><i class="fab fa-jira"></i></a-button>
						</a-tooltip>
					</template>
					<template v-else-if="column.dataIndex == 'voters'">
						<div class="voters">
							<pv-user v-for="voter in text" v-bind="voter ?? { name: 'anon', displayName: 'Anonymous', anonymous: true }" icon-only />
						</div>
					</template>
				</template>
				<template #footer v-if="voteStats">
					<div v-if="voteStats" class="vote-stats">
						<a-statistic title="Votes" :value="voteStats.numVotes" />
						<a-statistic title="Min" :value="voteStats.min" />
						<a-statistic title="Max" :value="voteStats.max" />
						<a-statistic title="Mean" :value="voteStats.mean" :precision="2" />
						<a-statistic :title="(voteStats.modes.length == 1) ? 'Mode' : 'Modes'" :value="voteStats.modes.join(', ')" />
						<a-statistic title="Std. Dev." :value="voteStats.stddev" :precision="2" />
					</div>
				</template>
			</a-table>

			<a-card v-if="isOwner" title="Next round" size="small" style="grid-area: next-round">
				<a-form class="two-col" autocomplete="off" @finish="startRound">
					<a-form-item label="Description">
						<a-input v-model:value="newRound.description" placeholder="JIRA key, etc." @pressEnter="startRound" />
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

			<a-card title="Round settings" size="small" style="grid-area: round-settings">
				<div class="switches">
					<template v-if="isOwner">
						<a-switch v-model:checked="roundSettings.autoEnd" /> Automatically end the round when everyone has voted.
						<a-switch v-model:checked="roundSettings.hideMidRound" /> Hide votes until the round ends.
						<a-switch v-model:checked="roundSettings.revoting" /> Allow revoting after round ends.
						<a-switch v-model:checked="roundSettings.anonymize" /> Anonymize voter identities.
						<a-switch v-model:checked="roundSettings.autoStartRoundOnPush" /> <span>
							Automatically start new round on Jira push.
							<pv-help dialog="Pushing from Jira">
								<!-- This hardcodes some stuff that technically is controlled by the Jira admin, but I doubt anyone uses this app but me, so oh well -->
								You can now push issues from Jira to Point Vote instead of copy/pasting the key or URL. To do this:<br><br>
								<ul>
									<li>Start a session in Point Vote. You can only have one active session for this feature to work.</li>
									<li>In another tab, navigate to the Jira issue.</li>
									<li>From the <b>More</b> menu, select <b>Send to Point Vote</b>. This will likely be at the very bottom of the menu.</li>
									<li>Return to the Point Vote tab. If the "automatically start new round" option is selected, you should see a new round for voting on the Jira issue. Otherwise, you should see the Jira issue's key filled in as the next round description.</li>
								</ul>
							</pv-help>
						</span>
					</template>
					<template v-else-if="session.round">
						<a-switch disabled :checked="session.round.settings.autoEnd" /> Automatically end the round when everyone has voted.
						<a-switch disabled :checked="session.round.settings.hideMidRound" /> Hide votes until the round ends.
						<a-switch disabled :checked="session.round.settings.revoting" /> Allow revoting after round ends.
						<a-switch disabled :checked="session.round.settings.anonymize" /> Anonymize voter identities.
						<a-switch disabled :checked="session.round.settings.autoStartRoundOnPush" /> Automatically start new round on Jira push.
					</template>
					<a-alert v-else type="info" message="Waiting for next round" show-icon />
				</div>
			</a-card>

			<a-card title="User settings" size="small" style="grid-area: user-settings">
				<div class="switches">
					<a-switch v-model:checked="userSettings.hideSelf" /> <span>Hide your vote on your screen. <pv-help>The is intended for when you are sharing your screen with others in the session. You will type your vote instead of clicking a button.</pv-help></span>
					<a-switch v-model:checked="userSettings.autoAbstain" /> <span>Automatically abstain. <pv-help>This is intended for when you're walking away briefly. Or if you hate planning.</pv-help></span>
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

	&.votes .ant-btn {
		min-width: 50px;
	}
}

.vote-tables {
	display: grid;
	gap: 10px;
	margin: 10px 0;
	grid-template-columns: 2fr 1fr 1fr;
	grid-template-areas:
		"members votes votes"
		"next-round round-settings user-settings";
}

.vote-stats {
	display: flex;
	gap: 10px;

	* {
		flex-grow: 1;
	}

	/deep/ .ant-statistic-content {
		font-size: 12pt;
	}
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

	.ant-alert {
		grid-column-end: span 2;
	}
}

.ant-btn.green {
	background-color: #52c41a;
	border-color: #52c41a;
}

.previous-vote {
	display: inline-block;

	>.ant-tag {
		text-decoration: line-through;
	}

	>i {
		margin-right: 8px;
	}
}
</style>

<!-- Syntax highlighting using colors from Jira -->
<style lang="less" scoped>
.description /deep/ .code {
	border: 1px solid #c1c7d0;
	background: #f4f5f7;
	font-size: 12px;
	font-family: monospace;
	padding: 5px;

	.code-keyword {
		color: #910091;
	}
	.code-object, .code-tag {
		color: #000091;
	}
	.code-macro {
		color: #78492a;
	}
	.code-quote, .code-quote .code-keyword, .code-quote .code-object {
		color: #009100;
	}
	.code-quote-red, .code-quote-red .code-keyword, .code-quote-red .code-object {
		color: #910000;
	}
	.code-comment, .code-comment .code-keyword, .code-comment .code-object, .code-comment .code-quote, .code-comment .code-quote-red {
		color: #808080;
	}
	.code-xml .code-keyword {
		font-weight: bold;
	}
}
</style>
