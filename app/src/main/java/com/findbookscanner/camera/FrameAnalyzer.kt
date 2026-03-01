package com.findbookscanner.camera

import androidx.annotation.OptIn
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.findbookscanner.ocr.TextRecognitionProcessor
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean

class FrameAnalyzer(
    private val textProcessor: TextRecognitionProcessor,
    private val onTextDetected: (List<String>) -> Unit,
    private val frameIntervalMs: Long = 1000L,
) : ImageAnalysis.Analyzer {

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private val isProcessing = AtomicBoolean(false)
    private var lastProcessedTime = 0L

    @OptIn(ExperimentalGetImage::class)
    override fun analyze(imageProxy: ImageProxy) {
        val now = System.currentTimeMillis()
        if (now - lastProcessedTime < frameIntervalMs || !isProcessing.compareAndSet(false, true)) {
            imageProxy.close()
            return
        }
        lastProcessedTime = now

        val mediaImage = imageProxy.image
        if (mediaImage == null) {
            isProcessing.set(false)
            imageProxy.close()
            return
        }

        scope.launch {
            try {
                val textBlocks = textProcessor.processImage(
                    mediaImage,
                    imageProxy.imageInfo.rotationDegrees,
                )
                if (textBlocks.isNotEmpty()) {
                    onTextDetected(textBlocks)
                }
            } catch (_: Exception) {
                // Frame processing failed, skip this frame
            } finally {
                isProcessing.set(false)
                imageProxy.close()
            }
        }
    }
}
