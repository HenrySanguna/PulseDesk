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
  externals: [{ argon2: 'commonjs argon2' }],
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
