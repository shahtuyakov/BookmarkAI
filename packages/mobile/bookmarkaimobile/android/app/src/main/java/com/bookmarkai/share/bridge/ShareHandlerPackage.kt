package com.bookmarkai.share.bridge

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.bookmarkai.network.OkHttpNetworkAdapter
import com.bookmarkai.security.HardwareSecurityModule

/**
 * React Native package that registers native modules for BookmarkAI.
 * Includes ShareHandlerModule, OkHttpNetworkAdapter, and HardwareSecurityModule.
 */
class ShareHandlerPackage : ReactPackage {
    
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(
            ShareHandlerModule(reactContext),
            OkHttpNetworkAdapter(reactContext),
            HardwareSecurityModule(reactContext)
        )
    }
    
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}