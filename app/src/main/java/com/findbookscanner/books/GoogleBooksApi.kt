package com.findbookscanner.books

import com.google.gson.annotations.SerializedName
import retrofit2.http.GET
import retrofit2.http.Query

interface GoogleBooksApi {

    @GET("volumes")
    suspend fun searchBooks(
        @Query("q") query: String,
        @Query("maxResults") maxResults: Int = 5,
    ): BooksResponse
}

data class BooksResponse(
    @SerializedName("totalItems") val totalItems: Int,
    @SerializedName("items") val items: List<VolumeItem>?,
)

data class VolumeItem(
    @SerializedName("id") val id: String,
    @SerializedName("volumeInfo") val volumeInfo: VolumeInfo,
)

data class VolumeInfo(
    @SerializedName("title") val title: String?,
    @SerializedName("authors") val authors: List<String>?,
    @SerializedName("publisher") val publisher: String?,
    @SerializedName("publishedDate") val publishedDate: String?,
    @SerializedName("description") val description: String?,
    @SerializedName("industryIdentifiers") val industryIdentifiers: List<IndustryIdentifier>?,
    @SerializedName("pageCount") val pageCount: Int?,
    @SerializedName("imageLinks") val imageLinks: ImageLinks?,
    @SerializedName("infoLink") val infoLink: String?,
)

data class IndustryIdentifier(
    @SerializedName("type") val type: String,
    @SerializedName("identifier") val identifier: String,
)

data class ImageLinks(
    @SerializedName("smallThumbnail") val smallThumbnail: String?,
    @SerializedName("thumbnail") val thumbnail: String?,
)
