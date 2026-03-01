import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CameraManager } from './camera';

// Mock the dom module's getContext2D since jsdom doesn't support canvas
vi.mock('./dom', () => {
    const mockCtx = {
        drawImage: vi.fn(),
    };
    return {
        $: vi.fn(),
        $as: vi.fn(),
        getContext2D: vi.fn().mockReturnValue(mockCtx),
    };
});

function createMockStream() {
    const track = {
        stop: vi.fn(),
        addEventListener: vi.fn(),
    };
    return {
        stream: {
            getTracks: () => [track],
            getVideoTracks: () => [track],
        } as unknown as MediaStream,
        track,
    };
}

describe('CameraManager', () => {
    let video: HTMLVideoElement;
    let canvas: HTMLCanvasElement;
    let mockStream: ReturnType<typeof createMockStream>;

    beforeEach(() => {
        video = document.createElement('video');
        canvas = document.createElement('canvas');
        mockStream = createMockStream();

        vi.stubGlobal('navigator', {
            ...navigator,
            mediaDevices: {
                getUserMedia: vi.fn().mockResolvedValue(mockStream.stream),
            },
        });

        // Trigger onloadedmetadata asynchronously when srcObject is set.
        // camera.ts sets srcObject first, then assigns onloadedmetadata,
        // so we must delay the trigger to let the handler be registered.
        let srcObjectValue: any = null;
        Object.defineProperty(video, 'srcObject', {
            get() { return srcObjectValue; },
            set(val: any) {
                srcObjectValue = val;
                Object.defineProperty(video, 'videoWidth', { value: 1920, configurable: true });
                Object.defineProperty(video, 'videoHeight', { value: 1080, configurable: true });
                // Delay to next microtask so onloadedmetadata handler is set first
                Promise.resolve().then(() => {
                    if (video.onloadedmetadata) {
                        video.onloadedmetadata(new Event('loadedmetadata'));
                    }
                });
            },
            configurable: true,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('start', () => {
        it('requests environment-facing camera', async () => {
            const camera = new CameraManager(video, canvas);
            await camera.start();

            expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                },
                audio: false,
            });
        });

        it('sets canvas dimensions to video dimensions', async () => {
            const camera = new CameraManager(video, canvas);
            await camera.start();

            expect(canvas.width).toBe(1920);
            expect(canvas.height).toBe(1080);
        });

        it('registers disconnect handler on video track', async () => {
            const onDisconnect = vi.fn();
            const camera = new CameraManager(video, canvas);
            await camera.start(onDisconnect);

            expect(mockStream.track.addEventListener).toHaveBeenCalledWith('ended', expect.any(Function));
        });

        it('throws on permission denied', async () => {
            const err = new DOMException('Not allowed', 'NotAllowedError');
            (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(err);

            const camera = new CameraManager(video, canvas);
            await expect(camera.start()).rejects.toThrow('Camera permission denied');
        });

        it('throws on general camera error', async () => {
            (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
                new Error('Device busy'),
            );

            const camera = new CameraManager(video, canvas);
            await expect(camera.start()).rejects.toThrow('Could not access camera');
        });
    });

    describe('captureFrame', () => {
        it('returns null when video has no width', () => {
            Object.defineProperty(video, 'videoWidth', { value: 0, configurable: true });
            const camera = new CameraManager(video, canvas);
            expect(camera.captureFrame()).toBeNull();
        });

        it('returns canvas after drawing frame', async () => {
            const camera = new CameraManager(video, canvas);
            await camera.start();

            const result = camera.captureFrame();
            expect(result).toBe(canvas);
        });
    });

    describe('stop', () => {
        it('stops all tracks', async () => {
            const camera = new CameraManager(video, canvas);
            await camera.start();
            camera.stop();

            expect(mockStream.track.stop).toHaveBeenCalled();
        });

        it('is safe to call when not started', () => {
            const camera = new CameraManager(video, canvas);
            camera.stop(); // should not throw
        });
    });
});
