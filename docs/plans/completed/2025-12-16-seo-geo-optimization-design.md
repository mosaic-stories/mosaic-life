# SEO & Generative Engine Optimization Design

**Date:** 2025-12-16
**Status:** Approved
**Goal:** Brand discovery - ensure "Mosaic Life" searches return mosaiclife.me on the first page

## Overview

This design adds SEO infrastructure to the Mosaic Life application, enabling search engine indexing and social media preview cards. It also prepares for Generative Engine Optimization (GEO) by implementing structured data that AI systems can understand.

## Architecture

```
                                    ┌─────────────────┐
                                    │  Search Engine  │
                                    │    Crawlers     │
                                    └────────┬────────┘
                                             │
                                             ▼
                                    ┌─────────────────┐
                                    │     Ingress     │
                                    │  (User-Agent    │
                                    │   Detection)    │
                                    └────────┬────────┘
                                             │
                        ┌────────────────────┴────────────────────┐
                        │                                         │
                        ▼ (Bot)                                   ▼ (Human)
               ┌─────────────────┐                       ┌─────────────────┐
               │    Prerender    │                       │     Web App     │
               │    Service      │──renders──▶           │   (React SPA)   │
               │  (Headless      │                       │                 │
               │   Chrome)       │                       └─────────────────┘
               └─────────────────┘
                        │
                        ▼
               ┌─────────────────┐
               │     Web App     │
               │   (fetches &    │
               │   renders page) │
               └─────────────────┘
```

### Flow

1. Crawler requests a page (e.g., `/legacy/abc123`)
2. Ingress detects bot via User-Agent header
3. Bot traffic → Prerender service renders the page with headless Chrome → returns static HTML
4. Human traffic → Serves the React SPA directly

### New Components

- **Prerender service**: Dockerized Prerender.io running headless Chrome
- **Ingress annotations**: Route bot traffic to prerender
- **React Helmet**: Dynamic `<head>` management in the SPA
- **Sitemap endpoint**: New FastAPI route at `/sitemap.xml`
- **Robots.txt endpoint**: New FastAPI route at `/robots.txt`

## Component Details

### 1. Prerender Service

**Docker Image:** `prerender/prerender` (official)

**Configuration:**
- `CHROME_FLAGS`: `--no-sandbox --headless --disable-gpu --disable-dev-shm-usage`
- `ALLOWED_DOMAINS`: Environment-specific (localhost, mosaiclife.me)
- `CACHE_MAXSIZE`: 1000 pages
- `CACHE_TTL`: 86400 seconds (24 hours)

**Resource Requirements:**
- Memory: 512Mi request, 1Gi limit (headless Chrome is memory-hungry)
- Replicas: 1 (staging/preview), 2 (production)

**Bot User-Agents to Detect:**
- Search engines: `Googlebot`, `Bingbot`, `DuckDuckBot`, `Slurp` (Yahoo)
- Social media: `facebookexternalhit`, `Twitterbot`, `LinkedInBot`
- Messaging: `Slackbot`, `WhatsApp`, `TelegramBot`

### 2. Frontend Changes

**New Dependency:**
```bash
npm install react-helmet-async
```

**File Structure:**
```
apps/web/src/
├── components/
│   └── seo/
│       ├── SEOHead.tsx           # Wrapper for react-helmet
│       ├── OrganizationSchema.tsx # JSON-LD for Mosaic Life brand
│       └── LegacySchema.tsx      # JSON-LD for legacy profiles
├── lib/
│   └── seo/
│       └── meta.ts               # Helper to generate meta tag values
```

**SEOHead Component:**

Each page uses `<SEOHead>` to set its meta tags:

```tsx
// On Homepage
<SEOHead
  title="Mosaic Life - Honoring Lives Through Shared Stories"
  description="Create meaningful digital tributes..."
  canonicalUrl="https://mosaiclife.me"
/>

// On Legacy Profile
<SEOHead
  title={`${legacy.name} | Mosaic Life`}
  description={legacy.biography?.slice(0, 160)}
  canonicalUrl={`https://mosaiclife.me/legacy/${legacy.id}`}
  ogImage={legacy.profilePhotoUrl}
  ogType="profile"
