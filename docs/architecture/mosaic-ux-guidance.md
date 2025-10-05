# Mosaic Life - Web Experience Design Guidelines for AI Coding Agents

## Purpose & Context

Mosaic Life is a storytelling platform for capturing and preserving memories about the people who matter in our lives. Born from a desire to honor those we've lost, the platform extends to celebrate anyone—living or passed, distant or present—whose story deserves to be told and remembered.

**Core Mission**: Create a space where stories become living legacies through thoughtful conversation, AI-augmented reflection, and meaningful connections.

---

## 1. Emotional Design Principles

### 1.1 The Weight of Stories

Every design decision must acknowledge that users are sharing deeply personal, often emotional content. The interface should feel:

- **Reverent without being somber**: Respectful of grief while celebrating life
- **Safe and contained**: Clear boundaries that make vulnerability feel protected
- **Present and unhurried**: No artificial urgency; stories unfold at human pace
- **Warm but not overly familiar**: Professional empathy, not false intimacy

### 1.2 Visual Language

**Minimalism with Purpose**
- Use whitespace generously to give stories room to breathe
- Single-column layouts for reading; maximum 65-75 characters line length
- Avoid visual clutter that competes with emotional content
- Let imagery and words be the focal points, not UI chrome

**Color Palette Philosophy**
- Neutral foundations: warm grays, soft whites, deep charcoals
- Accent colors should be calming: muted blues, sage greens, warm earth tones
- Avoid bright, energetic colors that feel inappropriate for grief contexts
- Dark mode should feel contemplative, not stark

**Typography**
- Readable serif font for story content (e.g., Lora, Source Serif, Merriweather)
- Clean sans-serif for UI elements (e.g., Inter, Open Sans, DM Sans)
- Generous line-height (1.6-1.8) for comfortable reading
- Scale hierarchy that guides without shouting: subtle size differences

---

## 2. Core User Experiences

### 2.1 Story Creation Flow

**The Empty Canvas Should Invite, Not Intimidate**

```typescript
// AI Agent Guidance: Story Creation Interface

interface StoryCreationContext {
  // The first question matters most
  initialPrompt: {
    // Instead of "Write your story here..."
    placeholder: "What would you like to share about [person's name]?",
    // Subtle, non-intrusive suggestions
    suggestions: [
      "A favorite memory together",
      "Something they taught you", 
      "A moment that changed everything",
      "What you wish you could tell them"
    ]
  };
  
  // Progressive disclosure: start simple, expand as needed
  mode: "minimal" | "guided" | "conversational";
  
  // Never auto-save without clear indication
  autosave: {
    enabled: true,
    indicator: "visible", // "Saved moments ago" with timestamp
    conflict_handling: "prompt_user" // Never silently overwrite
  };
}

// Implementation requirements:
// 1. Full-height editor that feels spacious, not cramped
// 2. Floating toolbar only appears when text selected
// 3. AI agent trigger is discoverable but unobtrusive
// 4. Story context (who, when, where) collected gently, not demanded
```

**Guided vs. Free-form Balance**
- Default to free-form text entry
- Offer guided prompts as opt-in "Need help getting started?"
- AI agent presence announced clearly: "Would you like a biographer to guide this conversation?"
- Always allow users to dismiss guidance and write freely

### 2.2 AI Agent Interactions

**The Agent is a Companion, Not an Interruption**

```typescript
// AI Agent Guidance: Conversational UI

interface AgentPresence {
  // Visual representation
  avatar: {
    style: "minimal_icon", // Not anthropomorphized
    position: "sidebar" | "inline_with_context",
    size: "subtle" // Never dominates the story content
  };
  
  // Communication style
  tone: {
    persona: "biographer" | "therapist" | "friend" | "mentor" | "comedian",
    voice: "supportive_not_directive",
    timing: "responsive_to_pause", // Not interrupting active writing
    question_style: "open_ended_invitations" // Not interrogative
  };
  
  // Example good questions from biographer:
  good_questions: [
    "What do you remember about how they looked in that moment?",
    "That sounds like it meant a lot to you. What made it so meaningful?",
    "I'm curious about what happened next...",
    "How did that experience shape your relationship?"
  ];
  
  // Avoid:
  avoid: [
    "What specific date was this?", // Too clinical
    "You should include more details.", // Prescriptive
    "That's interesting, but..." // Dismissive
  ];
}

// Implementation requirements:
// 1. Agent messages appear as gentle suggestions, clearly differentiated from user's story
// 2. Easy to ignore or dismiss without guilt ("Maybe later" option)
// 3. Streaming responses that feel conversational, not robotic
// 4. Clear attribution: never confuse agent words with user's voice
// 5. Agent can be silenced/removed from conversation at any time
```

**Multi-Agent Orchestration**
- Only one agent "speaks" at a time
- User controls which agent is active
- Agents can suggest "Would it help to talk to [other persona]?"
- Transitions between agents are explicit, never surprising

### 2.3 Story Review & Reflection

**Reading Stories Should Feel Sacred**

```typescript
// AI Agent Guidance: Story Display

interface StoryReadingExperience {
  layout: {
    // Single story view
    type: "focused_column",
    max_width: "680px",
    padding: "generous", // At least 60px on sides for desktop
    
    // Metadata unobtrusive
    author_timestamp: "subtle_header", // Small, gray, above story
    tags_context: "below_story", // Never interrupting flow
    
    // Related stories suggestions appear after reading, not during
    related: "after_complete_read"
  };
  
  media: {
    // Images within stories
    presentation: "full_bleed" | "contained_with_caption",
    loading: "progressive", // No layout shift
    
    // Videos/audio
    controls: "minimal_custom", // Match design system
    autoplay: false, // Respect user control
    
    // Galleries
    navigation: "gentle_arrows" | "thumbnail_strip_below"
  };
  
  interactions: {
    // Reading progress
    progress_indicator: "subtle_top_bar", // Optional, user-controlled
    
    // Reactions/responses
    response_type: "add_story" | "private_note" | "share",
    reaction_style: "text_first", // Not emoji-heavy
    
    // Editing own stories
    edit_access: "clear_icon_for_author",
    version_history: "accessible_but_not_prominent"
  };
}

// Implementation requirements:
// 1. Distraction-free reading mode available
// 2. Smooth scroll behavior, no jarring animations
// 3. Print-friendly version ("Save as PDF" that looks beautiful)
// 4. Audio reading support for accessibility
```

---

## 3. Key User Journeys

### 3.1 First-Time User: Creating a Legacy Space

**Scenario**: Sarah's mother was recently diagnosed with cancer. She wants to collect stories while there's time.

```typescript
// Journey: Legacy Creation Onboarding

step_1_welcome: {
  // Landing page after auth
  message: "Let's create a space for [person's name]'s stories",
  tone: "warm_supportive",
  
  // Core setup (minimal)
  required_fields: [
    "person_name",
    "relationship" // daughter, friend, colleague, etc.
  ],
  
  optional_fields: [
    "photo", // "Add a photo we'll see when we think of them"
    "brief_description" // "A few words about who they are"
  ],
  
  // Set expectations
  explanation: "This space will hold all the stories about [name]. You can invite others to contribute, and choose what's shared publicly.",
  
  next_action: "start_first_story" | "invite_storytellers"
};

step_2_first_story_prompt: {
  // Don't ask for a story immediately; build comfort
  options: [
    {
      label: "I'll write something now",
      action: "open_editor_with_gentle_prompt"
    },
    {
      label: "I want to invite others first", 
      action: "show_invitation_flow"
    },
    {
      label: "Tell me more about how this works",
      action: "show_interactive_tour" // Not just text, actual demo
    }
  ]
};

// Implementation requirements:
// 1. Maximum 2-3 screens to start; can expand setup later
// 2. Every field explains why it matters
// 3. Skip options available ("I'll do this later")
// 4. Progress saved automatically; can return anytime
```

### 3.2 Contributor: Adding to Someone's Legacy

**Scenario**: Mark receives an invitation to share stories about his retiring colleague.

```typescript
// Journey: Contributor Experience

step_1_invitation: {
  // Email/link leads to
  landing: {
    message: "[Inviter name] invited you to share stories about [person]",
    context_visible: {
      person_photo: true,
      brief_bio: true,
      existing_story_count: true, // "12 stories so far"
      privacy_level: "visible" // "These stories are private to invited people"
    }
  },
  
  actions: {
    primary: "Share a story",
    secondary: "Read existing stories first"
  }
};

step_2_story_contribution: {
  // Pre-filled context
  defaults: {
    privacy: "inherited_from_legacy", // Match the space's settings
    about_person: "auto_linked", // Don't make them re-enter
    contributor_name: "from_auth" // Or allow anonymous
  },
  
  // Story-specific prompts for this context
  suggestions: [
    "A work memory that stands out",
    "Something they taught you professionally",
    "How they impacted your career",
    "What you'll miss most about working together"
  ],
  
  // Optional AI assistance
  ai_offer: {
    message: "Would you like help exploring this memory?",
    personas_available: ["biographer", "colleague", "friend"],
    dismissible: true
  }
};

// Implementation requirements:
// 1. Works without account creation (optional sign-up to edit later)
// 2. Can contribute multiple stories in one session
// 3. Clear "Your story has been added" confirmation
// 4. Option to notify inviter or keep it as a surprise
```

### 3.3 Reader: Discovering a Life Through Stories

**Scenario**: Emma wants to read stories about her grandmother, shared by many family members.

