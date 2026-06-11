package com.realtypandit.staffapp.data.local.dao

import androidx.room.*
import com.realtypandit.staffapp.data.local.entities.CallEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface CallDao {

    @Query("SELECT * FROM calls ORDER BY createdAt DESC")
    fun getAllCallsFlow(): Flow<List<CallEntity>>

    @Query("SELECT * FROM calls WHERE status = :status ORDER BY createdAt DESC")
    fun getCallsByStatus(status: String): Flow<List<CallEntity>>

    @Query("SELECT * FROM calls WHERE id = :callId")
    suspend fun getCallById(callId: String): CallEntity?

    @Query("SELECT * FROM calls WHERE phoneNumber = :phoneNumber ORDER BY createdAt DESC")
    fun getCallsByPhoneNumber(phoneNumber: String): Flow<List<CallEntity>>

    @Query("SELECT * FROM calls WHERE syncedToServer = 0 AND localFilePath IS NOT NULL")
    suspend fun getPendingUploads(): List<CallEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCall(call: CallEntity)

    @Update
    suspend fun updateCall(call: CallEntity)

    @Query("UPDATE calls SET status = :status WHERE id = :callId")
    suspend fun updateCallStatus(callId: String, status: String)

    @Query("UPDATE calls SET syncedToServer = 1 WHERE id = :callId")
    suspend fun markAsSynced(callId: String)

    @Query("DELETE FROM calls WHERE id = :callId")
    suspend fun deleteCall(callId: String)

    @Query("DELETE FROM calls WHERE createdAt < :timestamp AND syncedToServer = 1")
    suspend fun deleteOldSyncedCalls(timestamp: Long)
}
