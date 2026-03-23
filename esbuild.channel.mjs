import * as esbuild from "esbuild";

await esbuild.build({
	entryPoints: ["channel/server.ts"],
	bundle: true,
	outfile: "channel.js",
	platform: "node",
	target: "node18",
	format: "esm",
	sourcemap: false,
	minify: false,
	external: [],
	banner: {
		js: "#!/usr/bin/env bun",
	},
});

console.log("channel.js built");
