export interface Book {
    id: string;
    title: string;
    authors: string[];
    publisher: string | null;
    publishedDate: string | null;
    description: string | null;
    isbn: string | null;
    pageCount: number | null;
    thumbnailUrl: string | null;
    infoLink: string | null;
    confidence: number;
}

interface GoogleBooksVolume {
    id: string;
    volumeInfo?: {
        title?: string;
        authors?: string[];
        publisher?: string;
        publishedDate?: string;
        description?: string;
        pageCount?: number;
        industryIdentifiers?: Array<{ type: string; identifier: string }>;
        imageLinks?: { thumbnail?: string };
        infoLink?: string;
        averageRating?: number;
        ratingsCount?: number;
    };
}

interface GoogleBooksResponse {
    items?: GoogleBooksVolume[];
}

/**
 * Compute a 0–100 confidence score based on metadata completeness and ratings.
 *
 * Scoring breakdown:
 *   Metadata (up to 75): title 10, authors 15, ISBN 15, thumbnail 10,
 *     description 10, publisher 5, publishedDate 5, pageCount 5
 *   Ratings (up to 25): averageRating contributes up to 15,
 *     ratingsCount contributes up to 10
 */
export function computeConfidence(
    book: Omit<Book, 'confidence'>,
    averageRating?: number,
    ratingsCount?: number,
): number {
    let score = 0;

    // Metadata completeness (up to 75)
    if (book.title && book.title !== 'Unknown Title') score += 10;
    if (book.authors.length > 0) score += 15;
    if (book.isbn) score += 15;
    if (book.thumbnailUrl) score += 10;
    if (book.description) score += 10;
    if (book.publisher) score += 5;
    if (book.publishedDate) score += 5;
    if (book.pageCount) score += 5;

    // Ratings (up to 25)
    if (averageRating != null && averageRating > 0) {
        score += Math.round((averageRating / 5) * 15);
    }
    if (ratingsCount != null && ratingsCount > 0) {
        score += Math.round(Math.min(ratingsCount, 100) / 100 * 10);
    }

    return Math.min(score, 100);
}

const MAX_CACHE_SIZE = 200;

export class BookSearcher {
    private queryCache = new Set<string>();
    private foundBookIds = new Set<string>();
    private notify: (message: string) => void;

    constructor(notify: (message: string) => void = () => {}) {
        this.notify = notify;
    }

    async search(query: string): Promise<Book[]> {
        const normalized = query.toLowerCase().trim();
        if (normalized.length < 4 || this.queryCache.has(normalized)) {
            return [];
        }

        // Bound the cache — evict oldest entry when full
        if (this.queryCache.size >= MAX_CACHE_SIZE) {
            const first = this.queryCache.values().next().value;
            if (first !== undefined) this.queryCache.delete(first);
        }
        this.queryCache.add(normalized);

        try {
            const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=3`;
            const response = await fetch(url);

            if (response.status === 429) {
                this.notify('Google Books API rate limit reached. Pausing briefly...');
                await new Promise((r) => setTimeout(r, 5000));
                // Remove from cache so it can be retried next time
                this.queryCache.delete(normalized);
                return [];
            }

            if (!response.ok) return [];
            const data: GoogleBooksResponse = await response.json();

            return (data.items || [])
                .map((item) => this.parseBook(item))
                .filter((book) => {
                    if (this.foundBookIds.has(book.id)) return false;
                    this.foundBookIds.add(book.id);
                    return true;
                });
        } catch (e) {
            console.error('Book search error:', e);
            return [];
        }
    }

    private parseBook(item: GoogleBooksVolume): Book {
        const info = item.volumeInfo || {};
        const identifiers = info.industryIdentifiers || [];
        const isbn13 = identifiers.find((id) => id.type === 'ISBN_13');
        const isbn = isbn13 ? isbn13.identifier : (identifiers[0]?.identifier || null);
        const thumbnail = info.imageLinks?.thumbnail?.replace('http://', 'https://') || null;

        const book: Omit<Book, 'confidence'> = {
            id: item.id,
            title: info.title || 'Unknown Title',
            authors: info.authors || [],
            publisher: info.publisher || null,
            publishedDate: info.publishedDate || null,
            description: info.description || null,
            isbn: isbn,
            pageCount: info.pageCount || null,
            thumbnailUrl: thumbnail,
            infoLink: info.infoLink || null,
        };

        return {
            ...book,
            confidence: computeConfidence(book, info.averageRating, info.ratingsCount),
        };
    }

    preloadBookId(bookId: string): void {
        this.foundBookIds.add(bookId);
    }

    removeBookId(bookId: string): void {
        this.foundBookIds.delete(bookId);
    }

    clear(): void {
        this.queryCache.clear();
        this.foundBookIds.clear();
    }
}
