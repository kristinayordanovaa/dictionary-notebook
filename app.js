// IndexedDB Setup
let db;
const DB_NAME = 'DictionaryDB';
const DB_VERSION = 1;
const STORE_NAME = 'words';

// Supabase Setup
let supabaseClient = null;
let isOnline = navigator.onLine;
let currentUser = null;

// Initialize Supabase
function initSupabase() {
    if (typeof supabase !== 'undefined' && SUPABASE_URL && SUPABASE_ANON_KEY && 
        SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase initialized');
        return true;
    }
    console.log('Supabase not configured - running in offline mode');
    return false;
}

// ===== AUTHENTICATION FUNCTIONS =====

async function checkAuth() {
    if (!supabaseClient) return null;
    
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        currentUser = session.user;
        updateUIForAuthState(true);
        return session.user;
    }
    
    updateUIForAuthState(false);
    return null;
}

function updateUIForAuthState(isLoggedIn) {
    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const userInfo = document.getElementById('userInfo');
    const userEmail = document.getElementById('userEmail');
    const guestBadge = document.getElementById('guestBadge');
    const syncStatus = document.getElementById('syncStatus');
    const guestModeFooter = document.getElementById('guestModeFooter');
    
    if (isLoggedIn && currentUser) {
        // Logged in state
        loginBtn.style.display = 'none';
        signupBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-block';
        userInfo.style.display = 'inline-block';
        userEmail.textContent = currentUser.email;
        guestBadge.style.display = 'none';
        guestModeFooter.style.display = 'none';
    } else {
        // Logged out state (guest mode)
        loginBtn.style.display = 'inline-block';
        signupBtn.style.display = 'inline-block';
        logoutBtn.style.display = 'none';
        userInfo.style.display = 'none';
        userEmail.textContent = ''; // Clear the email text
        guestBadge.style.display = 'inline-block';
        syncStatus.style.display = 'none';
        guestModeFooter.style.display = 'block';
    }
}

async function handleSignup(email, password) {
    if (!supabaseClient) {
        throw new Error('Authentication not available');
    }
    
    const { data, error } = await supabaseClient.auth.signUp({
        email: email,
        password: password
    });
    
    if (error) throw error;
    return data;
}

async function handleLogin(email, password) {
    if (!supabaseClient) {
        throw new Error('Authentication not available');
    }
    
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
    });
    
    if (error) throw error;
    
    currentUser = data.user;
    updateUIForAuthState(true);
    
    // Pull data from cloud after login
    await pullFromCloud();
    await renderWordsList();
    
    return data;
}

