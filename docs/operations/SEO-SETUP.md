# SEO External Setup Guide

This document covers the manual steps required to complete SEO setup after deploying the code changes.

## Prerequisites

- Code deployed with SEO endpoints (`/sitemap.xml`, `/robots.txt`)
- Prerender service deployed and running
- Access to DNS management (Route53)
- Access to Google and Bing accounts

## 1. Google Search Console Setup

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Click "Add Property"
3. Select "URL prefix" and enter: `https://mosaiclife.me`
4. Choose "DNS verification" (recommended)
5. Add TXT record to Route53:
   - Name: `mosaiclife.me`
   - Type: `TXT`
   - Value: `google-site-verification=XXXXX` (provided by Google)
6. Wait for DNS propagation (up to 24 hours, usually minutes)
7. Click "Verify" in Google Search Console
8. After verification:
   - Go to "Sitemaps" in the left menu
   - Enter: `sitemap.xml`
   - Click "Submit"

## 2. Bing Webmaster Tools Setup

1. Go to [Bing Webmaster Tools](https://www.bing.com/webmasters)
2. Click "Add a site"
3. Option A (easier): Click "Import from Google Search Console"
4. Option B (manual):
   - Enter: `https://mosaiclife.me`
   - Add DNS TXT record similar to Google
5. After verification:
   - Go to "Sitemaps"
   - Submit: `https://mosaiclife.me/sitemap.xml`

## 3. Verify Social Sharing

After deployment, test that social previews work:

1. **Facebook**: https://developers.facebook.com/tools/debug/
   - Enter: `https://mosaiclife.me`
   - Click "Debug"
   - Verify og:title, og:description, og:image appear

2. **Twitter**: https://cards-dev.twitter.com/validator
   - Enter: `https://mosaiclife.me`
   - Verify card preview appears

3. **LinkedIn**: https://www.linkedin.com/post-inspector/
   - Enter: `https://mosaiclife.me`
   - Verify preview appears

## 4. Monitor Indexing

After setup, monitor indexing progress:

- **Google**: Search Console → Coverage report
- **Bing**: Webmaster Tools → Site Activity

Expected timeline:
- DNS verification: Immediate to 24 hours
- Initial indexing: 1-7 days
- Brand term ranking: 2-4 weeks

## Troubleshooting

### Social previews not showing
- Verify prerender service is running
- Check that bot User-Agent is being routed to prerender
- Use browser dev tools to check meta tags

### Sitemap not being read
- Verify `/sitemap.xml` returns valid XML
- Check robots.txt includes Sitemap directive
- Re-submit sitemap in Search Console

### Pages not being indexed
- Check robots.txt isn't blocking the page
- Verify page returns 200 status
- Request manual indexing in Search Console
