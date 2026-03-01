export class BookSearcher {
    constructor() {
        this.queryCache = new Set();
        this.foundBookIds = new Set();
    }

    async search(query) {
        const normalized = query.toLowerCase().trim();
        if (normalized.length < 4 || this.queryCache.has(normalized)) {
            return [];
        }
        this.queryCache.add(normalized);

        try {
            const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=3`;
            const response = await fetch(url);
            if (!response.ok) return [];
            const data = await response.json();

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

    parseBook(item) {
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

    removeBookId(bookId) {
        this.foundBookIds.delete(bookId);
    }

    clear() {
        this.queryCache.clear();
        this.foundBookIds.clear();
    }
}
