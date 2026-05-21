import { describe, it, expect, beforeAll } from 'vitest';

describe('parsing stored books', () => {
    let parseStoredBooks: (s: string | null) => any;

    beforeAll(async () => {
        document.body.innerHTML = `
            <div id="home-view" hidden>
                <div id="ocr-status"></div>
                <div id="home-processing" hidden></div>
                <div id="home-book-count"></div>
                <div id="home-book-list"></div>
                <button id="btn-home-share"></button>
                <button id="btn-home-export"></button>
                <button id="btn-home-clear"></button>
                <button id="btn-start-camera"></button>
                <button id="btn-upload-image"></button>
                <input type="file" id="photo-input" hidden accept="image/*">
            </div>
            <div id="scan-view" hidden>
                <video id="camera"></video>
                <canvas id="capture"></canvas>
                <div id="status-overlay"></div>
                <div id="scan-count"></div>
                <div id="scan-status"></div>
                <div id="last-text"></div>
                <button id="btn-back"></button>
                <button id="auto-scan-switch" disabled></button>
                <button id="btn-scan-now"></button>
                <div id="scan-book-count"></div>
            </div>
            <div id="book-popup" hidden>
                <div class="book-popup-backdrop"></div>
                <h2 class="book-popup-title"></h2>
                <div id="book-popup-list"></div>
                <button id="btn-popup-dismiss"></button>
                <input type="text" id="candidate-search">
            </div>
            <div id="language-selector" hidden>
                <div class="lang-grid"></div>
            </div>
            <div id="error-overlay" hidden>
                <div id="error-message"></div>
                <button id="btn-retry"></button>
            </div>
        `;
        const module = await import('./app');
        parseStoredBooks = module.parseStoredBooks;
    });

    it('returns empty array for null or undefined input', () => {
        expect(parseStoredBooks(null)).toEqual([]);
        // @ts-ignore: testing runtime robustness
        expect(parseStoredBooks(undefined)).toEqual([]);
    });
});
