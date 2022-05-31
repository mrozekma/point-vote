<script setup lang="ts">
import { storeToRefs } from 'pinia';
import Login from './components/login.vue';
import useStore from './store';

const store = useStore();
const loggedIn = storeToRefs(store).jira;
</script>

<template>
	<router-view v-if="loggedIn" />
	<Login v-else />
</template>

<style lang="less">
	#app {
		padding: 10px;
	}
</style>
