import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse, delay } from 'msw';
import RecentlyViewedSection from './RecentlyViewedSection';
import type { EnrichedRecentItemsResponse } from '../api/activity';

const meta: Meta<typeof RecentlyViewedSection> = {
  title: 'Features/Activity/RecentlyViewedSection',
  component: RecentlyViewedSection,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const legacyItems: EnrichedRecentItemsResponse = {
  items: [
    {
      entity_type: 'legacy',
      entity_id: 'legacy-001',
      last_action: 'viewed',
      last_activity_at: '2026-03-12T10:00:00Z',
      metadata: null,
      entity: {
        name: 'Eleanor Roosevelt',
        biography:
          'First Lady of the United States, diplomat, and activist who championed human rights worldwide.',
        profile_image_url: null,
        birth_date: '1884-10-11',
        death_date: '1962-11-07',
      },
    },
    {
      entity_type: 'legacy',
      entity_id: 'legacy-002',
      last_action: 'viewed',
      last_activity_at: '2026-03-11T15:30:00Z',
      metadata: null,
      entity: {
        name: 'Marcus Chen',
        biography:
          'Beloved grandfather and retired teacher who inspired generations of students in Oakland.',
        profile_image_url: null,
        birth_date: '1940-06-15',
        death_date: '2024-01-20',
      },
    },
    {
      entity_type: 'legacy',
      entity_id: 'legacy-003',
      last_action: 'viewed',
      last_activity_at: '2026-03-10T09:15:00Z',
      metadata: null,
      entity: {
        name: 'Sofia Alvarez',
        biography:
          'Dedicated community organizer and mother of four who built bridges across cultures.',
        profile_image_url: null,
        birth_date: '1955-03-22',
        death_date: null,
      },
    },
    {
      entity_type: 'legacy',
      entity_id: 'legacy-004',
      last_action: 'viewed',
      last_activity_at: '2026-03-09T18:45:00Z',
      metadata: null,
      entity: {
        name: 'James Whitfield',
        biography: null,
        profile_image_url: null,
        birth_date: '1932-12-01',
        death_date: '2020-07-14',
      },
    },
  ],
  tracking_enabled: true,
};

const storyItems: EnrichedRecentItemsResponse = {
  items: [
    {
      entity_type: 'story',
      entity_id: 'story-001',
      last_action: 'viewed',
      last_activity_at: '2026-03-12T11:00:00Z',
      metadata: null,
      entity: {
        title: 'The Summer of 1967',
        content_preview:
          'That summer changed everything. We packed up the old station wagon and drove cross-country, stopping at every roadside attraction we could find.',
        author_name: 'Sarah Chen',
        author_username: 'sarah-chen',
        legacy_id: 'legacy-002',
        legacy_name: 'Marcus Chen',
      },
    },
    {
      entity_type: 'story',
      entity_id: 'story-002',
      last_action: 'viewed',
      last_activity_at: '2026-03-11T14:20:00Z',
      metadata: null,
      entity: {
        title: 'Her Favorite Recipe',
        content_preview:
          'Every Sunday morning, abuela would wake up before dawn to start the tamales. The whole house would smell of corn husks and chili.',
        author_name: 'Diego Alvarez',
        author_username: 'diego-alvarez',
        legacy_id: 'legacy-003',
        legacy_name: 'Sofia Alvarez',
      },
    },
    {
      entity_type: 'story',
      entity_id: 'story-003',
      last_action: 'viewed',
      last_activity_at: '2026-03-10T08:00:00Z',
      metadata: null,
      entity: {
        title: 'Letters from the Front',
        content_preview:
          'We found a box of letters in the attic, carefully tied with a faded blue ribbon. Each one began the same way: "My dearest Eleanor..."',
        author_name: 'Thomas Roosevelt',
        author_username: 'thomas-roosevelt',
        legacy_id: 'legacy-001',
        legacy_name: 'Eleanor Roosevelt',
      },
    },
    {
      entity_type: 'story',
      entity_id: 'story-004',
      last_action: 'viewed',
      last_activity_at: '2026-03-09T16:30:00Z',
      metadata: null,
      entity: {
        title: 'The Workshop in the Garage',
        content_preview:
          'Dad spent every weekend in that garage. He could fix anything — toasters, radios, even the neighbor\'s lawnmower.',
        author_name: 'Emily Whitfield',
        author_username: 'emily-whitfield',
        legacy_id: 'legacy-004',
        legacy_name: 'James Whitfield',
      },
    },
  ],
  tracking_enabled: true,
};

export const Legacies: Story = {
  args: {
    entityType: 'legacy',
    title: 'Recently Viewed Legacies',
    description: 'Legacies you have visited recently.',
    limit: 4,
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/activity/recent/enriched', () => {
          return HttpResponse.json(legacyItems);
        }),
      ],
    },
  },
};

export const Stories: Story = {
  args: {
    entityType: 'story',
    title: 'Recently Viewed Stories',
    description: 'Stories you have read recently.',
    limit: 4,
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/activity/recent/enriched', () => {
          return HttpResponse.json(storyItems);
        }),
      ],
    },
  },
};

export const Empty: Story = {
  args: {
    entityType: 'legacy',
    title: 'Recently Viewed Legacies',
    description: 'Legacies you have visited recently.',
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/activity/recent/enriched', () => {
          return HttpResponse.json({
            items: [],
            tracking_enabled: true,
          } satisfies EnrichedRecentItemsResponse);
        }),
      ],
    },
  },
};

export const Loading: Story = {
  args: {
    entityType: 'legacy',
    title: 'Recently Viewed Legacies',
    description: 'Legacies you have visited recently.',
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/activity/recent/enriched', async () => {
          await delay('infinite');
          return new HttpResponse(null);
        }),
      ],
    },
  },
};
