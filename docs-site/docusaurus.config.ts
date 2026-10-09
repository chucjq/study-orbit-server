import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// Documentation for the Study Orbit REST API (the server in the parent folder).
// Mermaid is enabled through `markdown.mermaid` and the theme below; any ```mermaid
// code fence in a page is rendered as a diagram.
const config: Config = {
  title: 'Study Orbit Server',
  tagline: 'Documentation for the spaced-repetition REST API',
  favicon: 'img/favicon.svg',

  // Replace with the real deployment URL before publishing.
  url: 'https://chucjq.github.io',
  baseUrl: '/study-orbit-server/',
  organizationName: 'chucjq',
  projectName: 'study-orbit-server',
  trailingSlash: false,

  onBrokenLinks: 'throw',

  markdown: {
    // Plain .md files use CommonMark, so characters such as { and < in prose are safe.
    // Use .mdx only when a page needs React components.
    format: 'detect',
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  themes: ['@docusaurus/theme-mermaid'],

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          // The docs are the whole site: the intro page is served at "/".
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    mermaid: {
      theme: { light: 'neutral', dark: 'dark' },
      options: {
        // Draw labels as SVG <text> instead of HTML inside <foreignObject>. HTML labels
        // are sized from the font measured when the diagram is drawn, so a different
        // font or the site's global line-height can make the text overflow its box, and
        // the box then clips it. SVG text is measured from the glyphs actually used, so
        // each box grows to fit its label.
        htmlLabels: false,
        // A wider wrap width keeps long paths such as /api/cards/:id/reviews on one line.
        flowchart: { htmlLabels: false, wrappingWidth: 300 },
        // Use one font stack everywhere, so the measurements match what the reader sees.
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontSize: 15,
      },
    },
    navbar: {
      title: 'Study Orbit Server',
      items: [
        { type: 'docSidebar', sidebarId: 'docsSidebar', position: 'left', label: 'Docs' },
        { to: '/api/overview', label: 'API', position: 'left' },
        { to: '/architecture/overview', label: 'Architecture', position: 'left' },
        { to: '/reference/errors', label: 'Errors', position: 'left' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Start here',
          items: [
            { label: 'Setup', to: '/getting-started/setup' },
            { label: 'API reference', to: '/api/overview' },
          ],
        },
        {
          title: 'Design',
          items: [
            { label: 'Data model', to: '/architecture/data-model' },
            { label: 'Scheduling (SM-2)', to: '/architecture/scheduling' },
          ],
        },
      ],
      copyright: `Study Orbit server documentation. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