```typescript
// Journey: Story Discovery & Reading

entry_point: {
  // Legacy home page
  hero: {
    person_name: "prominent",
    photo: "present_but_not_oversized",
    summary_stats: [
      "47 stories",
      "From 23 storytellers", 
      "Spanning 1945-2024"
    ],
    
    // Emotional hook, not data dump
    featured_quote: "A memorable line from a recent story",
    
    actions: {
      primary: "Explore stories",
      secondary: "Add your own story"
    }
  }
};

story_browsing: {
  // Discovery interface
  views: [
    {
      name: "Timeline",
      description: "Stories arranged chronologically",
      visual: "vertical_timeline_with_story_cards"
    },
    {
      name: "Themes", 
      description: "Stories grouped by life chapters",
      visual: "thematic_collections" // Family, Career, Adventures, etc.
    },
    {
      name: "People",
      description: "Stories organized by who shared them",
      visual: "contributor_grid"
    },
    {
      name: "Connections",
      description: "Explore the graph of relationships",
      visual: "interactive_network_view" // Only if meaningful
    }
  ],
  
  // Default view
  default: "timeline",
  
  // Each story card shows
  card_preview: {
    title: "auto_generated_or_user_set",
    first_lines: "2-3_sentences",
    author: "visible",
    date: "story_date_not_created_date",
    thumbnail: "if_media_present",
    read_time: "optional_subtle"
  }
};

reading_session: {
  // Continuous reading experience
  navigation: {
    style: "scroll_or_paginate", // User preference
    next_story: "suggest_related", // Not random
    bookmark: "remember_position",
    share_story: "with_context" // Include person's name in share
  },
  
  // Reflection prompts
  after_reading: {
    prompt: "What does this story remind you of?",
    actions: [
      "Add my own story",
      "Save to favorites",
      "Share with family"
    ]
  }
};

// Implementation requirements:
// 1. Fast loading; prefetch next story
// 2. Accessible reading settings (text size, contrast, spacing)
// 3. No ads, no interruptions, no unrelated suggestions
// 4. Can export/print collection of stories
```

---

## 4. Component Patterns & Interactions

### 4.1 Media Upload & Integration

```typescript
// AI Agent Guidance: Media Handling

interface MediaUploadExperience {
  // Upload interface
  trigger: {
    location: "within_story_editor" | "standalone_gallery",
    visual: "drag_drop_zone" | "upload_button",
    messaging: {
      primary: "Add a photo or video",
      secondary: "Images and videos help stories come alive",
      // Not: "Upload media" (too technical)
    }
  };
  
  // Upload flow
  process: {
    // During upload
    progress: "percentage_with_preview",
    cancellable: true,
    
    // After upload
    processing_status: {
      scanning: "Checking file...", // AV scan
      analyzing: "Finding details...", // AI/ML analysis
      ready: "Ready to add to story"
    },
    
    // Enhancements offered, not forced
    ai_suggestions: {
      caption: "Would you like help describing this photo?",
      context: "We noticed this might be from [detected year/place]",
      people: "Tag people in this photo", // Face recognition optional
      
      // All optional and editable
      user_control: "accept_edit_or_dismiss"
    }
  };
  
  // In-story presentation
  placement: {
    options: [
      "inline_with_text",
      "full_width_break",
      "side_by_side_text",
      "gallery_at_end"
    ],
    default: "inline_with_text",
    repositionable: true // Drag to reorder
  };
}

// Implementation requirements:
// 1. Resumable uploads for large files
// 2. Mobile camera capture integrated
// 3. Audio recording for voice stories (with transcription offer)
// 4. Video thumbnail selection
// 5. Original quality preserved; responsive delivery
```

### 4.2 Privacy & Sharing Controls

```typescript
// AI Agent Guidance: Privacy Interface

interface PrivacyControls {
  // Story-level privacy
  visibility: {
    // Clear visual indicators
    states: [
      {
        level: "private",
        icon: "lock",
        description: "Only you can see this",
        color: "gray"
      },
      {
        level: "shared",
        icon: "people", 
        description: "Shared with invited people",
        color: "blue",
        show_count: true // "Shared with 12 people"
      },
      {
        level: "public",
        icon: "globe",
        description: "Anyone with the link can read",
        color: "green"
      }
    ],
    
    // Change privacy easily
    controls: {
      location: "story_header_and_editor",
      interaction: "dropdown_with_confirmation",
      // When making more public
      confirmation: "Are you sure? This will allow [audience] to read this story."
    }
  };
  
  // Invitation system
  invitations: {
    // Inviting contributors
    flow: {
      input: "email_or_link",
      message_customizable: true,
      default_message: "[Your name] would like you to share stories about [person name]",
      
      // Permissions granular
      permissions: [
        "can_read_all",
        "can_add_stories", 
        "can_invite_others",
        "can_manage_privacy" // Usually owner only
      ],
      default_permissions: ["can_read_all", "can_add_stories"]
    },
    
    // Visual management
    invited_people: {
      list_view: "with_contribution_count", // "Sarah (3 stories)"
      actions: ["resend_invite", "adjust_permissions", "remove_access"],
      
      // Pending invitations clear
      status_indicator: "sent_awaiting_response"
    }
  };
  
  // Consent for living persons
  consent: {
    // When story mentions living person
    trigger: "smart_detection_or_manual_flag",
    
    request_flow: {
      message: "This story mentions [person]. Would you like to request their consent before sharing?",
      options: [
        "Request consent now",
        "Mark for consent later",
        "Keep private until consent"
      ]
    },
    
    // Consent tracking
    status: {
      states: ["pending", "granted", "declined", "not_required"],
      visible_to: "story_author_and_admins",
      affects_visibility: "optionally_block_if_declined"
    }
  };
}

// Implementation requirements:
// 1. Privacy changes create clear audit trail
// 2. Bulk privacy updates available (select multiple stories)
// 3. Can make entire legacy space public or private
// 4. Clear explanation of what each privacy level means
// 5. Cannot accidentally make private stories public
```

### 4.3 Search & Discovery

```typescript
// AI Agent Guidance: Search Experience

interface SearchInterface {
  // Global search
  omnisearch: {
    // Search box presence
    location: "persistent_header",
    placeholder: "Search stories, people, places, moments...",
    
    // As-you-type suggestions
    suggestions: {
      categories: [
        "stories_containing_phrase",
        "people_mentioned",
        "time_periods",
        "themes_contexts"
      ],
      // Not just text matching
      semantic: true, // "sad goodbye" finds "heartbreaking farewell"
      preview: "first_matching_sentence"
    },
    
    // Search scope
    scoping: {
      default: "current_legacy",
      options: [
        "this_person",
        "all_my_legacies",
        "public_stories" // With permission
      ],
      selector: "visible_next_to_search_box"
    }
  };
  
  // Results presentation
  results: {
    // Grouped by relevance and type
    grouping: [
      "exact_matches",
      "stories_about_this",
      "people_connected",
      "similar_themes"
    ],
    
    // Result cards
    card_content: {
      title: "story_title_or_first_line",
      snippet: "matching_context_highlighted",
      metadata: "author_date_person",
      relevance: "optional_score_explanation" // "Matches your search for 'graduation'"
    },
    
    // Refinement
    filters: {
      facets: [
        "time_period",
        "storyteller",
        "has_media",
        "theme_tag",
        "mentioned_people"
      ],
      style: "sidebar_checkboxes",
      counts: "show_result_counts"
    },
    
    // No results state
    empty: {
      message: "No stories found for '[query]'",
      suggestions: [
        "Try different words",
        "Search all legacies",
        "Browse by timeline instead"
      ],
      // Helpful, not dead-end
      action: "start_story_about_this" // "Want to share what you remember?"
    }
  };
  
  // Saved searches (future)
  saved: {
    enable: "subscribe_to_search",
    notification: "new_story_matches_your_interest"
  };
}

// Implementation requirements:
// 1. Search works offline on cached stories
// 2. Natural language queries supported
// 3. Results load progressively (don't wait for all)
// 4. Can search within a single story
// 5. Keyboard navigation throughout
```

---

## 5. Accessibility Requirements

### 5.1 WCAG 2.1 AA Compliance

```typescript
// AI Agent Guidance: Accessibility Standards

interface AccessibilityRequirements {
  // Visual accessibility
  contrast: {
    minimum: "4.5:1_for_text",
    large_text: "3:1_minimum",
    // Test all color combinations
    test_against: ["light_theme", "dark_theme", "high_contrast"],
    
    // Focus indicators
    focus_visible: {
      style: "2px_solid_outline",
      color: "meets_contrast",
      offset: "2px"
    }
  };
  
  // Keyboard navigation
  keyboard: {
    // All interactive elements
    focusable: "all_buttons_links_inputs_controls",
    focus_order: "logical_dom_order",
    
    // Shortcuts
    shortcuts: {
      required: [
        "skip_to_content", // Bypass navigation
        "escape_closes_modals",
        "arrow_keys_in_lists",
        "enter_activates"
      ],
      optional: [
        "s_for_search",
        "n_for_new_story",
        "cmd_k_command_palette"
      ],
      // All shortcuts discoverable
      help: "keyboard_shortcuts_page_and_tooltip"
    },
    
    // Focus trapping
    modals: "trap_focus_until_closed",
    skip_links: "first_focusable_element"
  };
  
  // Screen reader support
  aria: {
    // Landmark regions
    landmarks: [
      "banner", "navigation", "main", 
      "complementary", "contentinfo"
    ],
    
    // Dynamic content
    live_regions: {
      // AI streaming text
      streaming: "aria-live='polite' aria-atomic='false'",
      // Status updates
      status: "role='status' aria-live='polite'",
      // Errors
      alerts: "role='alert' aria-live='assertive'"
    },
    
    // Rich components
    labels: {
      buttons: "descriptive_aria_label", // "Save story" not "Save"
      inputs: "associated_label_or_aria_labelledby",
      images: "alt_text_describes_content_and_function",
      
      // Context for controls
      story_actions: "includes_story_title", // "Share 'A Day at the Beach'"
    },
    
    // State announcements
    state: {
      loading: "aria-busy='true'",
      expanded: "aria-expanded",
      selected: "aria-selected",
      current: "aria-current='page'"
    }
  };
  
  // Text alternatives
  alternatives: {
    // Images
    images: {
      decorative: "alt=''", // Empty alt for decorative
      meaningful: "descriptive_alt", // Describe what's important
      complex: "long_description_option" // For charts, diagrams
    },
    
    // Media
    video: {
      captions: "required_for_all_video",
      transcripts: "full_text_available",
      audio_description: "optional_but_encouraged"
    },
    
    audio: {
      transcripts: "required",
      visual_indicator: "show_audio_playing"
    }
  };
  
  // Readable content
  readability: {
    // Text sizing
    font_size: {
      minimum: "16px_base",
      resizable: "up_to_200%_without_loss",
      line_height: "1.5_minimum",
      paragraph_spacing: "2em_minimum"
    },
    
    // Language
    lang_attribute: "set_on_html",
    lang_changes: "mark_with_lang_attribute",
    
    // Reading order
    heading_hierarchy: "logical_h1_to_h6",
    lists: "use_ul_ol_not_div",
    tables: "header_cells_with_scope"
  };
  
  // User preferences
  preferences: {
    // Motion
    reduce_motion: {
      media_query: "prefers-reduced-motion",
      disable: [
        "parallax_effects",
        "auto_playing_carousels",
        "fade_slide_animations"
      ],
      keep: "instant_transitions"
    },
    
    // Color scheme
    color_scheme: {
      respect: "prefers-color-scheme",
      override: "user_setting_persisted",
      options: ["light", "dark", "high_contrast"]
    }
  };
}

// Implementation requirements:
// 1. Automated accessibility testing in CI (axe-core)
// 2. Manual screen reader testing (NVDA, JAWS, VoiceOver)
// 3. Keyboard-only navigation testing
// 4. Color contrast analyzer in design system
// 5. Accessibility statement page with contact for issues
```

