# Scan Pipeline Robustness Plan

**Goal**: Increase the reliability and error resilience of the camera-to-search pipeline.

## Context
The current scanning process is highly dependent on a perfect chain: camera access -> frame capture -> OCR -> search. Any single failure in this chain (e.g. OCR timeout, camera disconnect, network error during search) can disrupt the state or leave the UI in an inconsistent mode.

## Bounded Surface
- `src/scanner.ts` (Orchestration)
- `src/ocr.ts` (OCR processing)
- `src/camera.ts` (Media stream management)

## Subtasks

### Tier 0
- **Unblocker: Catch all searcher errors**: Ensure `searchTextBlocks` handles search errors gracefully and reports them to the UI via `toast`.

### Tier 1
- **Worker Lifecycle Management**: Ensure that `TextRecognizer.setLanguage` or `TextRecognizer.destroy` always cleans up the worker properly even if a promise rejects.

### Tier 2
- **Pre-flight Check**: Add a method to `CameraManager` to verify camera readiness and `TextRecognizer` to verify Tesseract loading before `startScanning` is allowed to complete.
- **Stale Scan Cleanup**: Ensure `stopScanning` properly cleans up any pending `setTimeout` from `scheduleNext`.

### Tier 3
- **PWA Visibility Management**: Refine how the scanner behaves when the tab is hidden to prevent camera/microphone being left on unnecessarily.
- **Advanced OCR error categorization**: Differentiate between "No text found" and "OCR Engine error" in the UI.

## Verification
- Run `npm test` to ensure no regressions in `scanner.test.ts` and `ocr.test.ts`.
- Manual verification of camera/OCR flow in a simulated browser environment (if available).
- Verify `scanCount` increments correctly after fixing errors.
