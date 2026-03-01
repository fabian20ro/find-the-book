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
    };
}

interface GoogleBooksResponse {
    items?: GoogleBooksVolume[];
}

export class BookSearcher {
    private queryCache = new Set<string>();
    private foundBookIds = new Set<string>();

    async search(query: string): Promise<Book[]> {
        const normalized = query.toLowerCase().trim();
        if (normalized.length < 4 || this.queryCache.has(normalized)) {
            return [];
        }
        this.queryCache.add(normalized);

        try {
            const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=3`;
            const response = await fetch(url);
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

        return {
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
