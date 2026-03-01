package com.findbookscanner.data

data class Book(
    val id: String,
    val title: String,
    val authors: List<String>,
    val publisher: String?,
    val publishedDate: String?,
    val description: String?,
    val isbn: String?,
    val pageCount: Int?,
    val thumbnailUrl: String?,
    val infoLink: String?,
) {
    val authorsFormatted: String
        get() = authors.joinToString(", ")
}