/>
```

**Meta Tags Generated:**
- `<title>` - Page title
- `<meta name="description">` - Page description (max 160 chars)
- `<link rel="canonical">` - Canonical URL
- `<meta property="og:*">` - Open Graph (Facebook, LinkedIn)
- `<meta name="twitter:*">` - Twitter Cards
- `<meta name="robots">` - `index,follow` for public, `noindex` for private pages

### 3. Backend Changes

**New API Endpoints:**

`/sitemap.xml` - Dynamic XML sitemap:
```python
@router.get("/sitemap.xml", response_class=Response)
async def sitemap(db: AsyncSession = Depends(get_db)):
    # Static pages
    static_urls = [
        {"loc": "https://mosaiclife.me/", "priority": "1.0"},
        {"loc": "https://mosaiclife.me/about", "priority": "0.8"},
        {"loc": "https://mosaiclife.me/how-it-works", "priority": "0.8"},
        {"loc": "https://mosaiclife.me/community", "priority": "0.7"},
    ]

    # Dynamic legacy pages (public only)
    public_legacies = await get_public_legacies(db)
    legacy_urls = [
        {
            "loc": f"https://mosaiclife.me/legacy/{legacy.id}",
            "lastmod": legacy.updated_at.isoformat(),
            "priority": "0.6"
        }
        for legacy in public_legacies
    ]

    xml = render_sitemap_xml(static_urls + legacy_urls)
    return Response(content=xml, media_type="application/xml")
```

`/robots.txt` - Crawler instructions:
```python
@router.get("/robots.txt", response_class=PlainTextResponse)
async def robots():
    return """User-agent: *
Allow: /
Allow: /about
Allow: /how-it-works
Allow: /community
Allow: /legacy/

Disallow: /my-legacies
Disallow: /settings
Disallow: /api/

Sitemap: https://mosaiclife.me/sitemap.xml
"""
```

**Performance:**
- Sitemap query indexed on `is_public` flag
- Response cached for 1 hour

### 4. Structured Data (Schema.org)

**Organization Schema (all pages):**
```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Mosaic Life",
  "url": "https://mosaiclife.me",
  "logo": "https://mosaiclife.me/logo.png",
  "description": "Honor the lives and milestones that matter most. Create meaningful digital tributes for memorials, retirements, graduations, and living legacies."
}
```

**Legacy Profile Schema (`/legacy/:id` pages):**
```json
{
  "@context": "https://schema.org",
  "@type": "ProfilePage",
  "mainEntity": {
    "@type": "Person",
    "name": "Legacy Name",
    "description": "Biography...",
    "image": "profile-photo-url",
    "birthDate": "YYYY-MM-DD",
    "deathDate": "YYYY-MM-DD"
  },
  "dateCreated": "ISO8601",
  "dateModified": "ISO8601",
  "url": "https://mosaiclife.me/legacy/ID"
}
```

**GEO Benefit:**
Structured data helps AI systems (Google SGE, Bing Copilot, Perplexity) understand content for generative answers.

## Deployment

### Local Development

`infra/compose/docker-compose.yml`:
```yaml
prerender:
  image: prerender/prerender
  ports:
    - "3000:3000"
  environment:
    - CHROME_FLAGS=--no-sandbox --headless --disable-gpu --disable-dev-shm-usage
    - ALLOWED_DOMAINS=localhost
    - CACHE_MAXSIZE=1000
    - CACHE_TTL=86400
  mem_limit: 1g
  depends_on:
    - web
```

### Helm Chart

New chart at `infra/helm/prerender/`:
```
infra/helm/prerender/
├── Chart.yaml
├── values.yaml
├── templates/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── hpa.yaml
│   └── _helpers.tpl
```

### GitOps (mosaic-life-gitops repo)

ArgoCD Application manifests:
```
mosaic-life-gitops/
├── apps/
│   ├── production/
│   │   └── prerender.yaml    # namespace: mosaic-prod
│   ├── staging/
│   │   └── prerender.yaml    # namespace: mosaic-staging
│   └── preview/
│       └── prerender.yaml    # namespace: preview-pr-nn
```

### Ingress Updates

- Add bot detection middleware/annotation
- Route bots to `prerender` service
- Route humans to `web` service
- Route `/sitemap.xml` and `/robots.txt` to `core-api`

## External Setup Steps

### Google Search Console

1. Go to https://search.google.com/search-console
2. Add property: `https://mosaiclife.me`
3. Verify via DNS TXT record in Route53:
   - Record: `mosaiclife.me`
   - Type: TXT
   - Value: `google-site-verification=XXXXX`
4. Submit sitemap: `https://mosaiclife.me/sitemap.xml`
5. Request indexing of key pages

### Bing Webmaster Tools

1. Go to https://www.bing.com/webmasters
2. Import from Google Search Console (easiest) or add manually
3. Submit sitemap: `https://mosaiclife.me/sitemap.xml`

### Social Media Validation

After deployment, verify Open Graph tags:
- Facebook: https://developers.facebook.com/tools/debug/
- Twitter: https://cards-dev.twitter.com/validator
- LinkedIn: https://www.linkedin.com/post-inspector/

## Timeline Expectations

- DNS verification: Immediate
- Initial indexing: 1-7 days
- Ranking for "Mosaic Life" brand term: 2-4 weeks

## Future Enhancements (Not in Scope)

- Article schema for stories within legacies
- BreadcrumbList schema for navigation
- WebSite schema with SearchAction for sitelinks search box
- Content marketing for topic visibility (generic terms like "legacy stories")
