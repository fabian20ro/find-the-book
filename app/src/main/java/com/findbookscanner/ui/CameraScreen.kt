package com.findbookscanner.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.findbookscanner.camera.FrameAnalyzer
import com.findbookscanner.ocr.TextRecognitionProcessor
import java.util.concurrent.Executors

@Composable
fun CameraScreen(
    viewModel: BookScannerViewModel,
    textProcessor: TextRecognitionProcessor,
    uiState: ScannerUiState,
) {
    val context = LocalContext.current
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    if (hasCameraPermission) {
        Box(modifier = Modifier.fillMaxSize()) {
            CameraPreview(
                isScanning = uiState.isScanning,
                textProcessor = textProcessor,
                onTextDetected = viewModel::onTextDetected,
            )

            // Status bar at top
            StatusOverlay(
                scanCount = uiState.scanCount,
                lastText = uiState.lastDetectedText,
                modifier = Modifier.align(Alignment.TopCenter),
            )

            // Book list overlay at bottom
            BookListOverlay(
                books = uiState.detectedBooks,
                isScanning = uiState.isScanning,
                onToggleScanning = viewModel::toggleScanning,
                onRemoveBook = viewModel::removeBook,
                onClearAll = viewModel::clearAll,
                onExport = { viewModel.exportBooks(context) },
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }
    } else {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "Camera permission is required to scan books.\nPlease grant the permission in Settings.",
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(32.dp),
            )
        }
    }
}

@Composable
private fun CameraPreview(
    isScanning: Boolean,
    textProcessor: TextRecognitionProcessor,
    onTextDetected: (List<String>) -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }

    DisposableEffect(Unit) {
        onDispose { cameraExecutor.shutdown() }
    }

    AndroidView(
        factory = { ctx ->
            val previewView = PreviewView(ctx)
            val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)

            cameraProviderFuture.addListener({
                val cameraProvider = cameraProviderFuture.get()

                val preview = Preview.Builder().build().also {
                    it.surfaceProvider = previewView.surfaceProvider
                }

                val imageAnalysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()

                val analyzer = FrameAnalyzer(
                    textProcessor = textProcessor,
                    onTextDetected = onTextDetected,
                )
                imageAnalysis.setAnalyzer(cameraExecutor, analyzer)

                try {
                    cameraProvider.unbindAll()
                    cameraProvider.bindToLifecycle(
                        lifecycleOwner,
                        CameraSelector.DEFAULT_BACK_CAMERA,
                        preview,
                        imageAnalysis,
                    )
                } catch (_: Exception) {
                    // Camera binding failed
                }
            }, ContextCompat.getMainExecutor(ctx))

            previewView
        },
        modifier = Modifier.fillMaxSize(),
    )
}

@Composable
private fun StatusOverlay(
    scanCount: Int,
    lastText: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Color.Black.copy(alpha = 0.5f))
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Text(
            text = "Scans: $scanCount",
            color = Color.White,
            style = MaterialTheme.typography.labelMedium,
        )
        if (lastText.isNotEmpty()) {
            Text(
                text = "Last: ${lastText.take(60)}${if (lastText.length > 60) "..." else ""}",
                color = Color.White.copy(alpha = 0.7f),
                style = MaterialTheme.typography.labelSmall,
                maxLines = 1,
            )
        }
    }
}
