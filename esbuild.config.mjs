import esbuild from "esbuild";
import process from "process";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
    entryPoints: ["src/main.ts"],
    bundle: true,
    external: [
        "obsidian",
        // @xenova/transformers is bundled, not external
        // This allows dynamic import to work correctly
    ],
    format: "cjs",
    target: "es2018",
    logLevel: "info",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    outfile: "main.js",
    minify: prod,
    loader: {
        ".ts": "ts",
        ".tsx": "tsx",
    },
    jsx: "automatic",
    jsxImportSource: "react",
});

if (prod) {
    await context.rebuild();
    process.exit(0);
} else {
    await context.watch();
    console.log("Watching for changes...");
}