### 5.2 Internationalization Foundation

```typescript
// AI Agent Guidance: i18n Preparation

interface InternationalizationFoundation {
  // String externalization
  text_handling: {
    // Never hardcode strings
    approach: "message_catalog_from_day_one",
    
    // Catalog structure
    namespaces: [
      "common", // Buttons, labels shared across app
      "stories", // Story creation, reading
      "auth", // Login, registration
      "ai", // Agent interactions
      "errors" // Error messages
    ],
    
    // Message format
    format: "icu_message_format", // Supports plurals, gender, etc.
    
    example: {
      key: "story.count",
      en: "{count, plural, =0 {No stories yet} one {1 story} other {# stories}}",
      es: "{count, plural, =0 {Ninguna historia aún} one {1 historia} other {# historias}}"
    }
  };
  
  // Layout considerations
  layout: {
    // Text expansion
    space_for_growth: "30%_extra", // German can be 30% longer
    
    // RTL support preparation
    rtl_ready: {
      use: "logical_properties", // margin-inline-start not margin-left
      icons: "flip_directional_icons",
      text_align: "start_not_left"
    },
    
    // Avoid
    avoid: [
      "fixed_width_containers_for_text",
      "text_in_images",
      "concatenated_strings" // "Hello" + name (doesn't work in all languages)
    ]
  };
  
  // Cultural considerations
  cultural: {
    // Date/time
    datetime: {
      format: "locale_appropriate",
      library: "date-fns_with_locale",
      
      // Relative dates
      relative: "culture_aware" // "2 days ago" vs "2日前"
    },
    
    // Names
    names: {
      format: "flexible", // Some cultures: family name first
      required_fields: "minimum", // Not everyone has middle name
      display: "respect_preferences"
    },
    
    // Privacy/death
    sensitive_topics: {
      // Death is handled differently across cultures
      language: "configurable_tone",
      options: ["passed_away", "died", "lost", "deceased"],
      respect: "cultural_and_personal_preference"
    }
  };
  
  // MVP approach
  mvp_strategy: {
    // Start with English
    primary_locale: "en-US",
    
    // But prepare for expansion
    preparation: [
      "externalize_all_strings",
      "use_locale_aware_components",
      "test_with_pseudo_localization", // [Ŵëļçömë ţö Mösåîç Ļîƒë]
      "avoid_locale_assumptions"
    ],
    
    // First expansion likely
    next_locales: ["es", "zh", "fr", "de", "ar"], // Based on user base
    
    // Translation workflow ready
    process: {
      extract: "automated_message_extraction",
      translate: "professional_translation_service",
      verify: "native_speaker_review",
      deploy: "translation_updates_independent_of_code"
    }
  };
}

// Implementation requirements:
// 1. react-i18next or similar i18n library from start
// 2. All dates via date-fns or Intl.DateTimeFormat
// 3. Number formatting via Intl.NumberFormat
// 4. Pseudo-locale for layout testing
// 5. Language selector in user settings (even if only English available)
```

---

## 6. Performance & Reliability

### 6.1 Performance Budgets

```typescript
// AI Agent Guidance: Performance Standards

interface PerformanceTargets {
  // Core Web Vitals
  vitals: {
    LCP: {
      target: "2.5s",
      measurement: "largest_contentful_paint",
      critical_for: "story_reading_page"
    },
    FID: {
      target: "100ms", 
      measurement: "first_input_delay",
      critical_for: "editor_interactions"
    },
    CLS: {
      target: "0.1",
      measurement: "cumulative_layout_shift",
      critical_for: "media_loading"
    }
  };
  
  // Network conditions
  test_conditions: {
    desktop: "fast_3g_minimum", // 1.6 Mbps
    mobile: "slow_3g_minimum", // 400 Kbps
    
    // Progressive enhancement
    offline: {
      cache_strategy: "network_first_with_cache_fallback",
      offline_capable: [
        "read_cached_stories",
        "draft_new_stories", // Save to IndexedDB
        "queue_media_uploads" // Resume when online
      ]
    }
  };
  
  // Bundle sizes
  javascript: {
    initial: "150kb_max_gzipped",
    route_chunks: "50kb_max_each",
    
    // Splitting strategy
    split: {
      core: "app_shell_routing_ui_framework",
      features: "lazy_load_per_route",
      vendors: "shared_libraries_separate_chunk",
      plugins: "module_federation_on_demand"
    },
    
    // Monitoring
    budget_enforcement: "ci_fails_if_exceeded",
    analysis: "webpack_bundle_analyzer_in_ci"
  };
  
  // Images
  media: {
    formats: {
      modern: "webp_with_jpg_fallback",
      next_gen: "avif_where_supported"
    },
    
    responsive: {
      srcset: "multiple_sizes_provided",
      sizes: "layout_aware",
      lazy: "native_lazy_loading" // loading="lazy"
    },
    
    optimization: {
      compression: "80_quality_default",
      resize: "server_side_max_dimensions",
      
      // For stories
      thumbnails: "generated_multiple_sizes",
      originals: "preserved_but_not_served_by_default"
    }
  };
  
  // Fonts
  typography: {
    loading: {
      strategy: "font-display_swap",
      preload: "only_critical_fonts",
      subsetting: "latin_extended_minimum"
    },
    
    // Variable fonts preferred
    files: "variable_font_single_file_vs_multiple_weights"
  };
  
  // Rendering
  optimization: {
    // React-specific
    react: {
      memo: "expensive_components_memoized",
      virtualization: "long_lists_virtualized", // react-window
      suspense: "code_splitting_boundaries",
      
      // Avoid
      avoid: [
        "inline_function_props_on_large_lists",
        "index_as_key_for_dynamic_lists",
        "unnecessary_re_renders"
      ]
    },
    
    // CSS
    css: {
      critical: "inline_above_fold_css",
      async: "non_critical_css_async_loaded",
      unused: "purge_unused_styles",
      
      // Animations
      animations: {
        use: "transform_and_opacity_only", // GPU accelerated
        avoid: "layout_thrashing_properties" // width, height, top, left
      }
    }
  };
}

// Implementation requirements:
// 1. Lighthouse CI in deployment pipeline
// 2. Real User Monitoring (RUM) in production
// 3. Performance budgets enforced in CI
// 4. Synthetic monitoring for critical user flows
// 5. Image CDN with automatic optimization
```

### 6.2 Error Handling & Resilience

```typescript
// AI Agent Guidance: Error Handling UX

interface ErrorHandling {
  // Error boundary strategy
  boundaries: {
    // Granular boundaries
    levels: [
      "app_level", // Last resort, full app crashed
      "route_level", // Entire page failed
      "feature_level", // Story editor crashed, rest works
      "component_level" // Single plugin panel failed
    ],
    
    // Recovery UI
    fallback: {
      app_level: {
        message: "Something went wrong. We're working on it.",
        actions: ["Reload page", "Contact support"],
        log: "full_error_to_monitoring"
      },
      
      feature_level: {
        message: "The story editor encountered an issue.",
        actions: ["Try again", "Save draft and refresh"],
        preserve: "user_content_in_local_storage"
      },
      
      component_level: {
        message: "This section couldn't load.",
        actions: ["Retry", "Hide this section"],
        impact: "minimal" // Rest of app continues
      }
    }
  };
  
  // Network errors
  network: {
    // Offline detection
    offline: {
      indicator: "visible_banner_at_top",
      message: "You're offline. Changes will sync when you're back online.",
      
      // Queue actions
      queue: {
        uploads: "resume_when_online",
        story_saves: "auto_retry",
        reads: "serve_from_cache"
      }
    },
    
    // Request failures
    failed_requests: {
      retry_strategy: {
        automatic: "3_retries_with_exponential_backoff",
        manual: "retry_button_if_auto_fails",
        
        // Specific failures
        timeout: {
          message: "This is taking longer than expected...",
          action: "Keep waiting or try again"
        },
        
        server_error: {
          message: "Our servers are having issues. Please try again.",
          action: "Retry now"
        },
        
        not_found: {
          message: "We couldn't find that story.",
          action: "Return to browse stories"
        }
      }
    }
  };
  
  // User input errors
  validation: {
    // Inline validation
    timing: "on_blur_not_on_type", // Don't interrupt typing
    
    messages: {
      style: "helpful_not_judgmental",
      
      examples: {
        good: "Email should look like name@example.com",
        bad: "Invalid email format"
      },
      
      good_example: "Story title should be at least 3 characters",
      bad_example: "Error: Title too short"
    },
    
    // Form-level
    submit_errors: {
      location: "top_of_form_with_summary",
      focus: "first_field_with_error",
      
      // Multiple errors
      multiple: {
        summary: "Please fix 3 issues before saving:",
        list: "clickable_links_to_each_field"
      }
    }
  };
  
  // AI-specific errors
  ai_failures: {
    // Streaming interrupted
    stream_error: {
      message: "The AI response was interrupted.",
      recovery: "partial_response_kept",
      actions: ["Continue from here", "Start over"]
    },
    
    // Rate limit
    rate_limit: {
      message: "You've used your AI quota for now.",
      info: "Resets in [time]",
      alternative: "Continue writing without AI assistance"
    },
    
    // Content policy
    policy_violation: {
      message: "This request doesn't align with our content policy.",
      reason: "specific_if_safe_to_share",
      action: "Rephrase and try again"
    }
  };
  
  // Graceful degradation
  degradation: {
    // Feature unavailable
    feature_disabled: {
      message: "This feature is temporarily unavailable.",
      alternative: "basic_functionality_still_works",
      
      example: {
        ai_down: "Write your story, we'll save it. AI features will return soon."
      }
    },
    
    // Partial failure
    partial: {
      // Some stories load, others fail
      mixed_results: {
        show: "successful_results",
        indicate: "Some stories couldn't load. [Retry]",
        degrade_gracefully: "don't_block_entire_page"
      }
    }
  };
}

// Implementation requirements:
// 1. Error boundaries at each granularity level
// 2. Sentry or similar error tracking with source maps
// 3. LocalStorage/IndexedDB for draft persistence
// 4. Service Worker for offline capabilities
// 5. Retry logic with exponential backoff
// 6. User-facing error messages tested with real users
```

