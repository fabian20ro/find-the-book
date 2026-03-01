function escapeCsv(field) {
    if (field == null) return '';
    const str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

export function exportToCsv(books) {
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
