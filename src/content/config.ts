import { defineCollection, z } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({ schema: docsSchema() }),
  blog: defineCollection({
    schema: z.object({
      title: z.string(),
      date: z.date(),
      description: z.string(),
      youtubeId: z.string().optional(),
    }),
  }),
};
