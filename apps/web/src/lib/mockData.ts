export interface Legacy {
  id: string;
  name: string;
  tagline: string;
  dates: string;
  context: 'memorial' | 'retirement' | 'graduation' | 'living-tribute';
  imageUrl: string;
  profileImage?: string; // Alias for imageUrl used by some components
  storyCount: number;
  photoCount: number;
  contributorCount: number;
  preview: string;
  stories?: Story[];
  media?: MediaItem[];
  contributors?: { id: string; name: string; avatar?: string }[];
}

export interface Story {
  id: string;
  title: string;
  content: string;
  author: string;
  date: string;
  mediaUrl?: string;
  category?: string;
}

export interface MediaItem {
  id: string;
  url: string;
  caption?: string;
  date?: string;
  type: 'photo' | 'video';
}

export interface AIAgent {
  id: string;
  name: string;
  role: string;
  description: string;
  icon: string;
}

export const legacies: Legacy[] = [
  {
    id: '1',
    name: 'Margaret Chen',
    tagline: 'A loving grandmother who taught us the meaning of resilience',
    dates: '1942 - 2024',
    context: 'memorial',
    imageUrl: 'https://images.unsplash.com/photo-1758686254563-5c5ab338c8b9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbGRlcmx5JTIwd29tYW4lMjBzbWlsaW5nJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzYzNzM5MjMzfDA&ixlib=rb-4.1.0&q=80&w=1080',
    profileImage: 'https://images.unsplash.com/photo-1758686254563-5c5ab338c8b9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbGRlcmx5JTIwd29tYW4lMjBzbWlsaW5nJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzYzNzM5MjMzfDA&ixlib=rb-4.1.0&q=80&w=1080',
    storyCount: 24,
    photoCount: 156,
    contributorCount: 12,
    preview: 'Grandma always said that the secret to happiness was finding joy in the small things. Every Sunday morning, she would wake up at 5am to prepare her famous dumplings...',
    stories: [],
    media: [],
    contributors: [{ id: '1', name: 'Jennifer Chen' }, { id: '2', name: 'Michael Chen' }]
  },
  {
    id: '2',
    name: 'Robert "Coach" Martinez',
    tagline: '40 years of inspiring young minds',
    dates: 'Retired June 2024',
    context: 'retirement',
    imageUrl: 'https://images.unsplash.com/photo-1758686254535-6dcf0990c5b4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyZXRpcmVtZW50JTIwY2VsZWJyYXRpb258ZW58MXx8fHwxNzYzODYxNzczfDA&ixlib=rb-4.1.0&q=80&w=1080',
    profileImage: 'https://images.unsplash.com/photo-1758686254535-6dcf0990c5b4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyZXRpcmVtZW50JTIwY2VsZWJyYXRpb258ZW58MXx8fHwxNzYzODYxNzczfDA&ixlib=rb-4.1.0&q=80&w=1080',
    storyCount: 31,
    photoCount: 89,
    contributorCount: 47,
    preview: "Coach Martinez didn't just teach history - he made us live it. I'll never forget the day he turned our classroom into a constitutional convention...",
    stories: [],
    media: [],
    contributors: []
  },
  {
    id: '3',
    name: 'Sofia Rodriguez',
    tagline: 'First in her family to graduate college',
    dates: 'Class of 2024',
    context: 'graduation',
    imageUrl: 'https://images.unsplash.com/photo-1653250198948-1405af521dbb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxncmFkdWF0aW9uJTIwY2FwJTIwY2VsZWJyYXRpb258ZW58MXx8fHwxNzYzODYxNzczfDA&ixlib=rb-4.1.0&q=80&w=1080',
    profileImage: 'https://images.unsplash.com/photo-1653250198948-1405af521dbb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxncmFkdWF0aW9uJTIwY2FwJTIwY2VsZWJyYXRpb258ZW58MXx8fHwxNzYzODYxNzczfDA&ixlib=rb-4.1.0&q=80&w=1080',
    storyCount: 8,
    photoCount: 34,
    contributorCount: 5,
    preview: "When Sofia walked across that stage, she wasn't just receiving a diploma - she was opening a door for her entire family. Her journey from working two jobs to Dean's List...",
    stories: [],
    media: [],
    contributors: []
  },
  {
    id: '4',
    name: 'James Wilson',
    tagline: 'Living his life with courage and humor',
    dates: 'Living Tribute',
    context: 'living-tribute',
    imageUrl: 'https://images.unsplash.com/photo-1669142900596-85b198cb80d8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbGRlcmx5JTIwbWFuJTIwZ3JhbmRmYXRoZXJ8ZW58MXx8fHwxNzYzODYxNzc1fDA&ixlib=rb-4.1.0&q=80&w=1080',
    profileImage: 'https://images.unsplash.com/photo-1669142900596-85b198cb80d8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbGRlcmx5JTIwbWFuJTIwZ3JhbmRmYXRoZXJ8ZW58MXx8fHwxNzYzODYxNzc1fDA&ixlib=rb-4.1.0&q=80&w=1080',
    storyCount: 16,
    photoCount: 67,
    contributorCount: 8,
    preview: "Even as memories fade, Dad's spirit shines bright. This morning he told me the story of how he met Mom for the 'first time' again, and it was just as magical...",
    stories: [],
    media: [],
    contributors: []
  }
];

