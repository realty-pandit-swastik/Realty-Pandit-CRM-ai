package com.realtypandit.staffapp.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.realtypandit.staffapp.data.local.dao.CallDao
import com.realtypandit.staffapp.data.local.dao.ContactDao
import com.realtypandit.staffapp.data.local.entities.CallEntity
import com.realtypandit.staffapp.data.local.entities.ContactEntity

@Database(
    entities = [
        CallEntity::class,
        ContactEntity::class
    ],
    version = 1,
    exportSchema = false
)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun callDao(): CallDao
    abstract fun contactDao(): ContactDao

    companion object {
        const val DATABASE_NAME = "staff_app_db"
    }
}
