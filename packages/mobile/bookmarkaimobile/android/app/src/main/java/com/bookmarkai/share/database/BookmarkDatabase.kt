package com.bookmarkai.share.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import net.sqlcipher.database.SQLiteDatabase
import net.sqlcipher.database.SupportFactory

/**
 * Room database for BookmarkAI share queue.
 * Uses SQLCipher for encryption at rest.
 */
@Database(
    entities = [BookmarkQueueEntity::class],
    version = 1,
    exportSchema = true
)
abstract class BookmarkDatabase : RoomDatabase() {
    
    abstract fun bookmarkQueueDao(): BookmarkQueueDao
    
    companion object {
        private const val DATABASE_NAME = "bookmark_queue.db"
        private const val PREFS_NAME = "bookmark_ai_secure_prefs"
        private const val KEY_DB_PASSPHRASE = "db_passphrase"
        
        @Volatile
        private var INSTANCE: BookmarkDatabase? = null
        
        /**
         * Get database instance with SQLCipher encryption
         */
        fun getDatabase(context: Context): BookmarkDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = buildDatabase(context)
                INSTANCE = instance
                instance
            }
        }
        
        private fun buildDatabase(context: Context): BookmarkDatabase {
            // Get or create encrypted passphrase
            val passphrase = getOrCreateDatabasePassphrase(context)
            
            // Create SQLCipher support factory
            val supportFactory = SupportFactory(SQLiteDatabase.getBytes(passphrase.toCharArray()))
            
            return Room.databaseBuilder(
                context.applicationContext,
                BookmarkDatabase::class.java,
                DATABASE_NAME
            )
                .openHelperFactory(supportFactory)  // Enable SQLCipher encryption
                .addMigrations(*getAllMigrations())  // Add future migrations here
                .fallbackToDestructiveMigration()    // For development only - remove in production
                .build()
        }
        
        /**
         * Get or create a secure database passphrase using Android Keystore
         */
        private fun getOrCreateDatabasePassphrase(context: Context): String {
            return try {
                val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
                
                val sharedPreferences = EncryptedSharedPreferences.create(
                    PREFS_NAME,
                    masterKeyAlias,
                    context,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                )
                
                // Get existing passphrase or generate new one
                sharedPreferences.getString(KEY_DB_PASSPHRASE, null) 
                    ?: generateAndStorePassphrase(sharedPreferences)
                    
            } catch (e: Exception) {
                // Fallback for testing or if encryption fails
                android.util.Log.e("BookmarkDatabase", "Failed to create encrypted passphrase", e)
                "fallback_passphrase_bookmark_ai_2025"
            }
        }
        
        private fun generateAndStorePassphrase(sharedPreferences: android.content.SharedPreferences): String {
            val passphrase = java.util.UUID.randomUUID().toString() + 
                           java.util.UUID.randomUUID().toString()
            
            sharedPreferences.edit()
                .putString(KEY_DB_PASSPHRASE, passphrase)
                .apply()
                
            return passphrase
        }
        
        /**
         * Get all database migrations
         */
        private fun getAllMigrations(): Array<Migration> {
            return arrayOf(
                // Future migrations will go here
                // MIGRATION_1_2, MIGRATION_2_3, etc.
            )
        }
        
        /**
         * Close database instance (for testing)
         */
        fun closeDatabase() {
            INSTANCE?.close()
            INSTANCE = null
        }
    }
}

// Example migration (for future use)
/*
val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(database: SupportSQLiteDatabase) {
        // Example: Add new column
        database.execSQL("ALTER TABLE bookmark_queue ADD COLUMN new_field TEXT")
    }
}
*/