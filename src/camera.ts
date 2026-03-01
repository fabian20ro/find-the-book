export class CameraManager {
    private video: HTMLVideoElement;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private stream: MediaStream | null = null;

    constructor(videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement) {
        this.video = videoElement;
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d')!;
    }

    async start(): Promise<void> {
        const constraints: MediaStreamConstraints = {
            video: {
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 },
            },
            audio: false,
        };

        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.video.srcObject = this.stream;

        // Wait for video to be ready
        await new Promise<void>((resolve) => {
            this.video.onloadedmetadata = () => {
                this.canvas.width = this.video.videoWidth;
                this.canvas.height = this.video.videoHeight;
                resolve();
            };
        });
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
