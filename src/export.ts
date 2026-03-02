import type { Book } from './books';

function escapeCsv(field: string | number | null): string {
    if (field == null) return '';
    const str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

export function formatBooksAsText(books: Book[]): string {
    return books.map((book) => {
        const authors = book.authors.length > 0 ? book.authors.join(', ') : 'Unknown';
        return `${authors} - ${book.title}`;
    }).join('\n');
}

export async function shareBooks(books: Book[], notify: (msg: string) => void): Promise<void> {
    if (books.length === 0) return;

    const text = formatBooksAsText(books);

    if (navigator.share) {
        try {
            await navigator.share({ title: 'My Book Collection', text });
            return;
        } catch (err) {
            // User cancelled or share failed — fall through to clipboard
            if (err instanceof DOMException && err.name === 'AbortError') return;
            if (err instanceof Error && err.name === 'AbortError') return;
        }
    }

    try {
        await navigator.clipboard.writeText(text);
        notify('Book list copied to clipboard');
    } catch {
        notify('Could not share or copy book list');
    }
}

export function exportToCsv(books: Book[]): void {
    if (books.length === 0) return;

    const header = 'Title,Authors,ISBN,Publisher,Published Date,Page Count';
    const rows = books.map((book) => {
        return [
            escapeCsv(book.title),
            escapeCsv(book.authors.join(', ')),
            escapeCsv(book.isbn),
            escapeCsv(book.publisher),
            escapeCsv(book.publishedDate),
            escapeCsv(book.pageCount),
        ].join(',');
    });

    const csv = header + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'found_books.csv';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
