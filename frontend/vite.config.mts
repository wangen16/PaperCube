import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import vueI18n from '@intlify/unplugin-vue-i18n/vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { visualizer } from 'rollup-plugin-visualizer';
import { createHtmlPlugin } from 'vite-plugin-html';
import { lazyImport, VxeResolver } from 'vite-plugin-lazy-import';
import vueDevTools from 'vite-plugin-vue-devtools';
import { defineConfig, loadEnv } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = __dirname;
const packagesDir = path.resolve(frontendDir, 'packages');
const frontendPackage = JSON.parse(
  await fs.readFile(path.join(frontendDir, 'package.json'), 'utf8')
);

function toBool(value: string | undefined, fallback = false) {
  if (value == null) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function exactAlias(find: string, replacement: string) {
  return { find: new RegExp(`^${find.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`), replacement };
}

function extraAppConfigPlugin(
  env: Record<string, string>,
  base: string,
  version: string,
) {
  const appConfig = Object.fromEntries(
    Object.entries(env).filter(([key]) => key.startsWith('VITE_GLOB_')),
  );
  const publicPath = base.endsWith('/') ? base : `${base}/`;
  const source = [
    `window._VBEN_ADMIN_PRO_APP_CONF_=${JSON.stringify(appConfig)};`,
    'Object.freeze(window._VBEN_ADMIN_PRO_APP_CONF_);',
    'Object.defineProperty(window,"_VBEN_ADMIN_PRO_APP_CONF_",{configurable:false,writable:false});',
  ].join('');

  return {
    apply: 'build',
    generateBundle() {
      this.emitFile({
        fileName: '_app.config.js',
        source,
        type: 'asset',
      });
    },
    name: 'papercube-extra-app-config',
    transformIndexHtml(html: string) {
      return {
        html,
        tags: [
          {
            attrs: { src: `${publicPath}_app.config.js?v=${version}` },
            tag: 'script',
          },
        ],
      };
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, frontendDir, '');
  const appTitle = env.VITE_APP_TITLE || 'PaperCube';
  const appVersion = frontendPackage.version || '0.0.0';
  const useDevtools = toBool(env.VITE_DEVTOOLS, false);
  const useVisualizer = toBool(env.VITE_VISUALIZER, false);
  const base = env.VITE_BASE || '/';

  return {
    base,
    define: {
      __PROJECT_ROOT__: JSON.stringify(frontendDir),
      __VBEN_ADMIN_METADATA__: JSON.stringify({
        authorName: 'papercube',
        buildTime: new Date().toISOString(),
        companyName: 'vben',
        copyright: 'vben',
        description: 'PaperCube',
        homepage: '',
        license: 'MIT',
        version: appVersion
      }),
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion)
    },
    resolve: {
      alias: [
        exactAlias('#', path.resolve(frontendDir, 'src')),
        { find: /^#\/(.+)$/, replacement: path.resolve(frontendDir, 'src/$1') },
        exactAlias('@vben/access', path.resolve(packagesDir, 'effects/access/src/index.ts')),
        exactAlias('@vben/common-ui', path.resolve(packagesDir, 'effects/common-ui/src/index.ts')),
        { find: /^@vben\/common-ui\/es\/(.+)$/, replacement: path.resolve(packagesDir, 'effects/common-ui/src/components/$1') },
        exactAlias('@vben/constants', path.resolve(packagesDir, 'constants/src/index.ts')),
        exactAlias('@vben/hooks', path.resolve(packagesDir, 'effects/hooks/src/index.ts')),
        exactAlias('@vben/icons', path.resolve(packagesDir, 'icons/src/index.ts')),
        exactAlias('@vben/layouts', path.resolve(packagesDir, 'effects/layouts/src/index.ts')),
        exactAlias('@vben/locales', path.resolve(packagesDir, 'locales/src/index.ts')),
        { find: /^@vben\/plugins\/(.+)$/, replacement: path.resolve(packagesDir, 'effects/plugins/src/$1') },
        exactAlias('@vben/preferences', path.resolve(packagesDir, 'preferences/src/index.ts')),
        exactAlias('@vben/request', path.resolve(packagesDir, 'effects/request/src/index.ts')),
        exactAlias('@vben/stores', path.resolve(packagesDir, 'stores/src/index.ts')),
        exactAlias('@vben/styles', path.resolve(packagesDir, 'styles/src/index.ts')),
        exactAlias('@vben/styles/antd', path.resolve(packagesDir, 'styles/src/antd/index.css')),
        exactAlias('@vben/styles/ele', path.resolve(packagesDir, 'styles/src/ele/index.css')),
        exactAlias('@vben/styles/global', path.resolve(packagesDir, 'styles/src/global/index.scss')),
        exactAlias('@vben/styles/naive', path.resolve(packagesDir, 'styles/src/naive/index.css')),
        exactAlias('@vben/types', path.resolve(packagesDir, 'types/src/index.ts')),
        exactAlias('@vben/types/global', path.resolve(packagesDir, 'types/global.d.ts')),
        exactAlias('@vben/utils', path.resolve(packagesDir, 'utils/src/index.ts')),
        exactAlias('@vben-core/composables', path.resolve(packagesDir, '@core/composables/src/index.ts')),
        exactAlias('@vben-core/design', path.resolve(packagesDir, '@core/base/design/src/index.ts')),
        exactAlias('@vben-core/design/bem', path.resolve(packagesDir, '@core/base/design/src/scss-bem/bem.scss')),
        exactAlias('@vben-core/form-ui', path.resolve(packagesDir, '@core/ui-kit/form-ui/src/index.ts')),
        exactAlias('@vben-core/icons', path.resolve(packagesDir, '@core/base/icons/src/index.ts')),
        exactAlias('@vben-core/layout-ui', path.resolve(packagesDir, '@core/ui-kit/layout-ui/src/index.ts')),
        exactAlias('@vben-core/menu-ui', path.resolve(packagesDir, '@core/ui-kit/menu-ui/src/index.ts')),
        exactAlias('@vben-core/popup-ui', path.resolve(packagesDir, '@core/ui-kit/popup-ui/src/index.ts')),
        exactAlias('@vben-core/preferences', path.resolve(packagesDir, '@core/preferences/src/index.ts')),
        exactAlias('@vben-core/shadcn-ui', path.resolve(packagesDir, '@core/ui-kit/shadcn-ui/src/index.ts')),
        { find: /^@vben-core\/shadcn-ui\/(.+)$/, replacement: path.resolve(packagesDir, '@core/ui-kit/shadcn-ui/$1') },
        exactAlias('@vben-core/shared', path.resolve(packagesDir, '@core/base/shared/src/index.ts')),
        { find: /^@vben-core\/shared\/(.+)$/, replacement: path.resolve(packagesDir, '@core/base/shared/src/$1') },
        exactAlias('@vben-core/tabs-ui', path.resolve(packagesDir, '@core/ui-kit/tabs-ui/src/index.ts')),
        exactAlias('@vben-core/typings', path.resolve(packagesDir, '@core/base/typings/src/index.ts')),
        exactAlias('@vben-core/typings/vue-router', path.resolve(packagesDir, '@core/base/typings/vue-router.d.ts'))
      ],
      dedupe: ['vue', 'vue-router', 'pinia']
    },
    plugins: [
      vue({
        script: {
          defineModel: true
        }
      }),
      vueJsx(),
      vueI18n({
        compositionOnly: true,
        fullInstall: true,
        include: [path.resolve(frontendDir, 'src/locales/langs/**')],
        runtimeOnly: true
      }),
      createHtmlPlugin({
        inject: {
          data: {
            ...env,
            VITE_APP_TITLE: appTitle
          }
        },
        minify: true
      }),
      extraAppConfigPlugin(env, base, appVersion),
      lazyImport({
        resolvers: [
          VxeResolver({ libraryName: 'vxe-table' }),
          VxeResolver({ libraryName: 'vxe-pc-ui' })
        ]
      }),
      ...(useDevtools ? [vueDevTools()] : []),
      ...(useVisualizer
        ? [
            visualizer({
              filename: './node_modules/.cache/visualizer/stats.html',
              gzipSize: true,
              open: true
            })
          ]
        : [])
    ],
    css: {
      preprocessorOptions: {
        scss: {
          additionalData(content, filename) {
            return filename.startsWith(frontendDir)
              ? `@use "@vben/styles/global" as *;\n${content}`
              : content;
          },
          api: 'modern'
        }
      }
    },
    build: {
      rollupOptions: {
        output: {
          assetFileNames: '[ext]/[name]-[hash].[ext]',
          chunkFileNames: 'js/[name]-[hash].js',
          entryFileNames: 'js/[name]-[hash].js'
        }
      },
      sourcemap: false,
      target: 'es2015'
    },
    esbuild: {
      drop: mode === 'production' ? ['debugger'] : [],
      legalComments: 'none'
    },
    server: {
      fs: {
        allow: [frontendDir]
      },
      host: true,
      port: Number(env.VITE_PORT || 5666),
      proxy: {
        '/api': {
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
          target: 'http://127.0.0.1:6039',
          ws: true
        }
      }
    }
  };
});
