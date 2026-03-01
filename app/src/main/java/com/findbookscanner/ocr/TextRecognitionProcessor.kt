package com.findbookscanner.ocr

import android.media.Image
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.suspendCancellableCoroutine
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

@Singleton
class TextRecognitionProcessor @Inject constructor() {

    private val recognizer: TextRecognizer =
        TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    suspend fun processImage(mediaImage: Image, rotationDegrees: Int): List<String> {
        val inputImage = InputImage.fromMediaImage(mediaImage, rotationDegrees)
        return suspendCancellableCoroutine { cont ->
            recognizer.process(inputImage)
                .addOnSuccessListener { visionText ->
                    val textBlocks = visionText.textBlocks
                        .map { it.text.trim() }
                        .filter { it.length >= 3 }
                    cont.resume(textBlocks)
                }
                .addOnFailureListener { e ->
                    cont.resumeWithException(e)
                }
        }
    }

    fun close() {
        recognizer.close()
    }
}