---

## 7. AI Agent Integration Patterns

### 7.1 Persona-Specific Behaviors

```typescript
// AI Agent Guidance: Persona Implementation

interface AIPersonas {
  biographer: {
    role: "Thoughtful chronicler",
    
    goals: [
      "Help user recall details",
      "Place events in context", 
      "Identify themes and patterns",
      "Suggest connections between stories"
    ],
    
    interaction_style: {
      questions: "open_ended_exploratory",
      tone: "curious_professional",
      pacing: "patient_unhurried",
      
      example_prompts: [
        "What year do you think this was? What else was happening in your life then?",
        "How old were they at the time? What do you remember about that age for them?",
        "This reminds me of another story you shared about [context]. Are these connected?",
        "What would someone who wasn't there need to know to understand this moment?"
      ]
    },
    
    capabilities: {
      timeline_building: true,
      fact_checking: "suggest_not_insist", // "I think [person] was born in 1952, does that sound right?"
      citation_suggestions: true, // "Would you like to link to the other story about this event?"
      
      avoid: [
        "inventing_facts",
        "correcting_emotional_memories", // "Actually it was Tuesday" when day doesn't matter
        "rushing_the_storyteller"
      ]
    }
  };
  
  therapist: {
    role: "Compassionate listener",
    
    goals: [
      "Create safe space for difficult emotions",
      "Help process grief and loss",
      "Validate feelings",
      "Gently explore meaning"
    ],
    
    interaction_style: {
      questions: "validating_reflective",
      tone: "warm_accepting",
      pacing: "follow_users_emotional_pace",
      
      example_prompts: [
        "That sounds like it was really hard. How does it feel to remember this now?",
        "What do you wish you could have said to them?",
        "It makes sense that you'd feel that way. Would you like to talk about it more?",
        "What do you think they would want you to know about this memory?"
      ]
    },
    
    capabilities: {
      emotional_reflection: true,
      grief_support: "acknowledge_not_minimize",
      reframing: "offer_not_impose", // "Another way to look at it might be... Does that resonate?"
      
      limitations: {
        not_crisis_support: true,
        refer_when_needed: "If you're struggling, please talk to a counselor. Here are resources...",
        boundary: "I'm here to help with memories, but I can't replace professional support."
      },
      
      avoid: [
        "toxic_positivity", // "At least they're in a better place"
        "unsolicited_advice",
        "comparing_grief", // "Others have it worse"
        "rushing_healing" // "You should be over this by now"
      ]
    }
  };
  
  friend: {
    role: "Warm conversation partner",
    
    goals: [
      "Make storytelling feel natural",
      "Share in joy and laughter",
      "Be a sounding board",
      "Celebrate the person being remembered"
    ],
    
    interaction_style: {
      questions: "conversational_casual",
      tone: "friendly_warm",
      pacing: "responsive_dynamic",
      
      example_prompts: [
        "Oh wow, what happened next?!",
        "That's such a great memory. What made it so special?",
        "I love that! Tell me more about [detail].",
        "Ha! What did they say when that happened?"
      ]
    },
    
    capabilities: {
      enthusiasm: "genuine_appropriate",
      humor: "match_users_tone", // Don't force jokes in sad moments
      storytelling: "encourage_narrative_flow",
      
      avoid: [
        "forced_cheerfulness",
        "dismissing_negative_memories",
        "overfamiliarity", // "OMG that's so crazy!"
        "making_it_about_the_ai" // "That reminds me of when I..." (AI has no experiences)
      ]
    }
  };
  
  mentor: {
    role: "Reflective guide",
    
    goals: [
      "Draw out lessons learned",
      "Highlight growth and change",
      "Connect past to present",
      "Identify wisdom worth preserving"
    ],
    
    interaction_style: {
      questions: "reflective_developmental",
      tone: "wise_respectful",
      pacing: "thoughtful_deliberate",
      
      example_prompts: [
        "What did you learn from them about [topic]?",
        "How did this experience shape who you are today?",
        "What would you tell your younger self about this moment?",
        "What wisdom from them do you carry forward?"
      ]
    },
    
    capabilities: {
      pattern_recognition: "identify_themes_across_stories",
      growth_narrative: "show_evolution_over_time",
      legacy_framing: "help_articulate_lasting_impact",
      
      avoid: [
        "prescriptive_moralizing", // "You should have learned X"
        "invalidating_complex_relationships", // Some people taught lessons through negative examples
        "oversimplifying_experiences"
      ]
    }
  };
  
  comedian: {
    role: "Light-hearted companion",
    
    goals: [
      "Find appropriate humor",
      "Celebrate joyful memories",
      "Lighten heavy moments (when welcome)",
      "Remember the person's humor"
    ],
    
    interaction_style: {
      questions: "playful_appreciative",
      tone: "light_respectful",
      pacing: "responsive_to_mood",
      
      example_prompts: [
        "That's hilarious! What did everyone else do?",
        "I bet that was quite a sight. Can you describe the scene?",
        "They sound like they had a great sense of humor. What would they have said about this?",
        "The funny stories are sometimes the most precious. What other times did they make you laugh?"
      ]
    },
    
    capabilities: {
      appropriate_levity: true,
      celebrate_personality: "quirks_and_humor",
      balance: "know_when_to_be_serious",
      
      critical_awareness: {
        read_the_room: "if_user_is_crying_dont_crack_jokes",
        grief_humor: "some_people_cope_with_humor_some_dont",
        respect_memory: "never_mock_the_person_being_remembered"
      },
      
      avoid: [
        "forced_jokes",
        "sarcasm_about_grief",
        "minimizing_through_humor", // "Well at least it's funny now!"
        "inappropriate_timing"
      ]
    }
  };
  
  // Persona switching
  switching: {
    user_initiated: {
      control: "always_user_choice",
      interface: "clear_persona_selector",
      transition: "explain_the_switch", // "Switching to friend mode. Let's keep this casual."
    },
    
    ai_suggested: {
      appropriate_moments: [
        "User seems to need emotional support → suggest therapist",
        "User exploring lessons → suggest mentor", 
        "User sharing funny story → suggest friend or comedian",
        "User building timeline → suggest biographer"
      ],
      
      suggestion_style: "gentle_offer",
      example: "This sounds like an important lesson you learned. Would talking with a mentor perspective help?",
      
      always_optional: true
    }
  };
}

// Implementation requirements:
// 1. Persona selection persisted per story or conversation
// 2. Clear visual indicator of active persona
// 3. Persona-specific prompt engineering in backend
// 4. Safety checks prevent inappropriate responses regardless of persona
// 5. User can disable AI entirely at any time
```

### 7.2 Streaming Conversation UI

