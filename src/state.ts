import type { Book } from './books';

export type { Book };

export type ViewMode = 'home' | 'scan';

export interface AppState {
    books: Book[];
    isScanning: boolean;
    autoScan: boolean;
    scanCount: number;
    lastDetectedText: string;
    error: string | null;
    view: ViewMode;
    isProcessingImage: boolean;
    ocrReady: boolean;
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
    isScanning: false,
    autoScan: false,
    scanCount: 0,
    lastDetectedText: '',
    error: null,
    view: 'home',
    isProcessingImage: false,
    ocrReady: false,
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

export function toast(message: string): void {
    emit('toast', message);
}
