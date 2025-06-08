package com.bookmarkai.network

import okhttp3.MediaType
import okhttp3.RequestBody
import okio.Buffer
import okio.BufferedSink
import okio.ForwardingSink
import okio.Sink
import okio.buffer
import java.io.IOException

/**
 * Progress tracking wrapper for OkHttp RequestBody
 * Provides upload progress callbacks for large request bodies
 */
class ProgressRequestBody(
    private val delegate: RequestBody,
    private val progressListener: (bytesWritten: Long, contentLength: Long) -> Unit
) : RequestBody() {
    
    override fun contentType(): MediaType? = delegate.contentType()
    
    override fun contentLength(): Long = delegate.contentLength()
    
    @Throws(IOException::class)
    override fun writeTo(sink: BufferedSink) {
        val progressSink = ProgressSink(sink, contentLength(), progressListener)
        val bufferedSink = progressSink.buffer()
        
        delegate.writeTo(bufferedSink)
        bufferedSink.flush()
    }
    
    /**
     * Forwarding sink that tracks write progress
     */
    private class ProgressSink(
        delegate: Sink,
        private val contentLength: Long,
        private val progressListener: (bytesWritten: Long, contentLength: Long) -> Unit
    ) : ForwardingSink(delegate) {
        
        private var bytesWritten = 0L
        
        @Throws(IOException::class)
        override fun write(source: Buffer, byteCount: Long) {
            super.write(source, byteCount)
            
            bytesWritten += byteCount
            progressListener(bytesWritten, contentLength)
        }
    }
}