```typescript
// AI Agent Guidance: Streaming Chat Interface

interface StreamingChatUI {
  // Visual layout
  layout: {
    container: {
      style: "conversational_thread",
      max_width: "720px",
      position: "centered_or_sidebar" // Depends on context
    },
    
    // Message bubbles
    messages: {
      user: {
        alignment: "right",
        background: "primary_color_subtle",
        text_color: "high_contrast",
        avatar: "optional_user_photo"
      },
      
      ai: {
        alignment: "left",
        background: "neutral_surface",
        text_color: "readable",
        avatar: "persona_icon" // Different icon per persona
      },
      
      spacing: "comfortable_vertical_rhythm",
      grouping: "consecutive_same_sender_grouped"
    }
  };
  
  // Streaming behavior
  streaming: {
    // Token appearance
    rendering: {
      approach: "word_by_word_or_sentence_by_sentence",
      speed: "natural_reading_pace", // Not too fast
      
      // Visual feedback
      cursor: "blinking_caret_at_end",
      container: "auto_scroll_to_follow",
      
      // Accessibility
      aria_live: "polite", // Don't interrupt screen reader
      update_frequency: "sentence_boundaries" // Not every character
    },
    
    // User interruption
    controls: {
      stop: {
        button: "visible_while_streaming",
        label: "Stop generating",
        behavior: "keep_partial_response"
      },
      
      // During streaming
      user_can: [
        "stop_generation",
        "scroll_back_to_read", // Auto-scroll pauses
        "start_typing_next_message" // Queued until complete
      ]
    },
    
    // Error handling
    interruption: {
      network_error: {
        partial: "display_what_received",
        action: "Continue from here button",
        message: "Response interrupted. Would you like to continue?"
      },
      
      timeout: {
        message: "Response is taking longer than expected...",
        action: "Keep waiting or start over"
      }
    }
  };
  
  // Input area
  input: {
    // Text entry
    field: {
      type: "expanding_textarea",
      min_height: "2_lines",
      max_height: "8_lines",
      placeholder: "Share what's on your mind...",
      
      // Rich input options
      attachments: {
        types: ["mention_story", "reference_person", "attach_media"],
        ui: "slash_commands_or_toolbar"
      }
    },
    
    // Actions
    send: {
      trigger: ["enter_key", "send_button"],
      modifier: "shift_enter_for_newline",
      disabled_when: "streaming_or_empty",
      
      // Confirmation for long messages
      long_message_warning: "Message is very long. Send anyway?"
    },
    
    // AI controls
    ai_toggle: {
      enable_disable: "toggle_switch_visible",
      persona_select: "dropdown_next_to_toggle",
      state_persistent: "remember_preference"
    }
  };
  
  // Context awareness
  context: {
    // Show what AI knows
    visible_context: {
      current_story: "if_in_story_editor",
      referenced_stories: "linked_in_thread",
      person_being_discussed: "name_and_basic_info",
      
      // Privacy indicator
      data_usage: "clear_notice_of_what_ai_sees"
    },
    
    // Context controls
    user_control: {
      add_context: "attach_story_or_media",
      remove_context: "detach_reference",
      clear_conversation: "start_fresh_button"
    }
  };
  
  // Conversation management
  persistence: {
    // Auto-save
    save: {
      frequency: "every_message",
      location: "server_side",
      offline: "cache_in_indexeddb"
    },
    
    // History
    history: {
      access: "load_previous_conversations",
      search: "find_in_conversation",
      export: "download_conversation_as_text",
      delete: "clear_conversation_with_confirmation"
    },
    
    // Privacy
    retention: {
      policy: "user_controls_retention",
      options: [
        "keep_forever",
        "auto_delete_after_30_days",
        "delete_on_session_end"
      ],
      
      // What's stored
      stored_data: [
        "messages",
        "persona_used",
        "context_references",
        "NOT_stored: user_location_device_details"
      ]
    }
  };
  
  // Response actions
  message_actions: {
    // Per AI message
    actions: [
      {
        label: "Copy",
        icon: "copy",
        behavior: "copy_to_clipboard"
      },
      {
        label: "Regenerate",
        icon: "refresh", 
        behavior: "request_different_response"
      },
      {
        label: "Use in story",
        icon: "plus",
        behavior: "insert_at_cursor_in_editor"
      },
      {
        label: "Flag issue",
        icon: "flag",
        behavior: "report_problematic_response"
      }
    ],
    
    // Visibility
    show: "on_hover_or_always_mobile"
  };
}

// Implementation requirements:
// 1. SSE for streaming (fallback to polling if needed)
// 2. Message deduplication and idempotency
// 3. Optimistic UI for user messages
// 4. Conversation threading and branching support
// 5. Rate limiting with clear user feedback
// 6. Export conversations in readable format
```

---

## 8. Platform-Specific Patterns

### 8.1 Story Editor

```typescript
// AI Agent Guidance: Story Editor Implementation

interface StoryEditor {
  // Editor foundation
  base: {
    library: "tiptap", // ProseMirror-based
    
    // Content format
    storage: "markdown", // Source of truth
    display: "rich_text", // WYSIWYG editing
    toggle: "preview_mode_available", // See rendered markdown
    
    // Sync strategy
    sync: {
      markdown_to_editor: "on_load",
      editor_to_markdown: "on_save_and_autosave",
      conflict: "last_write_wins_with_warning" // Or merge UI
    }
  };
  
  // Toolbar
  formatting: {
    // Available options
    options: [
      "bold", "italic", "strikethrough",
      "heading_2", "heading_3", // No h1, that's story title
      "bullet_list", "ordered_list",
      "blockquote",
      "link", "image",
      "horizontal_rule",
      "code_inline", "code_block"
    ],
    
    // Toolbar presentation
    ui: {
      style: "floating_on_selection", // Or "sticky_top"
      mobile: "bottom_bar", // Easier to reach
      
      // Keyboard shortcuts shown
      shortcuts_visible: "tooltip_on_hover"
    },
    
    // Not included (keep simple)
    excluded: [
      "tables", // Complex for mobile
      "font_family_size_color", // Design system controls this
      "embed_code", // Security risk
      "advanced_spacing" // Markdown doesn't support
    ]
  };
  
  // Mentions & links
  inline_references: {
    // @mentions
    mentions: {
      trigger: "@",
      search: "people_and_legacies",
      display: "name_with_avatar",
      storage: "markdown_link", // [@John Doe](person:uuid)
      
      behavior: {
        click: "navigate_to_person_or_tooltip",
        autocomplete: "fuzzy_search_as_you_type",
        keyboard: "arrow_keys_to_select_enter_to_insert"
      }
    },
    
    // Story links
    story_links: {
      trigger: "[[" or "button",
      search: "stories_in_this_legacy",
      display: "story_title_preview",
      storage: "markdown_link", // [Story Title](story:uuid)
    },
    
    // External links
    urls: {
      auto_detect: true, // Turn URLs into links
      validation: "check_format_not_existence",
      open_in: "new_tab" // target="_blank" rel="noopener"
    }
  };
  
  // Media embedding
  media: {
    // In-editor upload
    methods: [
      "drag_drop_file",
      "paste_image",
      "toolbar_button_upload",
      "media_library_picker"
    ],
    
    // Upload flow
    upload: {
      immediate: "start_upload_on_insert",
      progress: "show_in_editor_placeholder",
      
      // While uploading
      placeholder: {
        visual: "blurred_preview_or_spinner",
        interactive: "can_cancel_upload",
        failed: "error_state_with_retry"
      },
      
      // After upload
      inserted: {
        format: "markdown_image", // ![alt](url)
        resizing: "not_in_editor", // Edit in media library
        caption: "optional_markdown_emphasis", // *Caption text*
        
        // Alignment
        alignment: "left" | "center" | "right", // Via markdown extension
      }
    },
    
    // Media library
    library_picker: {
      modal: "searchable_grid_of_uploaded_media",
      filters: ["all", "images", "videos", "audio"],
      actions: ["insert", "view_details", "delete"],
      
      // Bulk insert
      multiple: "select_multiple_to_create_gallery"
    }
  };
  
  // Auto-features
  automation: {
    // Autosave
    autosave: {
      trigger: "idle_for_2_seconds",
      indicator: {
        saving: "Saving...",
        saved: "Saved just now",
        error: "Not saved - [Retry]"
      },
      
      // Local backup
      local_cache: "every_keystroke_to_localstorage",
      recover: "offer_to_restore_on_reload_if_newer"
    },
    
    // Auto-formatting
    markdown_shortcuts: {
      enabled: true,
      examples: [
        "# + space = heading",
        "* + space = bullet list", 
        "1. + space = numbered list",
        "> + space = blockquote",
        "** around text = bold",
        "_ around text = italic"
      ],
      
      // Undo
      undo_formatting: "cmd_z_or_backspace_immediately_after"
    }
  };
  
  // Collaboration (future)
  collaboration_ready: {
    // Prepare for multiplayer editing
    structure: {
      use: "yjs_or_operational_transform",
      conflict_resolution: "built_in",
      
      // Current state
      mvp: "single_writer_at_a_time",
      future: "real_time_collaborative_editing"
    },
    
    // Awareness
    presence: {
      show_active_editors: true,
      cursor_position: "show_other_user_cursors",
      selection: "highlight_other_selections"
    }
  };
  
  // Word count & stats
  metadata: {
    // Visible stats
    display: {
      word_count: "bottom_right_corner",
      reading_time: "estimated_minutes",
      last_edited: "timestamp",
      
      // Optional
      character_count: "in_settings_or_toggle",
      paragraph_count: "in_settings"
    },
    
    // Goals (optional feature)
    writing_goals: {
      type: "word_count_target",
      progress: "visual_indicator",
      celebrate: "message_on_goal_reached"
    }
  };
}

// Implementation requirements:
// 1. TipTap with Markdown extension
// 2. Prosemirror schema matching markdown capabilities
// 3. Custom nodes for mentions and story links
// 4. DOMPurify sanitization on render
// 5. LocalStorage for draft recovery
// 6. Debounced autosave with optimistic UI
// 7. Mobile-optimized toolbar
// 8. Keyboard shortcuts documentation
```

### 8.2 Media Gallery & Timeline

