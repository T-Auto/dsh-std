import { defineConfig } from 'tsdown'

/** Build the transport- and domain-neutral standard core. */

export default defineConfig({
  entry: { index: 'src/index.ts', identity: 'src/identity.ts', json: 'src/json.ts', version: 'src/version.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
})
