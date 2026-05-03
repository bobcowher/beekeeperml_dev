# Blog — Design Spec

**Date:** 2026-05-03
**Status:** Approved

## Goal

Add a `/blog` section to the BeekeeperML marketing site. Primarily for dev log posts (video + short text). Text-only posts supported. Four initial posts, all video-backed.

## Architecture

Astro content collections (`src/content/blog/*.md`) with schema validation. Two new routes: `/blog` (index) and `/blog/[slug]` (post). Both use `MarketingLayout` — not Starlight. Nav gets a "Blog" link.

## Frontmatter Schema

```ts
blog: defineCollection({
  schema: z.object({
    title: z.string(),
    date: z.date(),
    description: z.string(),
    youtubeId: z.string().optional(),
  }),
})
```

- `youtubeId` is optional — text-only posts omit it
- `date` uses Astro's `z.date()` — format in markdown: `YYYY-MM-DD`
- `description` is the excerpt shown on the index listing

## File Structure

```
src/
├── content/
│   ├── config.ts                      ← add blog collection alongside docs
│   └── blog/
│       ├── introducing-beekeeper.md
│       ├── homelab-ml-workloads.md
│       ├── agentic-dev-workflow.md
│       └── parallel-training-mcp.md
└── pages/
    └── blog/
        ├── index.astro                ← blog listing page
        └── [slug].astro               ← individual post page
src/components/Nav.astro               ← add Blog link after Download
```

## Blog Index Page (`/blog`)

- Uses `MarketingLayout`
- Posts sorted newest-first
- Each post renders as a horizontal row:
  - **Left (160px, 16:9):** YouTube thumbnail from `https://img.youtube.com/vi/{youtubeId}/hqdefault.jpg` — only rendered if `youtubeId` is present
  - **Right:** date (muted, small), title (bold), description (muted)
  - Entire row is wrapped in a single `<a>` linking to `/blog/{slug}` — not separate links for image and text
- No image slot for text-only posts — text column spans full width
- Max content width 720px, consistent with other marketing pages

## Post Page (`/blog/[slug]`)

- Uses `MarketingLayout`
- Layout (top to bottom):
  1. Title (`h1`)
  2. Date (muted, small)
  3. If `youtubeId` present: full-width responsive 16:9 `<iframe>` embed (`https://www.youtube.com/embed/{youtubeId}`)
  4. Rendered markdown body
- Max content width 720px
- Responsive iframe: wrapper `div` with `padding-bottom: 56.25%` and `position: relative`; iframe fills it absolutely

## Nav Change

Add `{ href: '/blog', label: 'Blog' }` to `navLinks` in `Nav.astro`, between "Download" and "Docs".

## Initial Posts

All four are video posts. Slugs are derived from filenames by Astro.

| File | Title | YouTube ID | Date |
|---|---|---|---|
| `introducing-beekeeper.md` | Introducing Beekeeper - A tool for remote Reinforcement Learning | `O1xe65gJsxw` | 2026-02-17 |
| `homelab-ml-workloads.md` | Running ML workloads on your homelab server - Beekeeper 1.0.2 Update | `FHr1qDSEbxQ` | 2026-03-19 |
| `agentic-dev-workflow.md` | Agentic development workflow for ML...with Beekeeper | `c15inS3IS58` | 2026-03-28 |
| `parallel-training-mcp.md` | Beekeeper Update - Parallel Training + MCP | `k82onPCEuBc` | 2026-05-01 |

Descriptions for each post (short excerpt for the index listing — implementer writes these based on video content):
- **introducing-beekeeper:** "Beekeeper is a lightweight web app for running AI training on a remote home lab server. This video introduces the project and shows how to get started."
- **homelab-ml-workloads:** "Version 1.0.2 adds setup scripts, automatic pip installs, and a better status page. A walkthrough of running real ML workloads on home lab hardware."
- **agentic-dev-workflow:** "An early look at agentic development workflows for ML projects using Beekeeper hooks — letting AI agents control training runs directly."
- **parallel-training-mcp:** "The MCP server and parallel training runs are live. Connect Claude or any MCP-compatible agent to your training server and run multiple branches simultaneously."

## Visual Regression

After implementation, run `npm run test:visual:update` to capture the new `/blog` index and a post page as new baselines. Add both URLs to `pages.spec.ts`.
