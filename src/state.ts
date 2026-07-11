import type { Book } from './books';

export type { Book };

export type ViewMode = 'home' | 'scan';

export interface AppState {
    books: Book[];
    candidateBooks: Book[];
    candidateFilter: string;
    isScanning: boolean;
    autoScan: boolean;
    scanCount: number;
    lastDetectedText: string;
    error: string | null;
    view: ViewMode;
    isProcessingImage: boolean;
    ocrReady: boolean;
    ocrLanguage: string;
    isChangingLanguage: boolean;
}

// --- Typed event emitter ---

interface EventMap {
    change: void;
    toast: string;
}

type EventType = keyof EventMap;
type Listener<K extends EventType> = EventMap[K] extends void ? () => void : (data: EventMap[K]) => void;

const listeners = new Map<EventType, Set<Listener<EventType>>>();

export function on<K extends EventType>(event: K, fn: Listener<K>): () => void {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(fn as Listener<EventType>);
    return () => { listeners.get(event)!.delete(fn as Listener<EventType>); };
}

export function emit<K extends EventType>(event: K, ...args: EventMap[K] extends void ? [] : [EventMap[K]]): void {
    listeners.get(event)?.forEach((fn) => (fn as (...a: unknown[]) => void)(...args));
}

// --- State container ---

const state: AppState = {
    books: [],
    candidateBooks: [],
    candidateFilter: '',
    isScanning: false,
    autoScan: false,
    scanCount: 0,
    lastDetectedText: '',
    error: null,
    view: 'home',
    isProcessingImage: false,
    ocrReady: false,
    ocrLanguage: 'ron',
    isChangingLanguage: false,
};

export function getState(): Readonly<AppState> {
    return state;
}

export function update(patch: Partial<AppState>): void {
    let changed = false;
    for (const key of Object.keys(patch)) {
        const k = key as keyof AppState;
        if (patch[k] !== state[k]) {
            (state as any)[k] = patch[k];
            changed = true;
        }
    }
    if (changed) {
        emit('change');
    }
}

/**
 * Trim all string fields on a book to prevent whitespace-only or padded values
 * from leaking into the UI. Consistent with LESSONS_LEARNED normalization rules.
 */
function normalizeBook(book: Book): Book {
    return {
        ...book,
        id: book.id.trim(),
        title: book.title.trim(),
        authors: book.authors.map((a) => a.trim()).filter((a) => a.length > 0),
        isbn: book.isbn?.trim() || null,
        publisher: book.publisher?.trim() || null,
        publishedDate: book.publishedDate?.trim() || null,
        description: book.description?.trim() || null,
        thumbnailUrl: book.thumbnailUrl?.trim() || null,
        infoLink: book.infoLink?.trim() || null,
    };
}

export function addBook(book: Book): boolean {
    const normalized = normalizeBook(book);
    if (state.books.some((b) => b.id === normalized.id)) return false;

    state.books.push(normalized);
    emit('change');
    return true;
}

export function removeBook(index: number): Book | null {
    if (index < 0 || index >= state.books.length) return null;
    const removed = state.books.splice(index, 1)[0];
    emit('change');
    return removed;
}

export function moveBook(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= state.books.length) return;
    if (toIndex < 0 || toIndex >= state.books.length) return;
    const [book] = state.books.splice(fromIndex, 1);
    state.books.splice(toIndex, 0, book);
    emit('change');
}

export function clearBooks(): void {
    state.books.length = 0;
    state.candidateFilter = '';
    emit('change');
}

/** Switch the root view between 'home' and 'scan'. */
export function setView(mode: ViewMode): void {
    update({ view: mode });
}

export function addCandidates(books: Book[]): void {
    let added = false;
    for (const book of books) {
        const normalized = normalizeBook(book);

        const isDuplicate = state.candidateBooks.some((c) => c.id === normalized.id)
            || state.books.some((b) => b.id === normalized.id);
        if (!isDuplicate) {
            state.candidateBooks.push(normalized);
            added = true;
        }
    }
    if (added) {
        emit('change');
    }
}

export function removeCandidateById(bookId: string): void {
    const trimmedId = bookId.trim();
    let index = -1;
    for (let i = 0; i < state.candidateBooks.length; i++) {
        if (state.candidateBooks[i].id === trimmedId) {
            index = i;
            break;
        }
    }
    if (index !== -1) {
        state.candidateBooks.splice(index, 1);
        emit('change');
    }
}

export function clearCandidates(): void {
    state.candidateBooks.length = 0;
    state.candidateFilter = '';
    emit('change');
}

export function toast(message: string): void {
    emit('toast', message);
}
