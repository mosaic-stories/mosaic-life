import type { LucideIcon } from 'lucide-react';
import {
  BookHeart,
  Edit3,
  Camera,
  Bot,
  Sparkles,
  Users,
  Plus,
} from 'lucide-react';

export interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  details: string[];
  color: string;
}

export interface Step {
  number: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface UseCase {
  title: string;
  description: string;
  icon: string;
}

export interface AgentCapability {
  title: string;
  description: string;
}

export interface AgentBestUse {
  text: string;
}

export interface AgentDetail {
  id: string;
  icon: LucideIcon;
  title: string;
  badge: string;
  badgeClasses: string;
  headerGradient: string;
  iconBgClass: string;
  description: string;
  whatItDoes: string;
  numberBgClass: string;
  numberTextClass: string;
  checkColorClass: string;
  arrowColorClass: string;
  capabilities: AgentCapability[];
  bestUsedFor: AgentBestUse[];
  callout?: {
    bgClass: string;
    borderClass: string;
    textClass: string;
    label: string;
    text: string;
  };
}

export interface PersonaDetail {
  id: string;
  emoji: string;
  title: string;
  badge: string;
  badgeClasses: string;
  headerGradient: string;
  headerBorderClass: string;
  iconBgClass: string;
  tagline: string;
  personality: string;
  checkColorClass: string;
  bestFor: string[];
  callout: {
    bgClass: string;
    borderClass: string;
    textClass: string;
    label: string;
    text: string;
  };
  conversationStyle: string;
  extraNote?: {
    bgClass: string;
    borderClass: string;
    textClass: string;
    text: string;
  };
}

export interface CommunityGuideline {
  icon: LucideIcon;
  iconColorClass: string;
  title: string;
  description: string;
}

export interface ExampleCommunity {
  emoji: string;
  title: string;
  description: string;
  visibility: 'public' | 'private';
  members: number;
}

export const features: Feature[] = [
  {
    icon: BookHeart,
    title: 'Legacy Profiles',
    description:
      'Create a beautiful, organized space to honor someone special',
    details: [
      'Personalized profile with photo, bio, and key life details',
      'Organized into three main sections: Stories, Media, and AI Interactions',
      'Customizable privacy settings - public, private, or invite-only',
      'Timeline view showing stories chronologically',
      'Tribute counter showing total contributions from community',
    ],
    color: 'text-amber-600',
  },
  {
    icon: Edit3,
    title: 'Story Creation',
    description:
      'Write and preserve meaningful memories with AI assistance',
    details: [
      'Rich text editor with formatting options',
      "Inline AI assistant to help overcome writer's block",
      'Suggested prompts to spark deeper memories',
      'Add context (era, location, relationships) to stories',
      'Draft saving - work on stories over multiple sessions',
      'Attach photos and media directly to stories',
    ],
    color: 'text-blue-600',
  },
  {
    icon: Camera,
    title: 'Media Gallery',
    description:
      'Organize and display photos, videos, and documents',
    details: [
      'Upload unlimited photos and videos',
      'Automatic organization by date and event',
      'Add captions and context to each item',
      'Create albums for specific life periods or events',
      'Slideshow and grid views',
      'Download originals anytime',
    ],
    color: 'text-purple-600',
  },
  {
    icon: Bot,
    title: 'AI Story Assistant (Chat Mode)',
    description:
      'Conversational AI that helps you remember and articulate stories',
    details: [
      'Natural conversation interface for brainstorming',
      'Asks thoughtful follow-up questions',
      'Helps organize scattered memories into coherent stories',
      'Suggests connections between different memories',
      'Can help with writing tone and structure',
      'Export chat to story draft with one click',
    ],
    color: 'text-emerald-600',
  },
  {
    icon: Sparkles,
    title: 'AI Agent Panel',
    description:
      'Dedicated workspace for AI-enhanced story development',
    details: [
      'Split-screen view: story editor + AI suggestions',
      'Real-time writing assistance and refinements',
      'Memory prompts based on Legacy context',
      'Tone adjustment (formal, casual, emotional)',
      'Grammar and clarity improvements',
      'Generates story titles and summaries',
    ],
    color: 'text-rose-600',
  },
  {
    icon: Users,
    title: 'Collaborative Contributions',
    description:
      'Invite others to add their perspectives and memories',
    details: [
      'Send invitations via email or shareable link',
      'Contributors can add stories, photos, and comments',
      'Activity feed shows recent contributions',
      'Moderate submissions before they go live (optional)',
      'Thank contributors with personalized messages',
      'See who contributed what with attribution',
    ],
    color: 'text-indigo-600',
  },
];

export const steps: Step[] = [
  {
    number: '1',
    title: 'Create a Legacy',
    description:
      'Start by creating a profile for the person you want to honor. Add their photo, basic information, and set privacy preferences.',
    icon: Plus,
  },
  {
    number: '2',
    title: 'Add Stories & Media',
    description:
      'Write your first story using our editor, or upload photos and videos. Use AI assistance if you need help getting started.',
    icon: Edit3,
  },
  {
    number: '3',
    title: 'Invite Contributors',
    description:
      'Share the Legacy with family, friends, and colleagues who knew this person. Each perspective adds depth to the story.',
    icon: Users,
  },
  {
    number: '4',
    title: 'Watch It Grow',
    description:
      'As more people contribute their memories and photos, the Legacy becomes a rich, multi-faceted portrait of a life well-lived.',
    icon: Sparkles,
  },
];

export const useCases: UseCase[] = [
  {
    title: 'Memorial Tributes',
    description:
      'Honor someone who has passed by gathering memories from everyone who knew them.',
    icon: '\u{1F54A}\uFE0F',
  },
  {
    title: 'Retirement Celebrations',
    description:
      'Celebrate a career by collecting stories from colleagues, mentors, and mentees.',
    icon: '\u{1F389}',
  },
  {
    title: 'Living Tributes',
    description:
      'Create a legacy while someone is still with us - perfect for milestone birthdays or anniversaries.',
    icon: '\u{1F49D}',
  },
  {
    title: 'Graduation Honors',
    description:
      'Mark educational achievements with memories from teachers, classmates, and family.',
    icon: '\u{1F393}',
  },
  {
    title: 'Dementia Care',
    description:
      'Preserve memories before they fade, creating a resource for reminiscence therapy.',
    icon: '\u{1F9E0}',
  },
  {
    title: 'Family History',
    description:
      'Document family stories and wisdom to pass down through generations.',
    icon: '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}',
  },
];

export const agentDetails: AgentDetail[] = [
  {
    id: 'inline',
    icon: Sparkles,
    title: 'Inline AI Assistant',
    badge: 'Quick Help',
    badgeClasses: 'bg-blue-100 text-blue-700 border-blue-200',
    headerGradient: 'bg-gradient-to-r from-blue-50 to-cyan-50',
    iconBgClass: 'bg-blue-500',
    description:
      'Your on-demand writing companion that appears right in the story editor when you need it',
    whatItDoes:
      "The Inline AI Assistant is perfect for quick help while you're actively writing. It's always just one click away, appearing as a small popup that won't interrupt your flow. Think of it as having a helpful friend looking over your shoulder, ready to jump in when you get stuck.",
    numberBgClass: 'bg-blue-100',
    numberTextClass: 'text-blue-600',
    checkColorClass: 'text-blue-500',
    arrowColorClass: 'text-blue-500',
    capabilities: [
      {
        title: "Overcome Writer's Block",
        description:
          'Get suggestions when you\'re stuck on how to start or continue',
      },
      {
        title: 'Expand Your Ideas',
        description: 'Turn a brief sentence into a fuller paragraph',
      },
      {
        title: 'Improve Clarity',
        description: 'Refine sentences for better readability and flow',
      },
      {
        title: 'Add Descriptive Details',
        description: 'Enhance stories with sensory details and emotion',
      },
    ],
    bestUsedFor: [
      { text: 'Quick edits and improvements while actively writing' },
      {
        text: "Getting unstuck when you know what you want to say but can't find the words",
      },
      { text: 'Polishing specific sentences or paragraphs' },
    ],
  },
  {
    id: 'chat',
    icon: Sparkles, // placeholder - overridden in component with MessageSquare
    title: 'AI Story Assistant (Chat Mode)',
    badge: 'Conversational',
    badgeClasses: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    headerGradient: 'bg-gradient-to-r from-emerald-50 to-teal-50',
    iconBgClass: 'bg-emerald-500',
    description:
      'A thoughtful conversational partner that helps you explore memories and develop story ideas',
    whatItDoes:
      'The Chat Mode AI opens in a dedicated interface where you can have a natural conversation about memories and stories. It asks thoughtful questions, helps you remember forgotten details, and guides you through the process of developing a coherent narrative. It\'s like talking to an empathetic interviewer who\'s genuinely interested in the story you\'re trying to tell.',
    numberBgClass: 'bg-emerald-100',
    numberTextClass: 'text-emerald-600',
    checkColorClass: 'text-emerald-500',
    arrowColorClass: 'text-emerald-500',
    capabilities: [
      {
        title: 'Memory Prompting',
        description:
          'Ask questions that unlock forgotten memories and details',
      },
      {
        title: 'Story Structure Guidance',
        description:
          'Help organize scattered thoughts into coherent narratives',
      },
      {
        title: 'Contextual Follow-ups',
        description:
          "Ask deeper questions based on what you've shared",
      },
      {
        title: 'Brainstorming Partner',
        description:
          'Explore different angles and perspectives on a memory',
      },
      {
        title: 'Connection Finding',
        description:
          'Identify themes and connections between different stories',
      },
      {
        title: 'Export to Draft',
        description:
          'Convert your conversation into a story draft with one click',
      },
    ],
    bestUsedFor: [
      {
        text: "Starting from scratch when you have a general memory but aren't sure how to tell it",
      },
      {
        text: 'Exploring multiple story ideas to see which one resonates most',
      },
      {
        text: "Getting help remembering details you've partially forgotten",
      },
      {
        text: 'Working through emotional stories that are difficult to articulate',
      },
    ],
    callout: {
      bgClass: 'bg-emerald-50',
      borderClass: 'border-emerald-100',
      textClass: 'text-emerald-900',
      label: 'Example:',
      text: '"I remember my grandmother\'s kitchen, but I\'m not sure how to describe it..." The AI might respond: "Let\'s explore that memory together. What\'s the first thing that comes to mind when you picture her kitchen? Was it the smell, the sounds, or something visual?"',
    },
  },
  {
    id: 'panel',
    icon: Bot,
    title: 'AI Agent Panel',
    badge: 'Advanced',
    badgeClasses: 'bg-purple-100 text-purple-700 border-purple-200',
    headerGradient: 'bg-gradient-to-r from-purple-50 to-fuchsia-50',
    iconBgClass: 'bg-purple-500',
    description:
      'A powerful split-screen workspace with real-time AI suggestions and story enhancement tools',
    whatItDoes:
      "The AI Agent Panel gives you a dedicated workspace with your story editor on one side and an intelligent AI panel on the other. Unlike the quick-help inline assistant, this is a full-featured environment for serious story development. It analyzes your entire story in real-time and provides contextual suggestions, refinements, and enhancements. Perfect for when you want to craft something truly polished.",
    numberBgClass: 'bg-purple-100',
    numberTextClass: 'text-purple-600',
    checkColorClass: 'text-purple-500',
    arrowColorClass: 'text-purple-500',
    capabilities: [
      {
        title: 'Real-Time Analysis',
        description:
          'Continuous feedback as you write with live suggestions',
      },
      {
        title: 'Tone Adjustment',
        description:
          'Shift between formal, casual, emotional, or celebratory tones',
      },
      {
        title: 'Story Enhancement',
        description:
          'Suggestions for adding depth, emotion, and descriptive details',
      },
      {
        title: 'Legacy Context Awareness',
        description:
          'Uses knowledge of the person to suggest relevant prompts',
      },
      {
        title: 'Grammar & Clarity',
        description:
          'Professional-level editing for polish and readability',
      },
      {
        title: 'Title & Summary Generation',
        description:
          'Auto-generate compelling titles and story summaries',
      },
      {
        title: 'Memory Prompts',
        description:
          'Contextual questions to help you remember more details',
      },
      {
        title: 'Multiple Variations',
        description:
          'Generate alternative phrasings to choose the best version',
      },
    ],
    bestUsedFor: [
      {
        text: 'Crafting longer, more detailed stories that deserve extra attention',
      },
      {
        text: 'Refining and polishing important stories (eulogies, keynote tributes, etc.)',
      },
      {
        text: "When you want professional-quality writing but aren't a professional writer",
      },
      {
        text: 'Transforming rough drafts into polished, emotional narratives',
      },
    ],
    callout: {
      bgClass: 'bg-purple-50',
      borderClass: 'border-purple-100',
      textClass: 'text-purple-900',
      label: 'Pro Tip:',
      text: 'Start your story in the regular editor, then switch to the AI Agent Panel when you\'re ready to refine. The split-screen view lets you see suggestions without losing sight of your original work.',
    },
  },
];

export const personaDetails: PersonaDetail[] = [
  {
    id: 'reporter',
    emoji: '\u{1F4F0}',
    title: 'The Reporter',
    badge: 'Investigative',
    badgeClasses: 'bg-amber-100 text-amber-700 border-amber-200',
    headerGradient: 'bg-gradient-to-br from-amber-50 to-orange-50',
    headerBorderClass: 'border-amber-100',
    iconBgClass: 'bg-amber-500',
    tagline: '"Let\'s get the facts straight and uncover the full story"',
    personality:
      'The Reporter is direct, curious, and thorough. This persona asks probing questions to gather comprehensive details about events, timelines, and facts. It\'s methodical and systematic, ensuring no important detail is overlooked.',
    checkColorClass: 'text-amber-500',
    bestFor: [
      'Documenting historical events or significant life milestones',
      'Career retrospectives and professional achievements',
      'When accuracy and chronological order matter most',
      'Capturing the "who, what, when, where, why" of a story',
    ],
    callout: {
      bgClass: 'bg-amber-50',
      borderClass: 'border-amber-100',
      textClass: 'text-amber-900',
      label: 'Example Questions:',
      text: '"Can you walk me through exactly what happened that day?" \u2022 "Who else was present?" \u2022 "What year was this?" \u2022 "What led up to this moment?"',
    },
    conversationStyle:
      'Structured \u2022 Fact-focused \u2022 Detail-oriented \u2022 Chronological \u2022 Professional',
  },
  {
    id: 'biographer',
    emoji: '\u{1F4D6}',
    title: 'The Biographer',
    badge: 'Narrative',
    badgeClasses: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    headerGradient: 'bg-gradient-to-br from-indigo-50 to-blue-50',
    headerBorderClass: 'border-indigo-100',
    iconBgClass: 'bg-indigo-500',
    tagline: '"Every life tells a story\u2014let\'s craft yours beautifully"',
    personality:
      'The Biographer is thoughtful, literary, and narrative-focused. This persona helps you see the bigger picture\u2014how individual moments connect to form a life\'s journey. It\'s interested in themes, patterns, and the deeper meaning behind events.',
    checkColorClass: 'text-indigo-500',
    bestFor: [
      'Creating comprehensive life stories with narrative arc',
      "Identifying themes and patterns across someone's life",
      "Memorial tributes that capture someone's essence",
      'When you want polished, literary-quality storytelling',
    ],
    callout: {
      bgClass: 'bg-indigo-50',
      borderClass: 'border-indigo-100',
      textClass: 'text-indigo-900',
      label: 'Example Questions:',
      text: '"What values defined their life?" \u2022 "How did this experience shape who they became?" \u2022 "What would you say was the central theme of their story?" \u2022 "How does this connect to other moments in their life?"',
    },
    conversationStyle:
      'Reflective \u2022 Thematic \u2022 Big-picture \u2022 Literary \u2022 Meaningful',
  },
  {
    id: 'friend',
    emoji: '\u{1F4AC}',
    title: 'The Friend',
    badge: 'Empathetic',
    badgeClasses: 'bg-rose-100 text-rose-700 border-rose-200',
    headerGradient: 'bg-gradient-to-br from-rose-50 to-pink-50',
    headerBorderClass: 'border-rose-100',
    iconBgClass: 'bg-rose-500',
    tagline: '"I\'m here to listen\u2014tell me what\'s in your heart"',
    personality:
      'The Friend is warm, empathetic, and emotionally intelligent. This persona creates a safe, comfortable space for sharing memories\u2014especially emotional or difficult ones. It validates feelings and encourages authentic expression without judgment.',
    checkColorClass: 'text-rose-500',
    bestFor: [
      'Processing grief and loss through storytelling',
      'Sharing deeply personal or emotional memories',
      'When you need encouragement and emotional support',
      'Exploring feelings and relationships, not just events',
    ],
    callout: {
      bgClass: 'bg-rose-50',
      borderClass: 'border-rose-100',
      textClass: 'text-rose-900',
      label: 'Example Questions:',
      text: '"How did that make you feel?" \u2022 "That sounds really meaningful\u2014tell me more." \u2022 "What do you miss most about them?" \u2022 "It\'s okay to take your time with this. What comes to mind when you think about...?"',
    },
    conversationStyle:
      'Warm \u2022 Supportive \u2022 Emotionally attuned \u2022 Gentle \u2022 Non-judgmental',
  },
  {
    id: 'digital-twin',
    emoji: '\u{1F916}',
    title: 'The Digital Twin',
    badge: 'Immersive',
    badgeClasses: 'bg-violet-100 text-violet-700 border-violet-200',
    headerGradient: 'bg-gradient-to-br from-violet-50 to-purple-50',
    headerBorderClass: 'border-violet-100',
    iconBgClass: 'bg-violet-500',
    tagline:
      '"Let me help you imagine their voice, perspective, and wisdom"',
    personality:
      'The Digital Twin is unique\u2014it helps you explore how the person being honored might have thought, spoken, or responded to situations. Based on all the stories and information in the Legacy, it creates an immersive way to keep their voice and perspective alive.',
    checkColorClass: 'text-violet-500',
    bestFor: [
      "Preserving someone's unique voice and mannerisms",
      'Exploring "What would they say about this?"',
      'Dementia care and memory preservation',
      'Creating an interactive legacy for future generations',
    ],
    callout: {
      bgClass: 'bg-violet-50',
      borderClass: 'border-violet-100',
      textClass: 'text-violet-900',
      label: 'Example Interactions:',
      text: '"Based on everything you\'ve shared, here\'s how I think they might have told this story..." \u2022 "They often said things like..." \u2022 "If they were here now, they might say..." \u2022 "Let me share a memory the way they would have told it."',
    },
    conversationStyle:
      'Immersive \u2022 Voice-preserving \u2022 Perspective-taking \u2022 Interactive \u2022 Legacy-extending',
    extraNote: {
      bgClass: 'bg-violet-100',
      borderClass: 'border-violet-200',
      textClass: 'text-violet-900',
      text: 'The Digital Twin becomes more accurate and authentic as more stories and details are added to the Legacy. It learns from all contributions to better capture the person\'s unique essence.',
    },
  },
];

export const exampleCommunities: ExampleCommunity[] = [
  {
    emoji: '\u{1F396}\uFE0F',
    title: 'Remembering Our Veterans',
    description:
      'A space to honor and share stories of military veterans and their service.',
    visibility: 'public',
    members: 342,
  },
  {
    emoji: '\u{1F54A}\uFE0F',
    title: 'Grief Support Circle',
    description:
      'A private, compassionate space for those navigating loss. Share your journey and find comfort.',
    visibility: 'private',
    members: 127,
  },
  {
    emoji: '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}',
    title: 'Preserving Family History',
    description:
      'Tips, tools, and stories for documenting your family legacy for future generations.',
    visibility: 'public',
    members: 423,
  },
];
