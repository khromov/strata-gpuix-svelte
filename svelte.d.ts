declare module '*.zip' {
	/** The embedded file's path, from an import `with { type: 'file' }`. */
	const path: string;
	export default path;
}

declare module '*.svelte' {
	const component: import('gpuix-svelte').AnyComponent;
	export default component;
}
