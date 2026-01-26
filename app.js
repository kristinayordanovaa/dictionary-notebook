// IndexedDB Setup
let db;
const DB_NAME = 'DictionaryDB';
const DB_VERSION = 1;
const STORE_NAME = 'words';

// Supabase Setup
let supabaseClient = null;
let isOnline = navigator.onLine;
let deviceId = localStorage.getItem('deviceId') || generateDeviceId();

function generateDeviceId() {
    const id = 'device_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    localStorage.setItem('deviceId', id);
    return id;
}

// Initialize Supabase
function initSupabase() {
    if (typeof supabase !== 'undefined' && SUPABASE_URL && SUPABASE_ANON_KEY && 
        SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase initialized');
        updateSyncStatus('connected');
        return true;
    }
    console.log('Supabase not configured - running in offline mode');
    return false;
}

// Sync status indicator
function updateSyncStatus(status) {
    const statusBadge = document.getElementById('syncStatus');
    if (!statusBadge) return;
    
    statusBadge.style.display = 'inline-block';
    
    switch(status) {
        case 'syncing':
            statusBadge.className = 'badge bg-info';
            statusBadge.innerHTML = '<i class="bi bi-arrow-repeat"></i> Syncing...';
            break;
        case 'synced':
            statusBadge.className = 'badge bg-success';
            statusBadge.innerHTML = '<i class="bi bi-cloud-check"></i> Synced';
            setTimeout(() => {
                if (statusBadge.innerHTML.includes('Synced')) {
                    statusBadge.style.display = 'none';
                }
            }, 3000);
            break;
        case 'offline':
            statusBadge.className = 'badge bg-warning text-dark';
            statusBadge.innerHTML = '<i class="bi bi-wifi-off"></i> Offline';
            break;
        case 'error':
            statusBadge.className = 'badge bg-danger';
            statusBadge.innerHTML = '<i class="bi bi-exclamation-triangle"></i> Sync Error';
            setTimeout(() => statusBadge.style.display = 'none', 5000);
            break;
        case 'connected':
            statusBadge.className = 'badge bg-success';
            statusBadge.innerHTML = '<i class="bi bi-cloud-check"></i> Connected';
            setTimeout(() => statusBadge.style.display = 'none', 2000);
            break;
    }
}

// Initialize IndexedDB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                objectStore.createIndex('word', 'word', { unique: false });
                objectStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
}

