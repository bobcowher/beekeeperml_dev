import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://beekeeperml.dev',
  integrations: [
    starlight({
      title: 'BeekeeperML',
      social: {
        github: 'https://github.com/bobcowher/beekeeper',
      },
      sidebar: [
        { label: 'Getting Started', slug: 'docs/getting-started' },
        { label: 'Projects', slug: 'docs/projects' },
        { label: 'Training', slug: 'docs/training' },
        { label: 'MCP Server', slug: 'docs/mcp-server' },
        { label: 'API Reference', slug: 'docs/api-reference' },
      ],
      components: {
        SiteTitle: './src/components/docs/SiteTitle.astro',
        SocialIcons: './src/components/docs/SocialIcons.astro',
      },
      customCss: ['./src/styles/starlight-overrides.css'],
    }),
  ],
});
