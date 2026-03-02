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
    state.candidateFilter = '';
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
