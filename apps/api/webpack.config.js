const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, 'dist'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  // NxAppWebpackPlugin's automatic node externals detection scans
  // `<workspace-root>/node_modules`, but pnpm only installs a
  // project-scoped dependency (like argon2, used only by apps/api) under
  // apps/api/node_modules, not hoisted to the root. Undetected packages
  // get bundled instead of externalized, which breaks argon2's
  // node-gyp-build(__dirname) native-binding lookup at runtime (__dirname
  // resolves to the bundle's own directory, not argon2's real package
  // path). Force it external explicitly; mergeExternals keeps the
  // plugin's own auto-detected externals too.
  //
  // Same root cause bundles `class-transformer`/`class-validator` twice:
  // once resolved from apps/api's own node_modules (statically imported by
  // every DTO) and once from `@nestjs/common`'s own nested copy (loaded via
  // its internal `loadPackage`/dynamic `require('class-transformer')` at
  // `ValidationPipe` construction time). Two separate bundled module
  // instances means two separate `class-transformer` metadata registries,
  // so `@Type()`/`@Transform()` decorators recorded against the DTO's copy
  // are invisible to the pipe's copy — the decorator silently never runs at
  // request time, even though `class-validator` (bundled the same way, but
  // its checks don't depend on cross-module decorator metadata sharing)
  // still validates and correctly rejects the untransformed string. Force
  // both external too, so both call sites resolve the exact same instance.
  externals: [
    { argon2: 'commonjs argon2' },
    { 'class-transformer': 'commonjs class-transformer' },
    { 'class-validator': 'commonjs class-validator' },
  ],
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: false,
      sourceMap: true,
      mergeExternals: true,
    }),
  ],
};