// CRUD Operations
async function saveWord(word, description) {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const entry = {
        word: word.trim(),
        description: description.trim(),
        timestamp: new Date().toISOString()
    };
    
    return new Promise((resolve, reject) => {
        const request = store.add(entry);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getAllWords() {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function updateWord(id, word, description) {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const entry = {
        id: id,
        word: word.trim(),
        description: description.trim(),
        timestamp: new Date().toISOString()
    };
    
    return new Promise((resolve, reject) => {
        const request = store.put(entry);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteWord(id) {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function findWordByName(word) {
    const words = await getAllWords();
    const searchTerm = word.toLowerCase();
    return words.find(w => {
        const existingWord = w.word.toLowerCase();
        // Check if input word is contained in existing word or vice versa
        return existingWord.includes(searchTerm) || searchTerm.includes(existingWord);
    });
}

// ===== SUPABASE SYNC FUNCTIONS =====

// Sync a single word to Supabase
async function syncWordToCloud(wordData) {
    if (!supabaseClient || !isOnline) {
        console.log('Sync skipped: offline or not configured');
        return false;
    }
    
    try {
        updateSyncStatus('syncing');
        
        // Check if word already exists in cloud
        const { data: existingList } = await supabaseClient
            .from('words')
            .select('*')
            .eq('device_id', deviceId)
            .eq('local_id', wordData.id);
        
        const existing = existingList && existingList.length > 0 ? existingList[0] : null;
        
        if (existing) {
            // Update existing
            const { error } = await supabaseClient
                .from('words')
                .update({
                    word: wordData.word,
                    description: wordData.description,
                    timestamp: wordData.timestamp,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id);
            
            if (error) throw error;
        } else {
            // Insert new
            const { error } = await supabaseClient
                .from('words')
                .insert({
                    device_id: deviceId,
                    local_id: wordData.id,
                    word: wordData.word,
                    description: wordData.description,
                    timestamp: wordData.timestamp
                });
            
            if (error) throw error;
        }
        
        updateSyncStatus('synced');
        return true;
    } catch (error) {
        console.error('Sync error:', error);
        updateSyncStatus('error');
        return false;
    }
}

// Delete word from cloud
async function deleteWordFromCloud(wordId) {
    if (!supabaseClient || !isOnline) return false;
    
    try {
        updateSyncStatus('syncing');
        
        const { error } = await supabaseClient
            .from('words')
            .delete()
            .eq('device_id', deviceId)
            .eq('local_id', wordId);
        
        if (error) throw error;
        
        updateSyncStatus('synced');
        return true;
    } catch (error) {
        console.error('Delete sync error:', error);
        updateSyncStatus('error');
        return false;
    }
}

// Pull all words from cloud on app load
async function pullFromCloud() {
    if (!supabaseClient || !isOnline) return;
    
    try {
        updateSyncStatus('syncing');
        
        const { data: cloudWords, error } = await supabaseClient
            .from('words')
            .select('*')
            .order('timestamp', { ascending: true });
        
        if (error) throw error;
        
        if (!cloudWords || cloudWords.length === 0) {
            updateSyncStatus('synced');
            return;
        }
        
        // Merge cloud words with local
        const localWords = await getAllWords();
        const localMap = new Map(localWords.map(w => [w.id, w]));
        
        for (const cloudWord of cloudWords) {
            const localWord = localMap.get(cloudWord.local_id);
            
            if (!localWord) {
                // Word exists in cloud but not local - add it
                await saveWord(cloudWord.word, cloudWord.description);
            } else {
                // Compare timestamps - keep newer version
                if (new Date(cloudWord.timestamp) > new Date(localWord.timestamp)) {
                    await updateWord(localWord.id, cloudWord.word, cloudWord.description);
                }
            }
        }
        
        updateSyncStatus('synced');
        await renderWordsList();
    } catch (error) {
        console.error('Pull error:', error);
        updateSyncStatus('error');
    }
}

// Translation API Integration (MyMemory Translation API)
async function translateWord(word, source, target) {
    // MyMemory API endpoint
    const apiUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=${source}|${target}`;
    
    console.log(`Attempting translation: "${word}" from ${source} to ${target}`);
    
    try {
        const response = await fetch(apiUrl);
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Translation API error:', response.status, errorText);
            throw new Error(`Translation failed: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Translation result:', data);
        
        if (data.responseStatus !== 200) {
            throw new Error('Translation service error');
        }
        
        return data.responseData.translatedText;
    } catch (err) {
        console.error('Translation error:', err);
        throw err;
    }
}

// Get word definition with context
async function lookupWord(word) {
    try {
        // Translate the word
        const translation = await translateWord(word, sourceLang, targetLang);
        
        // Get example sentence or definition
        let context = '';
        if (sourceLang !== targetLang) {
            try {
                // Try to get a definition in the target language
                const exampleSentence = `The word "${word}" means "${translation}"`;
                context = await translateWord(exampleSentence, 'en', targetLang);
            } catch (e) {
                context = translation;
            }
        }
        
        return {
            word: word,
            translation: translation,
            context: context,
            sourceLang: sourceLang,
            targetLang: targetLang
        };
    } catch (err) {
        console.error('Lookup error:', err);
        throw err;
    }
}

function displayAPIResult(data) {
    const resultDiv = document.getElementById('apiResult');
    const definitionDiv = document.getElementById('apiDefinition');
    
    const langNames = {
        en: 'English', es: 'Spanish', fr: 'French', de: 'German',
        it: 'Italian', pt: 'Portuguese', ru: 'Russian', zh: 'Chinese',
        ja: 'Japanese', ko: 'Korean', ar: 'Arabic', hi: 'Hindi',
        nl: 'Dutch', pl: 'Polish', tr: 'Turkish'
    };
    
    let html = `<h6 class="mb-2">${escapeHtml(data.word)}</h6>`;
    html += `<p class="api-phonetic">${langNames[data.sourceLang]} → ${langNames[data.targetLang]}</p>`;
    html += `<div class="api-meaning"><strong>Translation:</strong></div>`;
    html += `<p class="mb-2">${escapeHtml(data.translation)}</p>`;
    
    if (data.context && data.context !== data.translation) {
        html += `<p class="api-example">${escapeHtml(data.context)}</p>`;
    }
    
    definitionDiv.innerHTML = html;
    resultDiv.style.display = 'block';
    
    // Auto-fill description with translation
    const descInput = document.getElementById('descriptionInput');
    if (!descInput.value) {
        let autoDescription = `Translation: ${data.translation}`;
        if (data.context && data.context !== data.translation) {
            autoDescription += `\n\n${data.context}`;
        }
        descInput.value = autoDescription;
    }
}

// UI Functions
async function renderWordsList(searchTerm = '') {
    const words = await getAllWords();
    const wordsList = document.getElementById('wordsList');
    
    // Filter words if search term exists
    const filteredWords = searchTerm 
        ? words.filter(w => 
            w.word.toLowerCase().includes(searchTerm.toLowerCase()) || 
            w.description.toLowerCase().includes(searchTerm.toLowerCase())
          )
        : words;
    
    if (filteredWords.length === 0) {
        wordsList.innerHTML = searchTerm 
            ? '<tr><td colspan="3" class="text-muted text-center">No matching words found.</td></tr>'
            : '<tr><td colspan="3" class="text-center py-5"><div class="text-muted mb-3">No words saved yet.<br>Click the button below to start building your dictionary!</div><button class="btn btn-primary" onclick="document.getElementById(\'addWordBtn\').click()"><i class="bi bi-plus-lg"></i> Add Word</button></td></tr>';
        return;
    }
    
    // Sort by timestamp (newest first)
    filteredWords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    wordsList.innerHTML = filteredWords.map(word => `
        <tr data-id="${word.id}">
            <td class="word-cell">
                <strong>${escapeHtml(word.word)}</strong>
            </td>
            <td class="description-cell">
                ${escapeHtml(word.description)}
            </td>
            <td class="actions-cell">
                <button class="btn btn-outline-primary btn-sm edit-btn" data-id="${word.id}">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-outline-danger btn-sm delete-btn" data-id="${word.id}">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
    
    // Add event listeners
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', handleEdit);
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', handleDelete);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Event Handlers
document.getElementById('addWordBtn').addEventListener('click', () => {
    // Clear inputs
    document.getElementById('wordInput').value = '';
    document.getElementById('descriptionInput').value = '';
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('addWordModal'));
    modal.show();
    
    // Focus on word input
    setTimeout(() => {
        document.getElementById('wordInput').focus();
    }, 500);
});

document.getElementById('saveBtn').addEventListener('click', async function() {
    // Blur button immediately to remove focus before modal closes
    this.blur();
    
    const word = document.getElementById('wordInput').value.trim();
    const description = document.getElementById('descriptionInput').value.trim();
    
    if (!word || !description) {
        alert('Please enter both a word and description.');
        return;
    }
    
    // Check if word already exists
    const existingWord = await findWordByName(word);
    
    if (existingWord) {
        // Show the update confirmation modal
        document.getElementById('updateWordName').textContent = word;
        document.getElementById('updateExistingDescription').textContent = existingWord.description;
        
        // Store the data for both buttons
        const confirmBtn = document.getElementById('confirmUpdateBtn');
        const addNewBtn = document.getElementById('addAsNewBtn');
        
        confirmBtn.dataset.existingId = existingWord.id;
        confirmBtn.dataset.word = word;
        confirmBtn.dataset.description = description;
        
        addNewBtn.dataset.word = word;
        addNewBtn.dataset.description = description;
        
        const updateModal = new bootstrap.Modal(document.getElementById('updateConfirmModal'));
        updateModal.show();
        return;
    }
    
    // If word doesn't exist, save it directly
    await performSave(null, word, description);
});

// Handle the actual save/update when confirmed
document.getElementById('confirmUpdateBtn').addEventListener('click', async function() {
    this.blur();
    const existingId = parseInt(this.dataset.existingId);
    const word = this.dataset.word;
    const description = this.dataset.description;
    
    // Close the update confirmation modal
    const updateModal = bootstrap.Modal.getInstance(document.getElementById('updateConfirmModal'));
    updateModal.hide();
    
    await performSave(existingId, word, description);
});

// Handle adding as new word even if duplicate exists
document.getElementById('addAsNewBtn').addEventListener('click', async function() {
    this.blur();
    const word = this.dataset.word;
    const description = this.dataset.description;
    
    // Close the update confirmation modal
    const updateModal = bootstrap.Modal.getInstance(document.getElementById('updateConfirmModal'));
    updateModal.hide();
    
    // Force save as new (pass null as existingId)
    await performSave(null, word, description);
});

async function performSave(existingId, word, description) {
    try {
        let savedId;
        
        if (existingId) {
            await updateWord(existingId, word, description);
            savedId = existingId;
        } else {
            savedId = await saveWord(word, description);
        }
        
        // Sync to cloud after every change
        const wordData = {
            id: savedId,
            word: word,
            description: description,
            timestamp: new Date().toISOString()
        };
        await syncWordToCloud(wordData);
        
        // Clear inputs
        document.getElementById('wordInput').value = '';
        document.getElementById('descriptionInput').value = '';
        document.getElementById('existingWordAlert').style.display = 'none';
        
        // Close add word modal
        const modalEl = document.getElementById('addWordModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) {
            modal.hide();
        }
        
        // Refresh list
        await renderWordsList();
        
        // Show success message
        showToast(existingId ? 'Word updated successfully!' : 'Word saved successfully!');
    } catch (error) {
        alert('Error saving word: ' + error.message);
    }
}

// Check for existing word as user types
document.getElementById('wordInput').addEventListener('input', async (e) => {
    const word = e.target.value.trim();
    const alertDiv = document.getElementById('existingWordAlert');
    const alertText = document.getElementById('existingWordText');
    
    if (word.length < 2) {
        alertDiv.style.display = 'none';
        return;
    }
    
    const existingWord = await findWordByName(word);
    if (existingWord) {
        alertText.textContent = `This word already exists: "${existingWord.word}"`;
        alertDiv.style.display = 'block';
    } else {
        alertDiv.style.display = 'none';
    }
});

document.getElementById('searchInput').addEventListener('input', (e) => {
    renderWordsList(e.target.value);
});

let currentEditId = null;

async function handleEdit(e) {
    const id = parseInt(e.currentTarget.dataset.id);
    currentEditId = id;
    
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    
    request.onsuccess = () => {
        const word = request.result;
        document.getElementById('editWord').value = word.word;
        document.getElementById('editDescription').value = word.description;
        
        const modal = new bootstrap.Modal(document.getElementById('editModal'));
        modal.show();
    };
}

document.getElementById('updateBtn').addEventListener('click', async () => {
    const word = document.getElementById('editWord').value.trim();
    const description = document.getElementById('editDescription').value.trim();
    
    if (!word || !description) {
        alert('Please fill in all fields.');
        return;
    }
    
    try {
        await updateWord(currentEditId, word, description);
        
        // Sync to cloud after edit
        const wordData = {
            id: currentEditId,
            word: word,
            description: description,
            timestamp: new Date().toISOString()
        };
        await syncWordToCloud(wordData);
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('editModal'));
        modal.hide();
        
        await renderWordsList();
        showToast('Word updated successfully!');
    } catch (error) {
        alert('Error updating word: ' + error.message);
    }
});

async function handleDelete(e) {
    const id = parseInt(e.currentTarget.dataset.id);
    
    // Get the word details to show in the modal
    const words = await getAllWords();
    const word = words.find(w => w.id === id);
    
    if (!word) return;
    
    // Set the word name in the modal
    document.getElementById('deleteWordName').textContent = word.word;
    
    // Store the id for the confirm button
    document.getElementById('confirmDeleteBtn').dataset.deleteId = id;
    
    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('deleteModal'));
    modal.show();
}

// Handle the actual deletion when confirmed
document.getElementById('confirmDeleteBtn').addEventListener('click', async function() {
    const id = parseInt(this.dataset.deleteId);
    const modalEl = document.getElementById('deleteModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    
    // Blur the button immediately to remove focus before modal closes
    this.blur();
    
    // Close the modal
    if (modal) {
        modal.hide();
    }
    
    try {
        await deleteWord(id);
        
        // Sync deletion to cloud
        await deleteWordFromCloud(id);
        
        await renderWordsList();
        showToast('Word deleted successfully!');
    } catch (error) {
        alert('Error deleting word: ' + error.message);
    }
});

function showToast(message) {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.className = 'position-fixed bottom-0 end-0 p-3';
    toast.style.zIndex = '11';
    toast.innerHTML = `
        <div class="toast show" role="alert">
            <div class="toast-body bg-success text-white rounded">
                ${message}
            </div>
        </div>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// PWA Install Button
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('installBtn').style.display = 'block';
});

document.getElementById('installBtn').addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        document.getElementById('installBtn').style.display = 'none';
    }
});

// Service Worker Registration - DISABLED for development
if ('serviceWorker' in navigator) {
    // Unregister all service workers
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
            registration.unregister();
            console.log('Service Worker unregistered');
        }
    });
    
    // Disabled registration
    // navigator.serviceWorker.register('service-worker.js')
    //     .then(reg => console.log('Service Worker registered'))
    //     .catch(err => console.error('Service Worker registration failed:', err));
}

// Initialize App
initDB().then(async () => {
    // Initialize Supabase
    const supabaseEnabled = initSupabase();
    
    // Pull data from cloud if available
    if (supabaseEnabled) {
        await pullFromCloud();
    }
    
    renderWordsList();
    console.log('Dictionary Notebook initialized!', supabaseEnabled ? '(Cloud sync enabled)' : '(Offline mode)');
}).catch(err => {
    console.error('Failed to initialize database:', err);
    alert('Failed to initialize app. Please try refreshing the page.');
});

// Online/Offline detection
window.addEventListener('online', async () => {
    isOnline = true;
    console.log('Back online - syncing...');
    if (supabaseClient) {
        await pullFromCloud();
    }
});

window.addEventListener('offline', () => {
    isOnline = false;
    updateSyncStatus('offline');
    console.log('Offline - changes will sync when back online');
});

/* Cache bust: Mon Jan 26 11:20:21 EET 2026 */
