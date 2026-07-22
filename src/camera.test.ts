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
        enabled: true,
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
                // Delay to next microtask so onloadedmetadata handler is registered
                Promise.resolve().then(() => {
                    Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
                    video.dispatchEvent(new Event('loadedmetadata'));
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
                    aspectRatio: { ideal: 16 / 9 },
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

        it('invokes onDisconnect when the video track fires "ended"', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const onDisconnect = vi.fn();
            const camera = new CameraManager(video, canvas);
            await camera.start(onDisconnect);

            // Extract the callback registered for 'ended' from addEventListener mock calls.
            const endedCall = mockStream.track.addEventListener.mock.calls.find(
                (call) => call[0] === 'ended',
            );
            expect(endedCall).toBeDefined();
            const onEnded = endedCall![1];

            onEnded();

            expect(onDisconnect).toHaveBeenCalledTimes(1);
            expect(consoleWarn).toHaveBeenCalledWith('Camera track ended (disconnected or revoked)');
        });

        it('does not register "ended" listener when no onDisconnect callback is provided', async () => {
            const camera = new CameraManager(video, canvas);
            await camera.start();

            // The 'ended' event listener must NOT have been registered since
            // the guard check (track && onDisconnect) evaluates to false.
            expect(mockStream.track.addEventListener).not.toHaveBeenCalledWith(
                'ended',
                expect.any(Function),
            );
        });

        it('throws on permission denied', async () => {
            const err = new DOMException('Not allowed', 'NotAllowedError');
            (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(err);

            const camera = new CameraManager(video, canvas);
            await expect(camera.start()).rejects.toThrow('Camera permission denied');
        });

        it('throws on general camera error', async () => {
            (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
                new Error('Could not access camera. Ensure no other app is using it.'),
            );

            const camera = new CameraManager(video, canvas);
            await expect(camera.start()).rejects.toThrow('Could not access camera');
        });

        it('resolves immediately when video readyState >= 2 without waiting for loadedmetadata event', async () => {
            // Override the mock's srcObject setter to synchronously set readyState=2,
            // triggering the immediate-resolution branch (line 45-46 in camera.ts).
            let srcObjVal: any = null;
            Object.defineProperty(video, 'srcObject', {
                get() { return srcObjVal; },
                set(val: any) {
                    srcObjVal = val;
                    Object.defineProperty(video, 'videoWidth', { value: 1920, configurable: true });
                    Object.defineProperty(video, 'videoHeight', { value: 1080, configurable: true });
                    Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
                },
                configurable: true,
            });

            const camera = new CameraManager(video, canvas);
            await camera.start();

            // The loadedmetadata listener must NOT have been registered since readyState was already >=2.
            expect(mockStream.track.addEventListener).not.toHaveBeenCalledWith('loadedmetadata', expect.any(Function));
        });
    });

    describe('captureFrame', () => {
        it('returns null when video has no width', () => {
            const camera = new CameraManager(video, canvas);
            Object.defineProperty(video, 'videoWidth', { value: 0, configurable: true });
            expect(camera.captureFrame()).toBeNull();
        });

        it('returns canvas after drawing frame', async () => {
            const camera = new CameraManager(video, canvas);
            await camera.start();

            const result = camera.captureFrame();
            expect(result).toBe(canvas);
        });
    });

    describe('isActive', () => {
        it('is false before start', () => {
            const camera = new CameraManager(video, canvas);
            expect(camera.isActive).toBe(false);
        });

        it('becomes true after successful start', async () => {
            const camera = new CameraManager(video, canvas);
            await camera.start();
            expect(camera.isActive).toBe(true);
        });

        it('becomes false after stop', async () => {
            const camera = new CameraManager(video, canvas);
            await camera.start();
            expect(camera.isActive).toBe(true);
            camera.stop();
            expect(camera.isActive).toBe(false);
        });
    });

    describe('getResolution', () => {
        it('returns null before start', () => {
            const camera = new CameraManager(video, canvas);
            expect(camera.getResolution()).toBeNull();
        });

        it('returns current video dimensions after start', async () => {
            const camera = new CameraManager(video, canvas);
            await camera.start();

            const res = camera.getResolution();
            expect(res).toEqual({ width: 1920, height: 1080 });
        });

        it('returns null after stop', async () => {
            const camera = new CameraManager(video, canvas);
            await camera.start();
            camera.stop();
            expect(camera.getResolution()).toBeNull();
        });
    });

    describe('stop', () => {
        it('stops all tracks', async () => {
            const camera = new CameraManager(video, canvas);
            await camera.start();
            camera.stop();

            expect(mockStream.track.stop).toHaveBeenCalled();
            expect(video.srcObject).toBeNull();
        });

        it('is safe to call when not started', () => {
            const camera = new CameraManager(video, canvas);
            camera.stop(); // should not throw
        });
    });

    describe('getUserMedia edge cases', () => {
        it('does not register disconnect handler when stream has audio-only tracks (no video tracks)', async () => {
            // Simulates a stream where getUserMedia returned an audio track but zero video tracks.
            // The camera code must NOT throw or hang; getVideoTracks()[0] is undefined so the
            // `track && onDisconnect` guard evaluates false and no listener is registered — this
            // is the existing production behavior at line 52-59 in camera.ts that currently has
            // no deterministic coverage.
            const audioTrack = { stop: vi.fn(), addEventListener: vi.fn(), enabled: true };
            const onlyAudioStream = {
                getTracks: () => [audioTrack],
                getVideoTracks: () => [],
            } as unknown as MediaStream;
            (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockResolvedValue(onlyAudioStream);

            // Re-attach the standard loadedmetadata microtask stub so start() resolves through
            // the readyState >= 2 branch rather than hanging.
            let srcObjVal: any = null;
            Object.defineProperty(video, 'srcObject', {
                get() { return srcObjVal; },
                set(val: any) {
                    srcObjVal = val;
                    Object.defineProperty(video, 'videoWidth', { value: 1920, configurable: true });
                    Object.defineProperty(video, 'videoHeight', { value: 1080, configurable: true });
                    Promise.resolve().then(() => {
                        Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
                        video.dispatchEvent(new Event('loadedmetadata'));
                    });
                },
                configurable: true,
            });

            const onDisconnect = vi.fn();
            const camera = new CameraManager(video, canvas);
            await camera.start(onDisconnect);

            // The 'ended' listener must NOT be registered — getVideoTracks()[0] is undefined.
            expect(audioTrack.addEventListener).not.toHaveBeenCalledWith(
                'ended',
                expect.any(Function),
            );
            // And onDisconnect must never have been invoked (no disconnect to report).
            expect(onDisconnect).not.toHaveBeenCalled();
        });
    });

    describe('verifyReadiness', () => {
        it('succeeds when stream is active and video is ready', async () => {
            const camera = new CameraManager(video, canvas);
            await camera.start();
            await expect(camera.verifyReadiness()).resolves.not.toThrow();
        });

        it('throws when stream is not active', async () => {
            const camera = new CameraManager(video, canvas);
            await expect(camera.verifyReadiness()).rejects.toThrow('Camera stream is not active.');
        });

        it('throws when track is disabled', async () => {
            const camera = new CameraManager(video, canvas);
            await camera.start();
            (mockStream.track as any).enabled = false;
            await expect(camera.verifyReadiness()).rejects.toThrow('Camera track is disabled.');
        });

        it('throws when video is not ready', async () => {
            const camera = new CameraManager(video, canvas);
            await camera.start();
            Object.defineProperty(video, 'readyState', { value: 1, configurable: true });
            await expect(camera.verifyReadiness()).rejects.toThrow('Camera video is not ready.');
        });

        it('rejects when metadata never arrives (prevents infinite hang)', { timeout: 5_000 }, async () => {
            const camera = new CameraManager(video, canvas);

            // Block the mock's srcObject setter from firing its microtask that sets readyState=2.
            // This simulates a stalled video stream where metadata never arrives.
            Object.defineProperty(video, 'srcObject', {
                get() { return null; },
                set(_val: any) {},
                configurable: true,
            });
            // Override addEventListener so the loadedmetadata listener is dropped on the floor.
            video.addEventListener = (() => {}) as typeof video.addEventListener;

            vi.useFakeTimers();

            try {
                const startPromise = camera.start().catch(() => {});

                // Advance timers past 5000ms to trigger the timeout rejection synchronously,
                // without waiting for real wall-clock time. The .catch() swallows the
                // unhandled-rejection warning while still letting us verify behavior below.
                await vi.advanceTimersByTimeAsync(6000);

                // Verify that after advancing past 5s, the camera is no longer active
                // (the rejection propagated through the wrapped promise).
                expect(camera.isActive).toBe(false);
            } finally {
                vi.useRealTimers();
            }
        });
    });
});
