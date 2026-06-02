import { env } from '../config/env';

interface UnsplashResult {
  id: string;
  urls: { regular: string; small: string; thumb: string };
  alt_description: string;
  user: { name: string };
}

export class ImageService {
  async searchImages(query: string, perPage: number = 10): Promise<UnsplashResult[]> {
    if (!env.unsplash.accessKey) {
      return this.getFallbackImages(query, perPage);
    }

    try {
      const url = new URL('https://api.unsplash.com/search/photos');
      url.searchParams.set('query', `${query} food drink cafe`);
      url.searchParams.set('per_page', String(perPage));

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Client-ID ${env.unsplash.accessKey}`,
          'Accept-Version': 'v1',
        },
      });

      if (!response.ok) {
        console.warn(`Unsplash API error: ${response.status}. Using fallback images.`);
        return this.getFallbackImages(query, perPage);
      }

      const data = await response.json() as { results: UnsplashResult[] };
      return data.results.map(r => ({
        id: r.id,
        urls: r.urls,
        alt_description: r.alt_description || query,
        user: r.user,
      }));
    } catch (error) {
      console.warn('Unsplash search failed:', error);
      return this.getFallbackImages(query, perPage);
    }
  }

  private getFallbackImages(query: string, count: number = 10): UnsplashResult[] {
    const fallbacks: UnsplashResult[] = [];
    const searchTerm = encodeURIComponent(query);

    for (let i = 0; i < count; i++) {
      fallbacks.push({
        id: `fallback-${i}`,
        urls: {
          regular: `https://source.unsplash.com/800x600/?${searchTerm}&sig=${i}`,
          small: `https://source.unsplash.com/400x300/?${searchTerm}&sig=${i}`,
          thumb: `https://source.unsplash.com/200x150/?${searchTerm}&sig=${i}`,
        },
        alt_description: `${query} image ${i + 1}`,
        user: { name: 'Unsplash' },
      });
    }

    return fallbacks;
  }
}

export const imageService = new ImageService();
