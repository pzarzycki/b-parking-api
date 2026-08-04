import type { Config } from '@docusaurus/types';
import type { ScalarOptions } from '@scalar/docusaurus';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const scalarComponent = require.resolve('@scalar/docusaurus/dist/ScalarDocusaurus.js');

const config: Config = {
  title: 'Parking Garage Management API',
  tagline: 'Documentation for operating and integrating with a single-garage parking API',
  favicon: 'img/favicon.svg',
  url: 'https://pzarzycki.github.io',
  baseUrl: '/b-parking-api/',
  organizationName: 'pzarzycki',
  projectName: 'b-parking-api',
  trailingSlash: true,
  onBrokenLinks: 'throw',
  markdown: {
    mermaid: true,
    hooks: { onBrokenMarkdownLinks: 'throw' },
  },
  themes: ['@docusaurus/theme-mermaid'],
  presets: [
    ['classic', {
      docs: {
        path: '..',
        routeBasePath: '/',
        sidebarPath: './sidebars.ts',
        include: ['*.md', '**/*.md'],
        exclude: ['website/**'],
      },
      blog: false,
      pages: false,
      theme: { customCss: './src/css/custom.css' },
    }],
  ],
  plugins: [
    () => ({
      name: 'scalar-esm-compatibility',
      configureWebpack: () => ({
        resolve: {
          alias: {
            [resolve(dirname(scalarComponent), 'ScalarDocusaurus')]: scalarComponent,
          },
        },
      }),
    }),
    ['@scalar/docusaurus', {
      label: 'API reference',
      route: '/api-reference',
      configuration: {
        url: '/b-parking-api/openapi.yaml',
        hideClientButton: true,
        hideTestRequestButton: true,
        showDeveloperTools: 'never',
        agent: { disabled: true },
      },
    } satisfies ScalarOptions],
  ],
  themeConfig: {
    navbar: {
      title: 'Parking API',
      items: [
        { type: 'docSidebar', sidebarId: 'documentationSidebar', position: 'left', label: 'Documentation' },
        { to: '/api-reference', position: 'left', label: 'API reference' },
        { href: 'https://github.com/pzarzycki/b-parking-api', position: 'right', label: 'GitHub' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        { title: 'Documentation', items: [
          { label: 'Introduction', to: '/' },
          { label: 'Database schema', to: '/database-schema' },
          { label: 'Floor plans', to: '/floor-plans' },
        ] },
        { title: 'Project', items: [
          { label: 'API reference', to: '/api-reference' },
          { label: 'GitHub', href: 'https://github.com/pzarzycki/b-parking-api' },
        ] },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Parking Garage Management API.`,
    },
    prism: { additionalLanguages: ['yaml'] },
  },
};

export default config;