async function handleLogout() {
    if (!supabaseClient) return;
    
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    
    currentUser = null;
    updateUIForAuthState(false);
    
    // Clear the search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    
    // Refresh to show local data only
    await renderWordsList();
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
                objectStore.createIndex('cloudId', 'cloudId', { unique: false }); // Store cloud ID
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
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        
        // Ensure transaction completes
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
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
    if (!supabaseClient || !isOnline || !currentUser) {
        console.log('Sync skipped: offline, not configured, or not logged in');
        return false;
    }
    
    try {
        updateSyncStatus('syncing');
        
        let cloudId = wordData.cloudId;
        
        if (cloudId) {
            // Update existing word in cloud
            const { error } = await supabaseClient
                .from('words')
                .update({
                    word: wordData.word,
                    description: wordData.description,
                    timestamp: wordData.timestamp,
                    updated_at: new Date().toISOString()
                })
                .eq('id', cloudId)
                .eq('user_id', currentUser.id);
            
            if (error) throw error;
        } else {
            // Insert new word to cloud
            const { data, error } = await supabaseClient
                .from('words')
                .insert({
                    user_id: currentUser.id,
                    word: wordData.word,
                    description: wordData.description,
                    timestamp: wordData.timestamp
                })
                .select()
                .single();
            
            if (error) throw error;
            
            // Store the cloud ID in local IndexedDB
            if (data) {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                wordData.cloudId = data.id;
                store.put(wordData);
            }
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
    if (!supabaseClient || !isOnline || !currentUser) return false;
    
    try {
        updateSyncStatus('syncing');
        
        // Get the word to find its cloud ID or word details
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(wordId);
        
        return new Promise((resolve, reject) => {
            request.onsuccess = async () => {
                const word = request.result;
                
                if (!word) {
                    console.log('Word already deleted locally');
                    resolve(true);
                    return;
                }
                
                let deleted = false;
                
                if (word.cloudId) {
                    // Delete by cloud ID
                    const { error } = await supabaseClient
                        .from('words')
                        .delete()
                        .eq('id', word.cloudId)
                        .eq('user_id', currentUser.id);
                    
                    if (error) {
                        console.error('Delete by cloudId error:', error);
                    } else {
                        deleted = true;
                        console.log('Deleted from cloud by cloudId:', word.cloudId);
                    }
                }
                
                // If no cloudId or delete failed, try matching by word and description
                if (!deleted) {
                    const { error } = await supabaseClient
                        .from('words')
                        .delete()
                        .eq('user_id', currentUser.id)
                        .eq('word', word.word)
                        .eq('description', word.description);
                    
                    if (error) {
                        console.error('Delete by match error:', error);
                        updateSyncStatus('error');
                        resolve(false);
                    } else {
                        console.log('Deleted from cloud by matching:', word.word);
                        updateSyncStatus('synced');
                        resolve(true);
                    }
                } else {
                    updateSyncStatus('synced');
                    resolve(true);
                }
            };
            
            request.onerror = () => {
                console.error('Failed to get word for deletion');
                resolve(false);
            };
        });
    } catch (error) {
        console.error('Delete sync error:', error);
        updateSyncStatus('error');
        return false;
    }
}

// Pull all words from cloud on app load
async function pullFromCloud() {
    if (!supabaseClient || !isOnline || !currentUser) return;
    
    try {
        updateSyncStatus('syncing');
        
        const { data: cloudWords, error } = await supabaseClient
            .from('words')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('timestamp', { ascending: true });
        
        if (error) throw error;
        
        if (!cloudWords || cloudWords.length === 0) {
            updateSyncStatus('synced');
            return;
        }
        
        // Merge cloud words with local
        const localWords = await getAllWords();
        const cloudIdMap = new Map(localWords.filter(w => w.cloudId).map(w => [w.cloudId, w]));
        
        for (const cloudWord of cloudWords) {
            const localWord = cloudIdMap.get(cloudWord.id);
            
            if (!localWord) {
                // Word exists in cloud but not local - add it
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                
                const entry = {
                    word: cloudWord.word,
                    description: cloudWord.description,
                    timestamp: cloudWord.timestamp,
                    cloudId: cloudWord.id
                };
                
                store.add(entry);
            } else {
                // Compare timestamps - keep newer version
                if (new Date(cloudWord.timestamp) > new Date(localWord.timestamp)) {
                    const transaction = db.transaction([STORE_NAME], 'readwrite');
                    const store = transaction.objectStore(STORE_NAME);
                    
                    localWord.word = cloudWord.word;
                    localWord.description = cloudWord.description;
                    localWord.timestamp = cloudWord.timestamp;
                    
                    store.put(localWord);
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
            <td class="translation-cell">
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
        alert('Please enter both a word and translation.');
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
    e.stopPropagation(); // Prevent event bubbling
    const id = parseInt(e.currentTarget.dataset.id);
    
    if (!id || isNaN(id)) {
        console.error('Invalid ID for edit');
        return;
    }
    
    currentEditId = id;
    
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    
    request.onsuccess = () => {
        const word = request.result;
        if (!word) {
            console.error('Word not found');
            return;
        }
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
    e.stopPropagation(); // Prevent event bubbling
    const id = parseInt(e.currentTarget.dataset.id);
    
    if (!id || isNaN(id)) {
        console.error('Invalid ID for delete');
        return;
    }
    
    // Get the word details to show in the modal
    const words = await getAllWords();
    const word = words.find(w => w.id === id);
    
    if (!word) {
        console.error('Word not found for deletion');
        return;
    }
    
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
        // FIRST: Get word details before deleting locally
        const wordToDelete = await new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        
        if (!wordToDelete) {
            console.error('Word not found in IndexedDB');
            return;
        }
        
        console.log('Word to delete:', wordToDelete);
        
        // Delete from local database
        await deleteWord(id);
        console.log('Word deleted from IndexedDB:', id);
        
        // Then sync deletion to cloud using the word details we got
        if (supabaseClient && isOnline && currentUser) {
            try {
                updateSyncStatus('syncing');
                
                let deleted = false;
                
                if (wordToDelete.cloudId) {
                    // Delete by cloud ID
                    const { error } = await supabaseClient
                        .from('words')
                        .delete()
                        .eq('id', wordToDelete.cloudId)
                        .eq('user_id', currentUser.id);
                    
                    if (!error) {
                        deleted = true;
                        console.log('Deleted from cloud by cloudId:', wordToDelete.cloudId);
                    } else {
                        console.error('Delete by cloudId error:', error);
                    }
                }
                
                // If no cloudId or delete failed, try matching by word and description
                if (!deleted) {
                    const { error } = await supabaseClient
                        .from('words')
                        .delete()
                        .eq('user_id', currentUser.id)
                        .eq('word', wordToDelete.word)
                        .eq('description', wordToDelete.description);
                    
                    if (!error) {
                        console.log('Deleted from cloud by matching:', wordToDelete.word);
                    } else {
                        console.error('Delete by match error:', error);
                    }
                }
                
                updateSyncStatus('synced');
            } catch (error) {
                console.error('Cloud deletion error:', error);
                updateSyncStatus('error');
            }
        }
        
        // Refresh the list
        await renderWordsList();
        showToast('Word deleted successfully!');
    } catch (error) {
        console.error('Error deleting word:', error);
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
    
    // Check authentication status
    if (supabaseEnabled) {
        await checkAuth();
        
        // Pull data from cloud if logged in
        if (currentUser) {
            await pullFromCloud();
        }
    }
    
    // Clear search input on page load (in case browser autofilled it)
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    
    renderWordsList();
    console.log('Dictionary Notebook initialized!', currentUser ? '(Logged in)' : '(Guest mode)');
}).catch(err => {
    console.error('Failed to initialize database:', err);
    alert('Failed to initialize app. Please try refreshing the page.');
});

// ===== AUTH EVENT LISTENERS =====

// Login button
document.getElementById('loginBtn').addEventListener('click', () => {
    const modal = new bootstrap.Modal(document.getElementById('loginModal'));
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    modal.show();
});

// Login submit
document.getElementById('loginSubmitBtn').addEventListener('click', async function() {
    this.blur();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    
    if (!email || !password) {
        errorDiv.textContent = 'Please enter both email and password';
        errorDiv.style.display = 'block';
        return;
    }
    
    try {
        this.disabled = true;
        this.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Logging in...';
        
        await handleLogin(email, password);
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
        modal.hide();
        
        showToast('Logged in successfully!');
    } catch (error) {
        errorDiv.textContent = error.message || 'Login failed';
        errorDiv.style.display = 'block';
    } finally {
        this.disabled = false;
        this.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Login';
    }
});

// Signup button
document.getElementById('signupBtn').addEventListener('click', () => {
    const modal = new bootstrap.Modal(document.getElementById('signupModal'));
    document.getElementById('signupError').style.display = 'none';
    document.getElementById('signupSuccess').style.display = 'none';
    document.getElementById('signupEmail').value = '';
    document.getElementById('signupPassword').value = '';
    document.getElementById('signupPasswordConfirm').value = '';
    modal.show();
});

// Signup submit
document.getElementById('signupSubmitBtn').addEventListener('click', async function() {
    this.blur();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const passwordConfirm = document.getElementById('signupPasswordConfirm').value;
    const errorDiv = document.getElementById('signupError');
    const successDiv = document.getElementById('signupSuccess');
    
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';
    
    if (!email || !password || !passwordConfirm) {
        errorDiv.textContent = 'Please fill in all fields';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (password.length < 6) {
        errorDiv.textContent = 'Password must be at least 6 characters';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (password !== passwordConfirm) {
        errorDiv.textContent = 'Passwords do not match';
        errorDiv.style.display = 'block';
        return;
    }
    
    try {
        this.disabled = true;
        this.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Creating account...';
        
        const result = await handleSignup(email, password);
        
        // Auto-login after signup if email confirmation is disabled
        if (result.user && !result.user.identities || result.session) {
            await handleLogin(email, password);
            const modal = bootstrap.Modal.getInstance(document.getElementById('signupModal'));
            modal.hide();
            showToast('Account created and logged in!');
        } else {
            successDiv.textContent = 'Account created successfully! You can now login.';
            successDiv.style.display = 'block';
            
            // Clear form
            document.getElementById('signupEmail').value = '';
            document.getElementById('signupPassword').value = '';
            document.getElementById('signupPasswordConfirm').value = '';
            
            // Auto-close modal after 2 seconds
            setTimeout(() => {
                const modal = bootstrap.Modal.getInstance(document.getElementById('signupModal'));
                modal.hide();
            }, 2000);
        }
    } catch (error) {
        errorDiv.textContent = error.message || 'Signup failed';
        errorDiv.style.display = 'block';
    } finally {
        this.disabled = false;
        this.innerHTML = '<i class="bi bi-person-plus"></i> Sign Up';
    }
});

// Logout button
document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        await handleLogout();
        showToast('Logged out successfully');
    } catch (error) {
        alert('Logout failed: ' + error.message);
    }
});

// Footer register link
document.getElementById('registerLinkFooter').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('signupBtn').click();
});

// Online/Offline detection
window.addEventListener('online', async () => {
    isOnline = true;
    console.log('Back online - syncing...');
    if (supabaseClient && currentUser) {
        await pullFromCloud();
    }
});

window.addEventListener('offline', () => {
    isOnline = false;
    updateSyncStatus('offline');
    console.log('Offline - changes will sync when back online');
});

/* Cache bust: Mon Jan 26 11:20:21 EET 2026 */
