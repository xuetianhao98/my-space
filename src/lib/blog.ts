import { getCollection } from "astro:content";
import type { CollectionEntry } from "astro:content";

export type BlogPost = CollectionEntry<"blog">;

export async function getPublishedPosts(): Promise<BlogPost[]> {
  const posts = await getCollection("blog", ({ data }) => {
    return import.meta.env.PROD ? data.draft !== true : true;
  });

  return posts.sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
