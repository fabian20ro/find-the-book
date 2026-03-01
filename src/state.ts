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

// --- Lightweight event emitter ---

type EventType = 'change' | 'toast';
type Listener = (data?: any) => void;

const listeners = new Map<EventType, Set<Listener>>();

export function on(event: EventType, fn: Listener): () => void {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(fn);
    return () => { listeners.get(event)!.delete(fn); };
}

export function emit(event: EventType, data?: any): void {
    listeners.get(event)?.forEach((fn) => fn(data));
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
    Object.assign(state, patch);
    emit('change');
}

export function addBook(book: Book): boolean {
    if (state.books.some((b) => b.id === book.id)) return false;
    state.books.push(book);
    emit('change');
    return true;
}

export function removeBook(index: number): Book | null {
    if (index < 0 || index >= state.books.length) return null;
    const removed = state.books.splice(index, 1)[0];
    emit('change');
    return removed;
}

export function clearBooks(): void {
    state.books = [];
    emit('change');
}

export function addCandidates(books: Book[]): void {
    let added = false;
    for (const book of books) {
        const isDuplicate = state.candidateBooks.some((c) => c.id === book.id)
            || state.books.some((b) => b.id === book.id);
        if (!isDuplicate) {
            state.candidateBooks.push(book);
            added = true;
        }
    }
    if (added) {
        emit('change');
    }
}

export function removeCandidateById(bookId: string): void {
    state.candidateBooks = state.candidateBooks.filter((c) => c.id !== bookId);
    emit('change');
}

export function clearCandidates(): void {
    state.candidateBooks = [];
    state.candidateFilter = '';
    emit('change');
}

export function toast(message: string): void {
    emit('toast', message);
}
