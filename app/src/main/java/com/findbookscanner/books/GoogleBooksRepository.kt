package com.findbookscanner.books

import com.findbookscanner.data.Book
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class GoogleBooksRepository @Inject constructor(
    private val api: GoogleBooksApi,
) {

    private val queryCache = mutableSetOf<String>()

    suspend fun searchBooks(query: String): List<Book> {
        val normalizedQuery = query.lowercase().trim()
        if (normalizedQuery.length < 4 || normalizedQuery in queryCache) {
            return emptyList()
        }
        queryCache.add(normalizedQuery)

        return try {
            val response = api.searchBooks(query, maxResults = 3)
            response.items?.map { it.toBook() } ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun clearCache() {
        queryCache.clear()
    }

    private fun VolumeItem.toBook(): Book {
        val isbn = volumeInfo.industryIdentifiers
            ?.firstOrNull { it.type == "ISBN_13" }?.identifier
            ?: volumeInfo.industryIdentifiers?.firstOrNull()?.identifier

        val thumbnailUrl = volumeInfo.imageLinks?.thumbnail
            ?.replace("http://", "https://")

        return Book(
            id = id,
            title = volumeInfo.title ?: "Unknown Title",
            authors = volumeInfo.authors ?: emptyList(),
            publisher = volumeInfo.publisher,
            publishedDate = volumeInfo.publishedDate,
            description = volumeInfo.description,
            isbn = isbn,
            pageCount = volumeInfo.pageCount,
            thumbnailUrl = thumbnailUrl,
            infoLink = volumeInfo.infoLink,
        )
    }
}
