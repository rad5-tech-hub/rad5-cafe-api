import { env } from '../config/env.js';

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

  private getFallbackImages(query: string, count: number = 12): UnsplashResult[] {
    const fallbacks: UnsplashResult[] = [];
    const searchTerm = query.toLowerCase().trim();

    const curatedImages: Record<string, string[]> = {
      coffee: [
        'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=800&auto=format&fit=crop',
      ],
      burger: [
        'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1550547660-d9450f859349?w=800&auto=format&fit=crop',
      ],
      pizza: [
        'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&auto=format&fit=crop',
      ],
      tea: [
        'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=800&auto=format&fit=crop',
      ],
      pastry: [
        'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800&auto=format&fit=crop',
      ],
      cake: [
        'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800&auto=format&fit=crop',
      ],
      water: [
        'https://images.unsplash.com/photo-1548839133-9fa0a57bd3c5?w=800&auto=format&fit=crop',
      ],
      drink: [
        'https://images.unsplash.com/photo-1497534446932-c925b458314e?w=800&auto=format&fit=crop',
      ],
      rice: [
        'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=800&auto=format&fit=crop',
      ],
      food: [
        'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=800&auto=format&fit=crop',
      ]
    };

    let matchingUrls: string[] = [];
    for (const [key, urls] of Object.entries(curatedImages)) {
      if (searchTerm.includes(key)) {
        matchingUrls.push(...urls);
      }
    }

    const hasCuratedMatch = matchingUrls.length > 0;
    if (matchingUrls.length === 0) {
      matchingUrls = curatedImages.food;
    }

    const termParam = encodeURIComponent(searchTerm);

    for (let i = 0; i < count; i++) {
      const base = matchingUrls[i % matchingUrls.length];
      
      const regular = hasCuratedMatch ? base : `https://loremflickr.com/800/600/food,cafe,drink,${termParam}?lock=${i}`;
      const small = hasCuratedMatch ? base.replace('w=800', 'w=400') : `https://loremflickr.com/400/300/food,cafe,drink,${termParam}?lock=${i}`;
      const thumb = hasCuratedMatch ? base.replace('w=800', 'w=200') : `https://loremflickr.com/200/150/food,cafe,drink,${termParam}?lock=${i}`;

      fallbacks.push({
        id: `fallback-${searchTerm}-${i}`,
        urls: { regular, small, thumb },
        alt_description: `${query} image ${i + 1}`,
        user: { name: 'Unsplash Fallback' },
      });
    }

    return fallbacks;
  }
}

export const imageService = new ImageService();
