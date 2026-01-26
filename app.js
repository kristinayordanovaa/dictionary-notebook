// IndexedDB Setup
let db;
const DB_NAME = 'DictionaryDB';
const DB_VERSION = 1;
const STORE_NAME = 'words';

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
            : '<tr><td colspan="3" class="text-muted text-center">No words saved yet. Click "Add Word" to start building your dictionary!</td></tr>';
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

document.getElementById('saveBtn').addEventListener('click', async () => {
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
        
        // Store the data for the confirm button
        document.getElementById('confirmUpdateBtn').dataset.existingId = existingWord.id;
        document.getElementById('confirmUpdateBtn').dataset.word = word;
        document.getElementById('confirmUpdateBtn').dataset.description = description;
        
        const updateModal = new bootstrap.Modal(document.getElementById('updateConfirmModal'));
        updateModal.show();
        return;
    }
    
    // If word doesn't exist, save it directly
    await performSave(null, word, description);
});

// Handle the actual save/update when confirmed
document.getElementById('confirmUpdateBtn').addEventListener('click', async function() {
    const existingId = parseInt(this.dataset.existingId);
    const word = this.dataset.word;
    const description = this.dataset.description;
    
    // Close the update confirmation modal
    const updateModal = bootstrap.Modal.getInstance(document.getElementById('updateConfirmModal'));
    updateModal.hide();
    
    await performSave(existingId, word, description);
});

async function performSave(existingId, word, description) {
    try {
        if (existingId) {
            await updateWord(existingId, word, description);
        } else {
            await saveWord(word, description);
        }
        if (existingId) {
            await updateWord(existingId, word, description);
        } else {
            await saveWord(word, description);
        }
        
        // Clear inputs
        document.getElementById('wordInput').value = '';
        document.getElementById('descriptionInput').value = '';
        document.getElementById('existingWordAlert').style.display = 'none';
        
        // Close add word modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('addWordModal'));
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
    
    try {
        await deleteWord(id);
        
        // Close the modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('deleteModal'));
        modal.hide();
        
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
initDB().then(() => {
    renderWordsList();
    console.log('Dictionary Notebook initialized!');
}).catch(err => {
    console.error('Failed to initialize database:', err);
    alert('Failed to initialize app. Please try refreshing the page.');
});
/* Cache bust: Mon Jan 26 11:20:21 EET 2026 */
