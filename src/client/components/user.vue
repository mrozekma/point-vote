<script lang="ts" setup>
	import uniqolor from 'uniqolor';
	import { computed } from 'vue';

	const props = withDefaults(defineProps<{
		key?: any; // This is present in JiraUser so this makes it easy to v-bind a JiraUser object
		name: string;
		displayName: string;
		avatar?: string;
		size?: 'default' | 'small' | 'large';
		iconOnly?: boolean;
		badge?: 'tick' | 'user' | undefined;
	}>(), {
		size: 'default',
		iconOnly: false,
	});

	const initials = computed<string>(() => {
		const words = props.displayName.split(' ');
		switch(words.length) {
			case 0: return '';
			case 1: return words[0][0].toUpperCase();
			default: return words[0][0].toUpperCase() + words[words.length - 1][0].toUpperCase();
		}
	});

	const color = computed<string>(() => uniqolor(props.displayName).color);
</script>

<template>
	<div :class="[ 'user', props.size ]">
		<component :is="props.badge ? 'a-badge' : 'div'">
			<template #count>
				<i v-if="props.badge === 'tick'" class="fas fa-check-circle opaque"></i>
				<i v-else-if="props.badge === 'user'" class="fas fa-user-circle opaque"></i>
			</template>
			<component :is="props.iconOnly ? 'a-tooltip' : 'div'" placement="bottom" :title="props.displayName">
				<a-avatar v-if="props.avatar" :size="props.size" shape="square" :src="props.avatar" />
				<a-avatar v-else :size="props.size" shape="square" :style="{ backgroundColor: color }">{{ initials }}</a-avatar>
			</component>
		</component>
		<div v-if="!props.iconOnly" class="name">{{ props.displayName }}</div>
	</div>
</template>

<style lang="less" scoped>
	.user {
		display: flex;
		align-items: center;
		gap: 10px;

		i.opaque {
			background-color: #fff;
			border-radius: 200px;
		}

		&.small .name {
			font-size: 12pt;
		}
		&.default .name {
			font-size: 14pt;
		}
		&.large .name {
			font-size: 16pt;
		}
	}
</style>