export const stories: Story[] = [
  {
    id: '1',
    title: 'Sunday Morning Dumplings',
    content: 'Grandma always said that the secret to happiness was finding joy in the small things. Every Sunday morning, she would wake up at 5am to prepare her famous dumplings. The sound of her rolling pin on the marble counter was our alarm clock. She taught each of us how to fold them, patient with our clumsy attempts, laughing when the filling spilled out. "Perfect is boring," she would say. Those mornings were pure magic.',
    author: 'Jennifer Chen',
    date: 'November 15, 2024'
  },
  {
    id: '2',
    title: 'The Garden Wisdom',
    content: 'I learned more about life from working in Grandma\'s garden than I did in any classroom. She treated each plant like a child - firm when needed, nurturing always. "You can\'t rush growth," she would remind me when I was impatient. "Everything happens in its own time." Watching her tend to those tomatoes taught me patience, persistence, and the power of daily care.',
    author: 'Michael Chen',
    date: 'November 10, 2024',
    mediaUrl: 'https://images.unsplash.com/photo-1645075409459-e271a8dd7689?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmYW1pbHklMjBtZW1vcmllcyUyMHBob3Rvc3xlbnwxfHx8fDE3NjM4NjE3NzR8MA&ixlib=rb-4.1.0&q=80&w=1080'
  },
  {
    id: '3',
    title: 'The Letter She Left',
    content: 'After she passed, we found a box in her closet. Inside were letters - one for each of us, written years ago but never sent. Mine began: "My dearest Jennifer, if you\'re reading this, I\'m dancing with your grandfather now. Don\'t be sad - be curious. The world is full of wonder if you look closely." I keep it in my wallet and read it whenever I need courage.',
    author: 'Jennifer Chen',
    date: 'November 5, 2024'
  }
];

export const mediaItems: MediaItem[] = [
  {
    id: '1',
    url: 'https://images.unsplash.com/photo-1758686254563-5c5ab338c8b9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbGRlcmx5JTIwd29tYW4lMjBzbWlsaW5nJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzYzNzM5MjMzfDA&ixlib=rb-4.1.0&q=80&w=1080',
    caption: 'Grandma in her garden, 2018',
    date: 'Summer 2018',
    type: 'photo'
  },
  {
    id: '2',
    url: 'https://images.unsplash.com/photo-1645075409459-e271a8dd7689?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmYW1pbHklMjBtZW1vcmllcyUyMHBob3Rvc3xlbnwxfHx8fDE3NjM4NjE3NzR8MA&ixlib=rb-4.1.0&q=80&w=1080',
    caption: 'Family reunion, 2015',
    date: 'July 2015',
    type: 'photo'
  },
  {
    id: '3',
    url: 'https://images.unsplash.com/photo-1758686254535-6dcf0990c5b4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyZXRpcmVtZW50JTIwY2VsZWJyYXRpb258ZW58MXx8fHwxNzYzODYxNzczfDA&ixlib=rb-4.1.0&q=80&w=1080',
    caption: 'Sunday morning preparations',
    date: 'December 2019',
    type: 'photo'
  },
  {
    id: '4',
    url: 'https://images.unsplash.com/photo-1653250198948-1405af521dbb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxncmFkdWF0aW9uJTIwY2FwJTIwY2VsZWJyYXRpb258ZW58MXx8fHwxNzYzODYxNzczfDA&ixlib=rb-4.1.0&q=80&w=1080',
    caption: 'Celebrating her 80th birthday',
    date: 'March 2022',
    type: 'photo'
  }
];

export const aiAgents: AIAgent[] = [
  {
    id: 'biographer',
    name: 'The Biographer',
    role: 'Life Story Curator',
    description: 'Helps organize and connect stories into a cohesive narrative, identifying themes and suggesting gaps to fill',
    icon: 'BookOpen'
  },
  {
    id: 'reporter',
    name: 'The Reporter',
    role: 'Detail Hunter',
    description: 'Asks probing questions to uncover rich details and specific memories that bring stories to life',
    icon: 'Search'
  },
  {
    id: 'friend',
    name: 'The Friend',
    role: 'Empathetic Listener',
    description: 'Provides emotional support and helps you process feelings while sharing memories',
    icon: 'Heart'
  },
  {
    id: 'twin',
    name: 'Digital Twin',
    role: 'Voice Keeper',
    description: 'Learns speech patterns and perspectives to help answer "What would they say about this?"',
    icon: 'Users'
  }
];
