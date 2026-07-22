import type { Book } from './books';

function escapeCsv(field: string | number | null): string {
    if (field == null) return '';
    const str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

export function formatBooksAsText(books: Book[]): string {
    const header = '# My Book Collection';
    const lines = books.map((book) => {
        const authors = book.authors.length > 0 ? book.authors.join(', ') : 'Unknown';
        const parts: string[] = [`${authors} - ${book.title}`];

        if (book.isbn) {
            parts.push(`ISBN: ${book.isbn}`);
        }
        if (book.pageCount != null && book.pageCount > 0) {
            parts.push(`${book.pageCount} pages`);
        }

        return parts.join(' | ');
    });

    return lines.length > 0 ? header + '\n' + lines.join('\n') : header;
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
        return;
    } catch {
        // Clipboard unavailable — offer a browser-window fallback so the user can still copy manually
        const win = window.open('', '_blank', 'width=500,height=400,scrollbars=yes');
        if (win) {
            try {
                win.document.open();
                win.document.write(
                    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>My Book Collection</title>' +
                    '<style>body{font-family:system-ui,sans-serif;max-width:500px;margin:20px;padding:16px;background:#fafafa;color:#1a1a1a}' +
                    'h2{margin-top:0;font-size:1.1rem}</style></head><body>' +
                    '<h2>My Book Collection</h2><pre id="content">' + escapeHtml(text) + '</pre>' +
                    '<p style="font-size:.85rem;color:#666">Select the text above and copy it.</p></body></html>'
                );
                win.document.close();
            } catch {
                notify('Could not share or copy book list');
            }
        } else {
            notify('Could not share or copy book list');
        }
    }
}

function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