```typescript
// AI Agent Guidance: Media Gallery Implementation

interface MediaGallery {
  // Gallery views
  layouts: {
    grid: {
      // Photo grid
      style: "masonry_or_uniform_grid",
      responsive_columns: {
        mobile: 2,
        tablet: 3,
        desktop: 4,
        wide: 5
      },
      
      aspect_ratio: "maintain_original_or_crop_to_square",
      gap: "consistent_spacing",
      
      // Lazy loading
      loading: "intersection_observer",
      placeholder: "blurhash_or_solid_color"
    },
    
    slideshow: {
      // Full-screen viewer
      navigation: ["arrow_keys", "swipe", "arrow_buttons"],
      controls: ["play_pause", "speed", "shuffle"],
      
      // Media info overlay
      info: {
        caption: "below_image",
        metadata: "optional_overlay", // Date, location, people
        story_context: "link_to_related_stories"
      },
      
      // Accessibility
      keyboard: "full_keyboard_navigation",
      screen_reader: "announce_current_item_and_count"
    },
    
    timeline: {
      // Chronological organization
      axis: "vertical_timeline",
      grouping: "by_year_or_event",
      
      // Media clusters
      cluster: {
        threshold: "same_day_or_event",
        display: "stacked_thumbnails",
        expand: "click_to_view_all_in_cluster"
      },
      
      // Date indicators
      markers: {
        year: "large_visible_marker",
        month: "medium_marker",
        day: "subtle_marker",
        
        // Unknown dates
        approximate: "circa_year_or_undated_section"
      }
    },
    
    map: {
      // Location-based view
      implementation: "leaflet_or_mapbox",
      
      clustering: {
        nearby_media: "cluster_pins_at_zoom_out",
        expand: "zoom_in_to_separate"
      },
      
      // Privacy
      location_privacy: {
        exact: "only_if_user_enabled",
        approximate: "city_level_by_default",
        none: "no_location_shown_option"
      }
    }
  };
  
  // Media card
  card: {
    // Thumbnail
    preview: {
      // Image
      image: "responsive_thumbnail",
      
      // Video
      video: "poster_frame_with_play_icon",
      hover: "auto_preview_muted_video", // Optional
      
      // Audio
      audio: "waveform_or_speaker_icon",
      
      // Document (future)
      document: "first_page_thumbnail"
    },
    
    // Overlay info
    overlay: {
      always_visible: ["media_type_icon"],
      on_hover: [
        "caption_preview",
        "date",
        "linked_stories_count",
        "actions" // View, edit, delete, share
      ],
      
      // Selection mode
      selectable: {
        checkbox: "top_right_corner",
        multi_select: "shift_click_or_checkbox",
        bulk_actions: ["delete", "add_to_story", "download"]
      }
    },
    
    // Accessibility
    a11y: {
      alt_text: "required_for_images",
      aria_label: "descriptive_label_for_card",
      keyboard: "focusable_and_activatable"
    }
  };
  
  // Upload interface
  upload: {
    // Entry points
    triggers: [
      "add_media_button",
      "drag_drop_zone",
      "from_story_editor"
    ],
    
    // Multi-file upload
    batch: {
      supported: true,
      max_files: "20_per_batch",
      max_size_per_file: "100mb",
      
      // File types
      accepted: {
        images: [".jpg", ".jpeg", ".png", ".webp", ".heic"],
        videos: [".mp4", ".mov", ".avi"],
        audio: [".mp3", ".m4a", ".wav"],
        // Future: documents
      }
    },
    
    // Upload UI
    progress: {
      per_file: "individual_progress_bars",
      overall: "total_upload_progress",
      
      states: {
        queued: "waiting_to_upload",
        uploading: "progress_percentage",
        processing: "scanning_and_analyzing", // AV scan, AI analysis
        complete: "success_checkmark",
        failed: "error_with_retry"
      },
      
      // Resumable
      resume: "resume_interrupted_uploads",
      cancel: "cancel_individual_or_all"
    },
    
    // Post-upload enrichment
    enrichment: {
      // Auto-extracted
      automatic: [
        "exif_date_location",
        "video_duration_resolution",
        "audio_length"
      ],
      
      // AI-suggested (opt-in)
      ai_analysis: {
        image: [
          "scene_description",
          "detected_people_faces", // With consent
          "object_recognition",
          "text_ocr"
        ],
        
        video: [
          "scene_detection",
          "speech_to_text",
          "action_recognition"
        ],
        
        audio: [
          "transcription",
          "speaker_diarization"
        ],
        
        // User control
        user_choice: {
          enable: "opt_in_per_upload_or_globally",
          review: "review_suggestions_before_saving",
          edit: "correct_or_reject_suggestions"
        }
      },
      
      // Manual metadata
      user_provided: {
        fields: [
          "caption",
          "people_tagged",
          "location_override",
          "date_override", // For scanned old photos
          "related_stories"
        ],
        
        // Bulk edit
        bulk: "edit_multiple_files_at_once"
      }
    }
  };
  
  // Media viewer (lightbox)
  viewer: {
    // Full-screen modal
    layout: {
      media: "centered_max_viewport",
      controls: "minimal_overlay",
      
      // Media-specific
      image: {
        zoom: "pinch_or_scroll_to_zoom",
        pan: "drag_when_zoomed",
        rotate: "rotate_90_degrees_button"
      },
      
      video: {
        player: "custom_controls",
        quality: "auto_adaptive_or_manual",
        playback_speed: "0.5x_to_2x",
        
        // Captions
        subtitles: {
          source: "transcription_or_uploaded",
          display: "toggle_on_off",
          styling: "readable_customizable"
        }
      },
      
      audio: {
        player: "waveform_with_scrubbing",
        playback_speed: "0.5x_to_2x",
        
        // Transcript
        transcript: {
          display: "side_panel_or_below",
          sync: "highlight_current_word",
          search: "search_within_transcript"
        }
      }
    },
    
    // Navigation
    navigation: {
      next_prev: "arrow_buttons_and_keys",
      thumbnails: "thumbnail_strip_at_bottom",
      close: "x_button_or_escape_key",
      
      // Context
      from_story: "show_story_context",
      from_gallery: "gallery_navigation"
    },
    
    // Actions bar
    actions: {
      primary: [
        "download_original",
        "share_link",
        "add_to_story",
        "edit_metadata"
      ],
      
      secondary: [
        "view_details",
        "view_location_on_map",
        "see_related_stories",
        "delete"
      ],
      
      // Presentation
      layout: "horizontal_action_bar_bottom",
      mobile: "vertical_menu_or_sheet"
    }
  };
  
  // Organization
  organization: {
    // Collections (future)
    collections: {
      create: "group_media_by_theme",
      examples: ["Vacation 2020", "Mom's favorites", "Childhood"],
      
      smart_collections: {
        auto: "ai_suggested_groupings",
        filters: "date_range_or_people_or_location"
      }
    },
    
    // Search
    search: {
      query: "text_search_captions_and_metadata",
      filters: [
        "media_type",
        "date_range",
        "people_tagged",
        "location",
        "has_transcription"
      ],
      
      // Visual search (future)
      visual: {
        similar: "find_similar_images",
        by_content: "search_by_described_content"
      }
    },
    
    // Sorting
    sort: {
      options: [
        "date_newest_first",
        "date_oldest_first",
        "recently_added",
        "alphabetical_by_caption",
        "most_used_in_stories"
      ],
      default: "date_newest_first"
    }
  };
}

// Implementation requirements:
// 1. Responsive image loading with srcset
// 2. Video player with HLS/DASH support
// 3. Audio waveform visualization
// 4. Resumable uploads (tus protocol)
// 5. Lazy loading with intersection observer
// 6. Keyboard navigation throughout
// 7. Touch gestures for mobile (swipe, pinch-zoom)
// 8. Metadata extraction using exif, ffprobe
```

---

## 9. Acceptance Criteria for AI-Generated Code

### 9.1 Code Quality Standards

```typescript
// AI Agent Guidance: Code Acceptance Checklist

interface AcceptanceCriteria {
  // Functional requirements
  functionality: {
    works_as_specified: "feature_matches_requirements",
    edge_cases_handled: [
      "empty_states",
      "error_states", 
      "loading_states",
      "no_permission_states"
    ],
    
    // User flows complete
    flows_tested: [
      "happy_path",
      "error_recovery",
      "cancellation",
      "back_navigation"
    ]
  };
  
  // Code quality
  quality: {
    // TypeScript
    typescript: {
      strict_mode: true,
      no_any: "avoid_any_type_use_unknown_or_specific",
      no_ignore: "no_ts_ignore_without_explanation",
      
      types: {
        props_interfaces: "all_component_props_typed",
        api_contracts: "generated_from_openapi",
        no_implicit_any: true
      }
    },
    
    // React patterns
    react: {
      hooks_rules: "follows_rules_of_hooks",
      no_unused_deps: "dependency_arrays_complete",
      key_props: "stable_unique_keys_for_lists",
      
      performance: {
        memo_appropriate: "expensive_components_memoized",
        callback_stable: "useCallback_for_child_props",
        effect_cleanup: "cleanup_functions_for_effects"
      }
    },
    
    // Styling
    styling: {
      design_system: "uses_design_tokens_not_magic_values",
      responsive: "mobile_first_breakpoints",
      accessible: "meets_wcag_aa",
      
      css: {
        no_inline_styles: "use_css_modules_or_styled_components",
        no_important: "avoid_important_use_specificity",
        logical_properties: "use_inline_start_not_left"
      }
    }
  };
  
  // Testing requirements
  testing: {
    // Unit tests
    unit: {
      coverage: "critical_logic_covered",
      libraries: "vitest_or_jest",
      
      test_cases: [
        "component_renders",
        "user_interactions",
        "state_changes",
        "error_conditions"
      ]
    },
    
    // Integration tests
    integration: {
      api_mocking: "msw_for_api_mocks",
      user_flows: "test_complete_user_journeys",
      
      examples: [
        "create_and_save_story",
        "upload_media_and_attach_to_story",
        "search_and_find_result"
      ]
    },
    
    // E2E tests (selective)
    e2e: {
      tool: "playwright",
      critical_paths: [
        "authentication_flow",
        "story_creation_flow",
        "media_upload_flow"
      ],
      
      // Not everything
      scope: "critical_happy_paths_not_every_feature"
    },
    
    // Accessibility tests
    a11y: {
      automated: "axe_core_in_ci",
      manual: "keyboard_and_screen_reader_tested",
      
      checks: [
        "color_contrast_passes",
        "keyboard_navigation_complete",
        "aria_labels_present",
        "focus_management_correct"
      ]
    }
  };
  
  // Documentation
  documentation: {
    // Code comments
    comments: {
      why_not_what: "explain_complex_logic",
      no_obvious: "dont_comment_obvious_code",
      
      required_for: [
        "workarounds",
        "performance_optimizations",
        "browser_specific_code",
        "security_considerations"
      ]
    },
    
    // Component documentation
    components: {
      storybook: "all_shared_components_have_stories",
      props: "props_documented_in_interface",
      examples: "usage_examples_in_stories",
      
      // States
      states_shown: [
        "default",
        "loading",
        "error",
        "empty",
        "disabled"
      ]
    },
    
    // API documentation
    apis: {
      openapi: "contracts_up_to_date",
      errors: "error_codes_documented",
      examples: "request_response_examples"
    }
  };
  
  // Performance
  performance: {
    // Bundle size
    bundle: {
      initial: "within_budget_150kb",
      chunks: "code_split_per_route",
      
      analysis: "bundle_analyzer_in_ci",
      regression: "fail_if_10_percent_increase"
    },
    
    // Runtime performance
    runtime: {
      rendering: "no_unnecessary_rerenders",
      large_lists: "virtualized",
      images: "lazy_loaded",
      
      // Measurements
      metrics: {
        lcp: "under_2_5s",
        fid: "under_100ms",
        cls: "under_0_1"
      }
    },
    
    // Network
    network: {
      api_calls: "debounced_or_throttled",
      prefetch: "hover_prefetch_for_links",
      caching: "http_cache_headers_respected"
    }
  };
  
  // Security
  security: {
    // Input handling
    input: {
      sanitization: "all_user_content_sanitized",
      validation: "client_and_server_validation",
      
      xss_prevention: [
        "no_dangerouslySetInnerHTML_without_sanitizer",
        "escape_user_content_in_attributes",
        "csp_compliant"
      ]
    },
    
    // Auth
    auth: {
      tokens: "never_in_localstorage",
      api_calls: "include_credentials",
      redirects: "handle_401_globally"
    },
    
    // Dependencies
    dependencies: {
      audit: "npm_audit_passes",
      updates: "critical_vulnerabilities_addressed",
      sbom: "dependency_list_tracked"
    }
  };
  
  // Accessibility (detailed)
  accessibility: {
    // WCAG compliance
    wcag_aa: {
      perceivable: [
        "text_alternatives",
        "adaptable_content",
        "distinguishable_content"
      ],
      
      operable: [
        "keyboard_accessible",
        "enough_time",
        "no_seizures",
        "navigable"
      ],
      
      understandable: [
        "readable",
        "predictable",
        "input_assistance"
      ],
      
      robust: [
        "compatible_with_assistive_tech"
      ]
    },
    
    // Specific checks
    checks: {
      color_contrast: "all_text_meets_4_5_1",
      focus_indicators: "visible_on_all_interactive",
      headings: "logical_hierarchy",
      landmarks: "main_navigation_complementary",
      forms: "labels_and_error_messages",
      images: "meaningful_alt_text",
      videos: "captions_and_transcripts"
    }
  };
  
  // Code review checklist
  review: {
    before_submission: [
      "runs_locally_without_errors",
      "linter_passes",
      "types_pass",
      "tests_pass",
      "accessible_via_keyboard",
      "works_in_mobile_viewport",
      "works_in_dark_mode",
      "loading_and_error_states_shown",
      "no_console_errors_or_warnings"
    ],
    
    // Self-review
    self_review: [
      "remove_debug_code",
      "remove_commented_code",
      "meaningful_commit_messages",
      "no_secrets_in_code",
      "deps_added_to_package_json"
    ]
  };
}

// Implementation note for AI agents:
// Every piece of generated code should pass these criteria
// If unsure about a requirement, ask for clarification
// Include tests alongside feature code
// Document complex logic
// Prioritize accessibility from the start, not as an afterthought
```

