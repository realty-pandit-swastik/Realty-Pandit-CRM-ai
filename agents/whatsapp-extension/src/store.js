const database = new Promise((resolve, reject) => {
    const request = indexedDB.open('rp-personal-whatsapp', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('requests', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Could not open local extension storage.'));
});

async function operation(method, value) {
    const db = await database;
    return new Promise((resolve, reject) => {
        const tx = db.transaction('requests', method === 'get' || method === 'getAll' ? 'readonly' : 'readwrite');
        const request = tx.objectStore('requests')[method](value);
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(new Error('Local extension storage failed.'));
        tx.onabort = () => reject(new Error('Local extension storage was interrupted.'));
    });
}

export const getRequest = id => operation('get', id);
export const saveRequest = record => operation('put', record);
export const allRequests = () => operation('getAll');
export const removeRequest = id => operation('delete', id);

export async function finishRequest(record, outcome) {
    const { payload, ...metadata } = record;
    await saveRequest({ ...metadata, ...outcome });
}
