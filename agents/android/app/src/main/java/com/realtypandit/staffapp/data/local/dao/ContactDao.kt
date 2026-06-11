package com.realtypandit.staffapp.data.local.dao

import androidx.room.*
import com.realtypandit.staffapp.data.local.entities.ContactEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ContactDao {

    @Query("SELECT * FROM contacts ORDER BY lastInteraction DESC")
    fun getAllContactsFlow(): Flow<List<ContactEntity>>

    @Query("SELECT * FROM contacts WHERE phoneNumber = :phoneNumber")
    suspend fun getContactByPhone(phoneNumber: String): ContactEntity?

    @Query("SELECT * FROM contacts WHERE isBusiness = 1")
    suspend fun getBusinessContacts(): List<ContactEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertContact(contact: ContactEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(contacts: List<ContactEntity>)

    @Update
    suspend fun updateContact(contact: ContactEntity)

    @Query("UPDATE contacts SET isBusiness = :isBusiness WHERE phoneNumber = :phoneNumber")
    suspend fun markAsBusiness(phoneNumber: String, isBusiness: Boolean)

    @Query("DELETE FROM contacts WHERE phoneNumber = :phoneNumber")
    suspend fun deleteContact(phoneNumber: String)
}
