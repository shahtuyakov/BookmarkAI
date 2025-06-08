package com.bookmarkai.network

import okhttp3.MediaType
import okhttp3.ResponseBody
import okio.*
import java.io.IOException

/**
 * Progress tracking wrapper for OkHttp ResponseBody
 * Provides download progress callbacks for large response bodies
 */
class ProgressResponseBody(
    private val delegate: ResponseBody,
    private val progressListener: (bytesRead: Long, contentLength: Long) -> Unit
) : ResponseBody() {
    
    private var bufferedSource: BufferedSource? = null
    
    override fun contentType(): MediaType? = delegate.contentType()
    
    override fun contentLength(): Long = delegate.contentLength()
    
    override fun source(): BufferedSource {
        if (bufferedSource == null) {
            bufferedSource = ProgressSource(delegate.source(), contentLength(), progressListener).buffer()
        }
        return bufferedSource!!
    }
    
    /**
     * Forwarding source that tracks read progress
     */
    private class ProgressSource(
        delegate: Source,
        private val contentLength: Long,
        private val progressListener: (bytesRead: Long, contentLength: Long) -> Unit
    ) : ForwardingSource(delegate) {
        
        private var totalBytesRead = 0L
        
        @Throws(IOException::class)
        override fun read(sink: Buffer, byteCount: Long): Long {
            val bytesRead = super.read(sink, byteCount)
            
            if (bytesRead != -1L) {
                totalBytesRead += bytesRead
            }
            
            progressListener(totalBytesRead, contentLength)
            return bytesRead
        }
    }
}