<script setup lang="ts">
	import useStore from '../store';

	const store = useStore();

	function jiraTest() {
		const { token, secret } = store.jiraSession!;
		store.socket.emit('jiraTest', token, secret);
	}
</script>

<template>
	Home<br>
	<a-button @click="jiraTest">Jira Test</a-button>
</template>
