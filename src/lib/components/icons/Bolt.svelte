<script lang="ts">
	export let className = 'size-3';
	export let strokeWidth = '1.5';
	export let fillPercent = 0;

	$: fillFraction = Math.max(0, Math.min(1, fillPercent / 100));
	$: clipId = `bolt-fill-${Math.random().toString(36).slice(2)}`;
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 24 24"
	aria-hidden="true"
	stroke-width={strokeWidth}
	stroke="currentColor"
	class={className}
>
	<defs>
		<clipPath id={clipId} clipPathUnits="objectBoundingBox">
			<rect x="0" y={1 - fillFraction} width="1" height={fillFraction} />
		</clipPath>
	</defs>
	<path
		fill="none"
		stroke-linecap="round"
		stroke-linejoin="round"
		d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z"
	/>
	<g clip-path={`url(#${clipId})`}>
		<path
			fill="currentColor"
			stroke="none"
			d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z"
		/>
	</g>
</svg>
