import { getContext2D } from './dom';

export class CameraManager {
    private video: HTMLVideoElement;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private stream: MediaStream | null = null;

    constructor(videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement) {
        this.video = videoElement;
        this.canvas = canvasElement;
        this.ctx = getContext2D(canvasElement);
    }

    async start(onDisconnect?: () => void): Promise<void> {
        const constraints: MediaStreamConstraints = {
            video: {
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 },
            },
            audio: false,
        };

        try {
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
            if (err instanceof DOMException && err.name === 'NotAllowedError') {
                throw new Error('Camera permission denied. Please allow camera access and try again.');
            }
            throw new Error('Could not access camera. Ensure no other app is using it.');
        }

        this.video.srcObject = this.stream;

        // Wait for video to be ready
        await new Promise<void>((resolve) => {
            this.video.onloadedmetadata = () => {
                this.canvas.width = this.video.videoWidth;
                this.canvas.height = this.video.videoHeight;
                resolve();
            };
        });

        // Listen for camera disconnection
        const track = this.stream.getVideoTracks()[0];
        if (track && onDisconnect) {
            track.addEventListener('ended', () => {
                console.warn('Camera track ended (disconnected or revoked)');
                onDisconnect();
            });
        }
    }

    captureFrame(): HTMLCanvasElement | null {
        if (!this.video.videoWidth) return null;
        this.ctx.drawImage(this.video, 0, 0);
        return this.canvas;
    }

    stop(): void {
        if (this.stream) {
            this.stream.getTracks().forEach((track) => track.stop());
            this.stream = null;
        }
    }
}