### 9.2 Example Prompts for AI Agents

```typescript
// AI Agent Guidance: Example Prompt Patterns

interface ExamplePrompts {
  // Feature request pattern
  feature: {
    template: `
      Build: [specific feature]
      Context: [where it fits in the app]
      User story: As a [user type], I want to [action] so that [benefit]
      
      Requirements:
      - [functional requirement 1]
      - [functional requirement 2]
      
      Design guidelines:
      - [visual/UX requirement]
      
      Acceptance criteria:
      - [testable criteria 1]
      - [testable criteria 2]
      
      Technical constraints:
      - [framework/library to use]
      - [integration points]
    `,
    
    example: `
      Build: Story creation form with AI biographer integration
      Context: Main story creation flow, accessed from dashboard
      User story: As a storyteller, I want to write a story with optional AI guidance so that I can capture memories more completely
      
      Requirements:
      - Rich text editor using TipTap
      - Optional AI biographer that can be toggled on/off
      - Auto-save every 2 seconds to prevent data loss
      - Clear privacy controls for the story
      
      Design guidelines:
      - Minimalist interface, focus on content
      - AI suggestions appear inline but are clearly differentiated
      - Mobile-friendly with touch-optimized controls
      
      Acceptance criteria:
      - Editor loads in under 2 seconds
      - AI responses stream word-by-word
      - Can write and save a story without AI enabled
      - Autosave indicator shows save status clearly
      - Works with keyboard only (no mouse)
      - Passes WCAG AA contrast and focus requirements
      
      Technical constraints:
      - Use TipTap editor wrapper from /features/editor
      - Integrate with useSSE hook for AI streaming
      - Use design tokens from @mosaiclife/design-system
      - Follow privacy control patterns from existing stories
    `
  };
  
  // Component creation pattern
  component: {
    template: `
      Create: [component name]
      Purpose: [what it does]
      Props: [expected props interface]
      
      Behavior:
      - [interaction 1]
      - [interaction 2]
      
      States to handle:
      - [state 1]
      - [state 2]
      
      Accessibility:
      - [specific a11y requirement]
      
      Storybook stories:
      - [variant 1]
      - [variant 2]
    `,
    
    example: `
      Create: MediaUploadZone component
      Purpose: Drag-and-drop area for uploading images and videos
      
      Props:
      interface MediaUploadZoneProps {
        onUpload: (files: File[]) => Promise<void>;
        maxFiles?: number;
        accept?: string[];
        maxSizePerFile?: number; // bytes
      }
      
      Behavior:
      - Drag and drop files to upload
      - Click to open file picker
      - Show preview thumbnails during upload
      - Display upload progress per file
      - Allow canceling individual uploads
      
      States to handle:
      - Empty (show helpful message and icon)
      - Drag over (highlight drop zone)
      - Uploading (show progress bars)
      - Error (show error message with retry)
      - Complete (show success state)
      
      Accessibility:
      - Keyboard accessible (space/enter to open picker)
      - Screen reader announces drag state changes
      - Error messages announced via aria-live
      - Focus management when upload complete
      
      Storybook stories:
      - Default empty state
      - Uploading state (mocked)
      - Error state
      - With files uploaded (success)
      - Mobile variant
      - Dark mode
    `
  };
  
  // Bug fix pattern
  bugfix: {
    template: `
      Issue: [description of the bug]
      Steps to reproduce:
      1. [step 1]
      2. [step 2]
      
      Expected: [what should happen]
      Actual: [what actually happens]
      
      Root cause: [analysis of why it's happening]
      
      Fix: [approach to fix]
      
      Testing:
      - [how to verify fix]
      - [edge cases to check]
    `,
    
    example: `
      Issue: Story autosave conflicts when user navigates away
      
      Steps to reproduce:
      1. Open story editor
      2. Type content
      3. Navigate to different page while autosave in progress
      4. Return to story editor
      
      Expected: Latest content is preserved
      Actual: Sometimes shows older version of content
      
      Root cause: Autosave request racing with navigation, state cleanup happens before save completes
      
      Fix: 
      - Use AbortController to cancel autosave on unmount
      - Show "Saving..." blocker if user tries to navigate while save in progress
      - Queue final save before navigation cleanup
      
      Testing:
      - Verify save completes before navigation
      - Verify no duplicate saves
      - Test rapid navigation (fast clicking)
      - Check offline scenario
      - Verify error handling if save fails during navigation
    `
  };
  
  // Accessibility enhancement pattern
  a11y: {
    template: `
      Component: [component to enhance]
      Current issues:
      - [a11y issue 1]
      - [a11y issue 2]
      
      Required fixes:
      - [fix 1]
      - [fix 2]
      
      Testing approach:
      - [test method 1]
      - [test method 2]
      
      Success criteria:
      - [measurable criteria]
    `,
    
    example: `
      Component: Story card grid
      
      Current issues:
      - Cards not keyboard focusable
      - No ARIA labels for card actions
      - Screen reader announces "button" without context
      - Focus not visible in dark mode
      
      Required fixes:
      - Make card links/buttons keyboard navigable
      - Add aria-label with story title and author to each card
      - Improve action button labels: "Share [Story Title]" not just "Share"
      - Ensure 2px focus ring with sufficient contrast in all themes
      - Add skip link to bypass grid if many items
      
      Testing approach:
      - Test with NVDA, JAWS, and VoiceOver
      - Navigate entire grid using only Tab and arrow keys
      - Test in high contrast mode
      - Run axe DevTools automated scan
      - Verify focus order follows visual order
      
      Success criteria:
      - All cards reachable via keyboard
      - Screen reader announces full context for each card
      - Focus indicators visible in all themes with 3:1 contrast
      - axe scan passes with 0 violations
      - Can complete all actions (read, share, edit) using keyboard only
    `
  };
  
  // Performance optimization pattern  
  performance: {
    template: `
      Component: [slow component]
      Performance issue: [specific problem]
      
      Metrics:
      - Current: [measurement]
      - Target: [goal]
      
      Bottlenecks:
      - [bottleneck 1]
      - [bottleneck 2]
      
      Optimization strategy:
      - [approach 1]
      - [approach 2]
      
      Validation:
      - [how to measure improvement]
    `,
    
    example: `
      Component: Story list with 500+ items
      Performance issue: Slow rendering, janky scrolling
      
      Metrics:
      - Current: 3000ms to render, scrolling at 30fps
      - Target: Under 500ms initial render, 60fps scrolling
      
      Bottlenecks:
      - Rendering all 500 DOM nodes at once
      - Re-rendering entire list on any state change
      - Heavy markdown rendering on each card
      - Non-memoized filter/sort operations
      
      Optimization strategy:
      - Implement virtual scrolling with react-window
      - Memoize story cards with React.memo
      - Defer markdown rendering until card in viewport
      - Move filtering/sorting to Web Worker
      - Debounce search input
      
      Validation:
      - Measure with React DevTools Profiler
      - Check frame rate with Performance monitor
      - Lighthouse performance score should be 90+
      - Test on low-end devices (simulate in DevTools)
      - Verify no regression in functionality
    `
  };
}

// Note to AI agents:
// These prompt patterns should guide how you interpret user requests
// Always ask clarifying questions if requirements are ambiguous
// Provide code that meets all acceptance criteria
// Include tests that validate the requirements
// Document complex decisions and trade-offs
```

---

## 10. Final Checklist for AI Agents

**Before considering any task complete, verify:**

### Functionality
- [ ] Feature works as specified in all states (empty, loading, error, success)
- [ ] Edge cases handled (empty data, malformed input, network errors)
- [ ] User can complete the intended flow start to finish
- [ ] Graceful degradation if optional features unavailable

### Code Quality
- [ ] TypeScript strict mode passes with no 'any' types
- [ ] Follows React best practices (hooks rules, keys, memoization)
- [ ] Uses design system tokens, not magic values
- [ ] No console errors or warnings
- [ ] Lint passes with no errors

### User Experience
- [ ] Respects emotional weight of content (reverent, warm, safe)
- [ ] Clear visual hierarchy with generous whitespace
- [ ] Responsive across mobile, tablet, desktop
- [ ] Works in both light and dark mode
- [ ] Loading states prevent user confusion
- [ ] Error messages are helpful and actionable

### Accessibility
- [ ] Keyboard navigation works completely
- [ ] Screen reader tested (announce content correctly)
- [ ] Color contrast meets WCAG AA (4.5:1 minimum)
- [ ] Focus indicators visible in all themes
- [ ] ARIA labels provide context
- [ ] No automated axe violations

### Performance
- [ ] Initial load under 2 seconds on 3G
- [ ] Images lazy loaded with placeholders
- [ ] Large lists virtualized
- [ ] Bundle size within budget
- [ ] No unnecessary re-renders

### Testing
- [ ] Unit tests for critical logic
- [ ] Integration tests for user flows
- [ ] Accessibility tests (axe-core)
- [ ] Visual regression tests where applicable
- [ ] Manual testing on real devices

### Documentation
- [ ] Complex logic commented with "why"
- [ ] Props/interfaces documented
- [ ] Storybook stories created
- [ ] README updated if new patterns introduced

### Security
- [ ] User input sanitized
- [ ] No XSS vulnerabilities
- [ ] Credentials never in localStorage
- [ ] CSRF protection where needed
- [ ] No secrets in code

---

## Closing Guidance for AI Coding Agents

This platform exists to honor the profound human experience of memory, loss, love, and legacy. Every line of code should serve that purpose with care, respect, and technical excellence.

When in doubt:
1. **Prioritize the user's emotional state** over technical perfection
2. **Make the complex simple**, never the simple complex
3. **Preserve agency**: users control their stories, always
4. **Fail gracefully**: errors should never lose user content
5. **Build for everyone**: accessibility is not optional

The best code you can write is code that disappears, leaving only the story.

---
# Addendum — Implementation Specs & Deltas (updated October 05, 2025)

> This addendum refines and extends the original guidance to ensure consistent implementation by AI coding assistants and human contributors. Where conflicts exist, **this addendum supersedes prior guidance**.

## 1) Reading Layout & Typography (Sacred Reading Mode)
- Story view is **single-column**, constrained to ~**65–75 characters per line**.
- **Body text** uses a legible **serif**; **UI chrome** uses a clean **sans-serif**.
- Line-height: 1.6–1.8; paragraph spacing ≥ 0.6em; no justified text.
- Reduce chrome while reading (focus mode).

## 2) Creation Flow Pacing
- "Tell a story" opens a **minimal canvas** with gentle starter prompts.
- **Autosave** is visible with a status indicator; never silent overwrites.
- AI agent is discoverable but **unobtrusive** (secondary affordance).

## 3) AI Streaming & Accessibility
- Stream responses in **sentence or word cadence** (not raw token spam).
- Use `aria-live="polite"` and only announce on sentence boundaries.
- "Stop/Continue" retains partial output; restart continues from last full sentence.

## 4) Omnisearch as a First‑Class Control
- Persistent header search with scoping: **This Legacy / All Legacies / Public**.
- Suggestions blend **keyword + semantic** hints; explicit scope chips.
- Add **offline search on cached stories** (when Service Worker is active).

## 5) Story Metadata & Browsing
- Prefer the **story date (the moment remembered)** over created/updated dates in cards and timelines.
- Related suggestions appear **after reading**, not mid-scroll (avoid distraction).

## 6) Privacy, Invitations, Consent (UX Clarifications)
- Clear visibility states: **Private / Shared / Public**, with consistent iconography.
- Granular invites: viewer, contributor, moderator; consent workflow for living subjects (pending/granted/declined).

## 7) Internationalization Details
- ICU message format; pseudo-localization for QA; RTL **logical properties**.
- Offer culturally sensitive vocabulary options around grief and remembrance.

## 8) Performance Budgets (Supersedes previous)
- Initial JS (critical path): **≤ 150 KB gzipped**.
- Per‑route async chunk: **≤ 50 KB gzipped**.
- Image lazy-loading; route-level code splitting; hover prefetch.
- Enforce budgets in CI with a bundle report and hard thresholds.

## 9) Plugin Surfaces — UI Contribution Contract
```ts
// Plugin UI Contribution Contract (aligns with @mosaiclife/plugin-sdk)
export type PluginSurface =
  | { kind: "route"; path: `/plugins/${string}`; title: string }
  | { kind: "panel"; location: "legacy.sidebar" | "home.right"; title: string }
  | { kind: "command"; id: string; title: string; run: (ctx: SDKCtx) => void };

export interface PluginMountContext {
  sdk: SDK;                // typed API, auth, telemetry
  legacyId?: string;       // present when mounted inside a Legacy
  theme: ThemeTokens;      // design tokens (see §12)
  i18n: I18nHandle;        // translate()
}
```
**Acceptance:** Surfaces register via manifest; mounts wrapped by error boundaries; only approved origins may load per CSP; untrusted plugins default to sandboxed iframe.

## 10) Instrumentation Spec (OpenTelemetry Web)
```ts
// Span names & required attributes (exclude PII)
ai.stream:    { legacy_id, story_id?, persona, model, tokens, duration_ms }
story.save:   { legacy_id, story_id, draft: boolean, bytes, offline: boolean }
media.upload: { legacy_id, story_id?, size, type, resumable: boolean }
search.query: { scope, query_type: "keyword|semantic", result_count }
```
**DoD:** Spans are emitted for the journeys below; Playwright tests assert their presence; sourcemaps uploaded; user PII scrubbed.

## 11) Governance: Consent Ledger & Audit
```ts
// Append-only consent ledger event
type ConsentEvent = {
  id: string;
  story_id: string;
  subject_person_id: string;
  action: "requested" | "granted" | "declined" | "revoked";
  actor_user_id: string;
  at: string;             // ISO timestamp
  note?: string;
};
```
**DoD:** Export (CSV/JSON) available; audit trail for visibility changes; subject access & erasure flows discoverable in Settings.

## 12) Design Tokens (baseline)
```ts
// Example token set (light/dark variants omitted for brevity)
color.bg.surface
color.bg.canvas
color.text.primary
color.text.muted
color.border.subtle
radius.s = 8; radius.m = 12; radius.l = 16
space.1 = 4; space.2 = 8; space.3 = 12; space.4 = 16
font.ui = "Inter, system-ui"
font.body = "Merriweather, Georgia, serif"
shadow.card = "tokenized; no ad-hoc box-shadows"
```
**DoD:** No hard-coded colors/sizes in components; Storybook theme switch passes contrast checks (WCAG AA/AAA where applicable).

## 13) Graph Accessibility Contract
- **Keyboard model**
  - `Tab`: move between toolbar/filters/canvas
  - Arrow keys: move focus to nearest node by direction
  - `Enter`: open node inspector; `Esc`: close inspector
  - `Shift+?`: legend & controls helper
- **ARIA:** `role="application"` with instructions; visible focus ring (≥ 3:1).
- **DoD:** Full navigation without a mouse; SR announces node title and connection counts.

## 14) Service Worker Strategy (Offline-First Behaviors)
- **Reads:** network‑first with cache fallback (stories, metadata).
- **Writes:** queue in IndexedDB; background sync with retry/backoff.
- **Uploads:** chunked/resumable; show offline banner and queued state.
- **Tests:** e2e covers offline read, draft autosave restore, queued upload.

## 15) AI Safety & Redaction
- Pre‑publish **moderation** for stories and AI insertions.
- **PII redaction suggestions** with click‑to‑apply diffs.
- Persona guardrails: the **comedian** uses gentle humor; never targets protected classes; grief‑aware language options.
- Violations yield actionable, respectful UI with policy codes (not raw content).

## 16) Public Legacy SEO & Sharing (Respectful Discoverability)
- `og:title`, `og:description`, `og:image` (privacy‑aware).
- `schema.org/Person` for legacy subjects; `CreativeWork` for stories.
- No third‑party trackers on memorial/public pages.

## 17) Journey-Linked Release Checklists (Definition of Done)
For each journey—**Create Legacy**, **Tell a Story**, **Read**, **Invite/Consent**, **Search & Discover**, **AI Enrich**, **Upload Media**—PRs must attest:
- ✅ Axe a11y checks pass; keyboard paths verified.
- ✅ Required OTel spans present (see §10).
- ✅ Bundle fits budget (≤ 150 KB initial, ≤ 50 KB route chunk).
- ✅ Offline behaviors verified where applicable (§14).
- ✅ Print/PDF rendering OK for Story view (read mode).
- ✅ Error boundaries & empty states implemented.

## 18) Architecture Cross‑References
- `CORE-BACKEND-ARCHITECTURE.md` — BFF, events, media, search/vector, graph.
- `FRONTEND-ARCHITECTURE.md` — React+TS, SSE, TipTap, TanStack Query/Zustand.
- `PLUGIN-ARCHITECTURE.md` — SDK, capabilities, Module Federation, isolation.
