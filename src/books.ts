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
 * Count how many words from the query appear in the book's title and authors.
 * Returns a ratio 0–1 of matched words / total query words.
 */
export function queryMatchRatio(book: Omit<Book, 'confidence'>, query: string): number {
    if (!query || query.trim().length === 0) return 0;

    const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
    if (queryWords.length === 0) return 0;

    const bookText = [
        book.title,
        ...book.authors,
    ].join(' ').toLowerCase();

    let matched = 0;
    for (const word of queryWords) {
        if (bookText.includes(word)) matched++;
    }
    return matched / queryWords.length;
}

/**
 * Compute a 0–100 confidence score based on metadata completeness, ratings,
 * and how well the book matches the original search query.
 *
 * Scoring breakdown:
 *   Metadata (up to 50): title 10, authors 10, ISBN 10, thumbnail 5,
 *     description 5, publisher 5, publishedDate 5
 *   Query match (up to 30): ratio of query words found in title+authors
 *   Ratings (up to 20): averageRating contributes up to 12,
 *     ratingsCount contributes up to 8
 */
export function computeConfidence(
    book: Omit<Book, 'confidence'>,
    averageRating?: number,
    ratingsCount?: number,
    query?: string,
): number {
    let score = 0;

    // Metadata completeness (up to 50)
    if (book.title && book.title !== 'Unknown Title') score += 10;
    if (book.authors.length > 0) score += 10;
    if (book.isbn) score += 10;
    if (book.thumbnailUrl) score += 5;
    if (book.description) score += 5;
    if (book.publisher) score += 5;
    if (book.publishedDate) score += 5;

    // Query match (up to 30)
    if (query) {
        score += Math.round(queryMatchRatio(book, query) * 30);
    }

    // Ratings (up to 20)
    if (averageRating != null && averageRating > 0) {
        score += Math.round((averageRating / 5) * 12);
    }
    if (ratingsCount != null && ratingsCount > 0) {
        score += Math.round(Math.min(ratingsCount, 100) / 100 * 8);
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
                .map((item) => this.parseBook(item, query))
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

    private parseBook(item: GoogleBooksVolume, query?: string): Book {
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
            confidence: computeConfidence(book, info.averageRating, info.ratingsCount, query),
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
