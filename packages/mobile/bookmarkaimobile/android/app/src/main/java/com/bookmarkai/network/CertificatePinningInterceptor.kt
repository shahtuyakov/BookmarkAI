package com.bookmarkai.network

import android.util.Log
import com.bookmarkai.BuildConfig
import okhttp3.CertificatePinner
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import java.security.cert.Certificate
import java.security.cert.X509Certificate
import javax.net.ssl.SSLPeerUnverifiedException

/**
 * Certificate Pinning Interceptor for enhanced security
 * Validates SSL certificates against known good pins to prevent MITM attacks
 */
class CertificatePinningInterceptor : Interceptor {
    
    companion object {
        private const val TAG = "CertificatePinning"
        
        // Production certificate pins for api.bookmarkai.com
        // These should be updated with actual certificate pins before production deployment
        private val CERTIFICATE_PINS = mapOf(
            "api.bookmarkai.com" to listOf(
                "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", // Primary pin (replace with actual)
                "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=" // Backup pin (replace with actual)
            ),
            "bookmarkai.com" to listOf(
                "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", // Primary pin
                "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=" // Backup pin
            )
        )
    }
    
    private val certificatePinner: CertificatePinner by lazy {
        val builder = CertificatePinner.Builder()
        
        CERTIFICATE_PINS.forEach { (host, pins) ->
            pins.forEach { pin ->
                builder.add(host, pin)
            }
        }
        
        builder.build()
    }
    
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val hostname = request.url.host
        
        // Skip certificate pinning in debug builds for development flexibility
        if (BuildConfig.DEBUG) {
            Log.d(TAG, "Certificate pinning disabled in debug mode for $hostname")
            return chain.proceed(request)
        }
        
        // Only apply pinning to configured hosts
        if (!CERTIFICATE_PINS.containsKey(hostname)) {
            Log.d(TAG, "No certificate pins configured for $hostname")
            return chain.proceed(request)
        }
        
        Log.d(TAG, "Applying certificate pinning for $hostname")
        
        return try {
            // Create a client with certificate pinning for this request
            val pinnedClient = OkHttpClient.Builder()
                .certificatePinner(certificatePinner)
                .build()
            
            // Execute the request with the pinned client
            val pinnedCall = pinnedClient.newCall(request)
            val response = pinnedCall.execute()
            
            Log.d(TAG, "✅ Certificate pinning validation successful for $hostname")
            response
            
        } catch (e: SSLPeerUnverifiedException) {
            Log.e(TAG, "❌ Certificate pinning failed for $hostname", e)
            throw SecurityException("Certificate pinning validation failed for $hostname", e)
        } catch (e: Exception) {
            Log.e(TAG, "❌ Certificate pinning error for $hostname", e)
            
            // For non-SSL errors, proceed with the original request to avoid breaking functionality
            // but log the issue for monitoring
            when {
                e.message?.contains("pinning", ignoreCase = true) == true -> {
                    throw SecurityException("Certificate pinning validation failed", e)
                }
                else -> {
                    Log.w(TAG, "Non-pinning error, proceeding with request: ${e.message}")
                    chain.proceed(request)
                }
            }
        }
    }
    
    /**
     * Validate certificate chain for debugging purposes
     */
    fun validateCertificateChain(certificates: List<Certificate>, hostname: String): Boolean {
        return try {
            Log.d(TAG, "Validating certificate chain for $hostname")
            
            certificates.forEachIndexed { index, cert ->
                if (cert is X509Certificate) {
                    Log.d(TAG, "Certificate $index: Subject=${cert.subjectDN}, Issuer=${cert.issuerDN}")
                    Log.d(TAG, "Certificate $index: Serial=${cert.serialNumber}, Valid=${cert.notBefore} to ${cert.notAfter}")
                }
            }
            
            // Use the certificate pinner to validate
            certificatePinner.check(hostname, certificates)
            
            Log.d(TAG, "✅ Certificate chain validation successful for $hostname")
            true
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Certificate chain validation failed for $hostname", e)
            false
        }
    }
    
    /**
     * Get certificate information for debugging
     */
    fun getCertificateInfo(hostname: String): Map<String, Any> {
        return try {
            val pins = CERTIFICATE_PINS[hostname] ?: emptyList()
            
            mapOf(
                "hostname" to hostname,
                "hasPins" to pins.isNotEmpty(),
                "pinCount" to pins.size,
                "pins" to pins,
                "pinningEnabled" to !BuildConfig.DEBUG
            )
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get certificate info for $hostname", e)
            mapOf(
                "hostname" to hostname,
                "error" to e.message.orEmpty()
            )
        }
    }
}