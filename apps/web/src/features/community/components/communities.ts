export interface CommunityItem {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  type: 'public' | 'private';
  category: string;
  isJoined: boolean;
  recentActivity: string;
  image?: string;
}

export const communities: CommunityItem[] = [
  {
    id: '1',
    name: 'Remembering Our Veterans',
    description: 'A space to honor and share stories of military veterans and their service to our country.',
    memberCount: 342,
    type: 'public',
    category: 'Memorial',
    isJoined: true,
    recentActivity: '2 hours ago',
    image: '🎖️'
  },
  {
    id: '2',
    name: 'Celebrating Teachers',
    description: 'Share stories about educators who made a difference in your life or the lives of others.',
    memberCount: 189,
    type: 'public',
    category: 'Tribute',
    isJoined: true,
    recentActivity: '4 hours ago',
    image: '📚'
  },
  {
    id: '3',
    name: 'Grief Support Circle',
    description: 'A private, compassionate space for those navigating loss. Share your journey and find comfort.',
    memberCount: 127,
    type: 'private',
    category: 'Support',
    isJoined: true,
    recentActivity: '1 hour ago',
    image: '🕊️'
  },
  {
    id: '4',
    name: 'Retirement Stories',
    description: 'Celebrate career milestones and share wisdom from decades of professional experience.',
    memberCount: 256,
    type: 'public',
    category: 'Celebration',
    isJoined: false,
    recentActivity: '5 hours ago',
    image: '🎉'
  },
  {
    id: '5',
    name: 'Preserving Family History',
    description: 'Tips, tools, and stories for documenting your family legacy for future generations.',
    memberCount: 423,
    type: 'public',
    category: 'Learning',
    isJoined: false,
    recentActivity: '3 hours ago',
    image: '👨‍👩‍👧‍👦'
  },
  {
    id: '6',
    name: 'Cancer Warriors Memorial',
    description: 'Private community honoring those who fought cancer. Share memories and support each other.',
    memberCount: 94,
    type: 'private',
    category: 'Support',
    isJoined: false,
    recentActivity: '6 hours ago',
    image: '💜'
  },
  {
    id: '7',
    name: 'Grandparent Stories',
    description: 'Share the wisdom, humor, and love of grandparents—the keepers of family traditions.',
    memberCount: 512,
    type: 'public',
    category: 'Memorial',
    isJoined: true,
    recentActivity: '30 minutes ago',
    image: '👴'
  },
  {
    id: '8',
    name: 'First Responders Tribute',
    description: 'Honoring police officers, firefighters, EMTs, and all who serve their communities.',
    memberCount: 276,
    type: 'public',
    category: 'Tribute',
    isJoined: false,
    recentActivity: '2 hours ago',
    image: '🚒'
  }
];
