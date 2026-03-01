package com.findbookscanner

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import com.findbookscanner.ocr.TextRecognitionProcessor
import com.findbookscanner.ui.BookScannerViewModel
import com.findbookscanner.ui.CameraScreen
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var textProcessor: TextRecognitionProcessor

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val viewModel: BookScannerViewModel = hiltViewModel()
                    val uiState by viewModel.uiState.collectAsState()

                    CameraScreen(
                        viewModel = viewModel,
                        textProcessor = textProcessor,
                        uiState = uiState,
                    )
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        textProcessor.close()
    }
}
