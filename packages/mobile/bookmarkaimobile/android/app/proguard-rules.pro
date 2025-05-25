# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# SQLCipher rules
-keep class net.sqlcipher.** { *; }
-dontwarn net.sqlcipher.**

# Room database rules
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
-keep @androidx.room.Database class *
-keep class * extends androidx.room.migration.Migration

# BookmarkAI share package rules
-keep class com.bookmarkai.share.** { *; }
-keep class com.bookmarkai.share.database.** { *; }
-keep class com.bookmarkai.share.bridge.** { *; }

# WorkManager rules
-keep class * extends androidx.work.Worker
-keep class * extends androidx.work.InputMerger
-keep class androidx.work.impl.** { *; }

# Moshi JSON adapter rules
-keepclasseswithmembers class * {
    @com.squareup.moshi.* <methods>;
}
-keep @com.squareup.moshi.JsonQualifier interface *
-keepclassmembers @com.squareup.moshi.JsonClass class * extends java.lang.Enum {
    <fields>;
    **[] values();
}

# Keep data classes used in API
-keep class com.bookmarkai.share.auth.** { *; }
-keep class com.bookmarkai.share.network.** { *; }

# OkHttp rules
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# Kotlin coroutines rules
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembernames class kotlinx.** {
    volatile <fields>;
}

# React Native rules
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.bookmarkai.MainApplication { *; }

# Android Security Crypto rules
-keep class androidx.security.crypto.** { *; }
-dontwarn androidx.security.crypto.**