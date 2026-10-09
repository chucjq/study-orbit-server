import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting started',
      collapsed: false,
      items: ['getting-started/setup'],
    },
    {
      type: 'category',
      label: 'Architecture',
      items: [
        'architecture/overview',
        'architecture/data-model',
        'architecture/scheduling',
        'architecture/study-queue',
      ],
    },
    {
      type: 'category',
      label: 'API reference',
      items: [
        'api/overview',
        'api/subjects',
        'api/decks',
        'api/cards',
        'api/reviews',
        'api/study',
        'api/sessions',
        'api/stats',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      items: ['guides/review-walkthrough', 'guides/seeding', 'guides/testing'],
    },
    {
      type: 'category',
      label: 'Reference',
      items: ['reference/errors', 'reference/decisions', 'reference/limitations', 'reference/glossary'],
    },
  ],
};

export default sidebars;
