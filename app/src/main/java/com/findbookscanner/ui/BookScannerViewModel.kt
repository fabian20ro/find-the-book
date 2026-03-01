package com.findbookscanner.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.findbookscanner.books.GoogleBooksRepository
import com.findbookscanner.data.Book
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

data class ScannerUiState(
    val detectedBooks: List<Book> = emptyList(),
    val isScanning: Boolean = true,
    val lastDetectedText: String = "",
    val scanCount: Int = 0,
)

@HiltViewModel
class BookScannerViewModel @Inject constructor(
    private val booksRepository: GoogleBooksRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ScannerUiState())
    val uiState: StateFlow<ScannerUiState> = _uiState.asStateFlow()

    private val foundBookIds = mutableSetOf<String>()

    fun onTextDetected(textBlocks: List<String>) {
        viewModelScope.launch {
            _uiState.update { it.copy(scanCount = it.scanCount + 1) }

            for (block in textBlocks) {
                _uiState.update { it.copy(lastDetectedText = block) }

                val books = booksRepository.searchBooks(block)
                for (book in books) {
                    if (foundBookIds.add(book.id)) {
                        _uiState.update { state ->
                            state.copy(detectedBooks = state.detectedBooks + book)
                        }
                    }
                }
            }
        }
    }

    fun toggleScanning() {
        _uiState.update { it.copy(isScanning = !it.isScanning) }
    }

    fun removeBook(book: Book) {
        foundBookIds.remove(book.id)
        _uiState.update { state ->
            state.copy(detectedBooks = state.detectedBooks.filter { it.id != book.id })
        }
    }

    fun clearAll() {
        foundBookIds.clear()
        booksRepository.clearCache()
        _uiState.update { ScannerUiState() }
    }

    fun exportBooks(context: Context) {
        val books = _uiState.value.detectedBooks
        if (books.isEmpty()) return

        val csv = buildString {
            appendLine("Title,Authors,ISBN,Publisher,Published Date,Page Count")
            for (book in books) {
                val title = book.title.escapeCsv()
                val authors = book.authorsFormatted.escapeCsv()
                val isbn = book.isbn ?: ""
                val publisher = (book.publisher ?: "").escapeCsv()
                val date = book.publishedDate ?: ""
                val pages = book.pageCount?.toString() ?: ""
                appendLine("$title,$authors,$isbn,$publisher,$date,$pages")
            }
        }

        val file = File(context.cacheDir, "found_books.csv")
        file.writeText(csv)

        val uri: Uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file,
        )

        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/csv"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(shareIntent, "Export Books"))
    }

    private fun String.escapeCsv(): String {
        return if (contains(",") || contains("\"") || contains("\n")) {
            "\"${replace("\"", "\"\"")}\""
        } else this
    }
}
