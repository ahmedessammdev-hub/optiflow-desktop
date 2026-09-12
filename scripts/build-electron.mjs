import { build } from 'esbuild';
import './icon.mjs';
await build({ entryPoints: ['apps/desktop/electron/main.ts'], outfile: 'dist-electron/main.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'] });
await build({ entryPoints: ['apps/desktop/electron/preload.ts'], outfile: 'dist-electron/preload.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'] });
