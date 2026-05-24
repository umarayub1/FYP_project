import type { NextConfig } from 'next';
import path from 'path';
import NextBundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = NextBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  output: 'standalone',
  webpack(config) {
    const alias = (config.resolve?.alias ?? {}) as Record<string, string>;

    // Step 1: give the real prosemirror-view a side-door name so the shim can
    // require it without triggering the same alias (no circular dep).
    alias['prosemirror-view-real'] = require.resolve('prosemirror-view');

    // Step 2: route all prosemirror-view imports through our shim, which
    // re-exports everything + adds __serializeForClipboard removed in 1.38+.
    alias['prosemirror-view'] = path.resolve(
      __dirname,
      'src/lib/prosemirror-view-shim.js',
    );

    // Step 3: force a single module instance for the rest of the prosemirror
    // packages. BlockNote uses the CJS build and TipTap the ESM build; without
    // these aliases webpack treats them as distinct modules and `Fragment.from`
    // throws "looks like multiple versions of prosemirror-model were loaded".
    for (const pkg of [
      'prosemirror-model',
      'prosemirror-state',
      'prosemirror-transform',
      'prosemirror-commands',
      'prosemirror-keymap',
      'prosemirror-schema-list',
      'prosemirror-history',
      'prosemirror-inputrules',
    ]) {
      try {
        alias[pkg] = require.resolve(pkg);
      } catch {
        // package not installed at the top level — ignore
      }
    }

    if (config.resolve) config.resolve.alias = alias;
    return config;
  },
};

export default withBundleAnalyzer(nextConfig);
