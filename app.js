// Cloud-Only Dictionary App - Supabase Backend
// No local storage, authentication required

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
    console.error('Supabase not configured');
    return false;
}

// ===== AUTHENTICATION FUNCTIONS =====

async function checkAuth() {
    if (!supabaseClient) return null;
    
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        currentUser = session.user;
        showMainApp();
        return session.user;
    }
    
    showAuthScreen();
    return null;
}

function showMainApp() {
    document.getElementById('mainContent').style.display = 'block';
    document.getElementById('authLanding').style.display = 'none';
    document.querySelector('nav').style.display = 'block';
    document.getElementById('userEmail').textContent = currentUser.email;
    console.log('Logged in as:', currentUser.email);
}

function showAuthScreen() {
    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('authLanding').style.display = 'block';
    document.querySelector('nav').style.display = 'none';
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
    
    // Auto login after signup
    currentUser = data.user;
    showMainApp();
    await renderWordsList();
    
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
    showMainApp();
    await renderWordsList();
    
    return data;
}

async function handleLogout() {
    if (!supabaseClient) return;
    
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    
    currentUser = null;
    document.getElementById('mainContent').style.display = 'none';
    
    // Clear the search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    
    // Reload page to show auth screen
    window.location.reload();
}

// ===== CLOUD DATABASE FUNCTIONS =====

async function getAllWordsFromCloud() {
    if (!supabaseClient || !currentUser) return [];
    
    const { data, error } = await supabaseClient
        .from('words')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('timestamp', { ascending: false });
    
    if (error) {
        console.error('Error fetching words:', error);
        return [];
    }
    
    return data || [];
}

async function saveWordToCloud(word, description) {
    if (!supabaseClient || !currentUser) {
        throw new Error('Not authenticated');
    }
    
    const { data, error } = await supabaseClient
        .from('words')
        .insert([{
            user_id: currentUser.id,
            word: word,
            description: description,
            timestamp: new Date().toISOString()
        }])
        .select();
    
    if (error) throw error;
    return data[0];
}

async function updateWordInCloud(id, word, description) {
    if (!supabaseClient || !currentUser) {
        throw new Error('Not authenticated');
    }
    
    const { data, error } = await supabaseClient
        .from('words')
        .update({
            word: word,
            description: description,
            timestamp: new Date().toISOString()
        })
        .eq('id', id)
        .eq('user_id', currentUser.id)
        .select();
    
    if (error) throw error;
    return data[0];
}

async function deleteWordFromCloud(id) {
    if (!supabaseClient || !currentUser) {
        throw new Error('Not authenticated');
    }
    
    const { error } = await supabaseClient
        .from('words')
        .delete()
        .eq('id', id)
        .eq('user_id', currentUser.id);
    
    if (error) throw error;
}

async function findWordByName(word) {
    const words = await getAllWordsFromCloud();
    const searchTerm = word.toLowerCase();
    return words.find(w => {
        const existingWord = w.word.toLowerCase();
        return existingWord.includes(searchTerm) || searchTerm.includes(existingWord);
    });
}

// ===== UI FUNCTIONS =====

async function renderWordsList(searchTerm = '') {
    const words = await getAllWordsFromCloud();
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

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'position-fixed bottom-0 end-0 p-3';
    toast.style.zIndex = '11';
    toast.innerHTML = `
        <div class="toast show" role="alert">
            <div class="toast-body">
                ${message}
            </div>
        </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ===== EVENT HANDLERS =====

// Add Word
document.getElementById('addWordBtn').addEventListener('click', () => {
    document.getElementById('wordInput').value = '';
    document.getElementById('descriptionInput').value = '';
    document.getElementById('existingWordAlert').style.display = 'none';
    
    const modal = new bootstrap.Modal(document.getElementById('addWordModal'));
    modal.show();
});

// Word input - check for duplicates
document.getElementById('wordInput').addEventListener('input', async (e) => {
    const word = e.target.value.trim();
    const alertDiv = document.getElementById('existingWordAlert');
    
    if (word.length < 2) {
        alertDiv.style.display = 'none';
        return;
    }
    
    const existing = await findWordByName(word);
    if (existing) {
        document.getElementById('existingWordText').textContent = 
            `Word "${existing.word}" already exists with translation: "${existing.description}"`;
        alertDiv.style.display = 'block';
    } else {
        alertDiv.style.display = 'none';
    }
});

// Save new word
document.getElementById('saveBtn').addEventListener('click', async function() {
    const word = document.getElementById('wordInput').value.trim();
    const description = document.getElementById('descriptionInput').value.trim();
    
    if (!word || !description) {
        alert('Please fill in all fields.');
        return;
    }
    
    this.blur();
    
    try {
        const existing = await findWordByName(word);
        
        if (existing) {
            // Show duplicate modal
            document.getElementById('duplicateWordName').textContent = existing.word;
            document.getElementById('duplicateWordDescription').textContent = existing.description;
            document.getElementById('confirmUpdateBtn').dataset.updateId = existing.id;
            
            const addModal = bootstrap.Modal.getInstance(document.getElementById('addWordModal'));
            addModal.hide();
            
            const duplicateModal = new bootstrap.Modal(document.getElementById('duplicateModal'));
            duplicateModal.show();
        } else {
            // Save new word
            await saveWordToCloud(word, description);
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('addWordModal'));
            modal.hide();
            
            await renderWordsList();
            showToast('Word added successfully!');
        }
    } catch (error) {
        alert('Error saving word: ' + error.message);
    }
});

// Update existing word from duplicate modal
document.getElementById('confirmUpdateBtn').addEventListener('click', async function() {
    const id = parseInt(this.dataset.updateId);
    const word = document.getElementById('wordInput').value.trim();
    const description = document.getElementById('descriptionInput').value.trim();
    
    this.blur();
    
    try {
        await updateWordInCloud(id, word, description);
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('duplicateModal'));
        modal.hide();
        
        await renderWordsList();
        showToast('Word updated successfully!');
    } catch (error) {
        alert('Error updating word: ' + error.message);
    }
});

// Add as new from duplicate modal
document.getElementById('addAsNewBtn').addEventListener('click', async function() {
    const word = document.getElementById('wordInput').value.trim();
    const description = document.getElementById('descriptionInput').value.trim();
    
    this.blur();
    
    try {
        await saveWordToCloud(word, description);
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('duplicateModal'));
        modal.hide();
        
        await renderWordsList();
        showToast('Word added successfully!');
    } catch (error) {
        alert('Error saving word: ' + error.message);
    }
});

// Search
document.getElementById('searchInput').addEventListener('input', (e) => {
    renderWordsList(e.target.value);
});

// Edit word
let currentEditId = null;
let currentEditData = null;

async function handleEdit(e) {
    e.stopPropagation();
    const id = parseInt(e.currentTarget.dataset.id);
    
    if (!id || isNaN(id)) {
        console.error('Invalid ID for edit');
        return;
    }
    
    currentEditId = id;
    
    try {
        const words = await getAllWordsFromCloud();
        currentEditData = words.find(w => w.id === id);
        
        if (!currentEditData) {
            console.error('Word not found');
            return;
        }
        
        document.getElementById('editWord').value = currentEditData.word;
        document.getElementById('editDescription').value = currentEditData.description;
        
        const modal = new bootstrap.Modal(document.getElementById('editModal'));
        modal.show();
    } catch (error) {
        alert('Error loading word: ' + error.message);
    }
}

// Update word
document.getElementById('updateBtn').addEventListener('click', async () => {
    const word = document.getElementById('editWord').value.trim();
    const description = document.getElementById('editDescription').value.trim();
    
    if (!word || !description) {
        alert('Please fill in all fields.');
        return;
    }
    
    try {
        await updateWordInCloud(currentEditId, word, description);
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('editModal'));
        modal.hide();
        
        await renderWordsList();
        showToast('Word updated successfully!');
    } catch (error) {
        alert('Error updating word: ' + error.message);
    }
});

// Delete word
async function handleDelete(e) {
    e.stopPropagation();
    const id = parseInt(e.currentTarget.dataset.id);
    
    if (!id || isNaN(id)) {
        console.error('Invalid ID for delete');
        return;
    }
    
    try {
        const words = await getAllWordsFromCloud();
        const word = words.find(w => w.id === id);
        
        if (!word) {
            console.error('Word not found for deletion');
            return;
        }
        
        document.getElementById('deleteWordName').textContent = word.word;
        document.getElementById('confirmDeleteBtn').dataset.deleteId = id;
        
        const modal = new bootstrap.Modal(document.getElementById('deleteModal'));
        modal.show();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Confirm delete
document.getElementById('confirmDeleteBtn').addEventListener('click', async function() {
    const id = parseInt(this.dataset.deleteId);
    
    this.blur();
    
    const modalEl = document.getElementById('deleteModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
    
    try {
        await deleteWordFromCloud(id);
        await renderWordsList();
        showToast('Word deleted successfully!');
    } catch (error) {
        alert('Error deleting word: ' + error.message);
    }
});

// ===== PWA INSTALL =====

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('installBtn').style.display = 'inline-block';
});

document.getElementById('installBtn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);
    
    deferredPrompt = null;
    document.getElementById('installBtn').style.display = 'none';
});

// ===== AUTH EVENT LISTENERS =====

// Signup
document.getElementById('signupSubmitBtn').addEventListener('click', async function() {
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;
    const errorDiv = document.getElementById('signupError');
    
    errorDiv.style.display = 'none';
    
    if (!email || !password || !confirmPassword) {
        errorDiv.textContent = 'Please fill in all fields';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (password !== confirmPassword) {
        errorDiv.textContent = 'Passwords do not match';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (password.length < 6) {
        errorDiv.textContent = 'Password must be at least 6 characters';
        errorDiv.style.display = 'block';
        return;
    }
    
    this.blur();
    this.disabled = true;
    this.textContent = 'Creating account...';
    
    try {
        await handleSignup(email, password);
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('signupModal'));
        modal.hide();
        
        showToast('Account created successfully!');
    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.style.display = 'block';
    } finally {
        this.disabled = false;
        this.textContent = 'Sign Up';
    }
});

// Login - Enter key support
document.getElementById('loginEmail').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('loginSubmitBtn').click();
    }
});

document.getElementById('loginPassword').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('loginSubmitBtn').click();
    }
});

// Login
document.getElementById('loginSubmitBtn').addEventListener('click', async function() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    
    errorDiv.style.display = 'none';
    
    if (!email || !password) {
        errorDiv.textContent = 'Please enter both email and password';
        errorDiv.style.display = 'block';
        return;
    }
    
    this.blur();
    this.disabled = true;
    this.textContent = 'Logging in...';
    
    try {
        await handleLogin(email, password);
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
        modal.hide();
        
        showToast('Logged in successfully!');
    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.style.display = 'block';
    } finally {
        this.disabled = false;
        this.textContent = 'Login';
    }
});

// Switch between login and signup
document.getElementById('showLoginLink').addEventListener('click', (e) => {
    e.preventDefault();
    const signupModal = bootstrap.Modal.getInstance(document.getElementById('signupModal'));
    signupModal.hide();
    
    const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
    loginModal.show();
});

document.getElementById('showSignupLink').addEventListener('click', (e) => {
    e.preventDefault();
    const loginModal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
    loginModal.hide();
    
    const signupModal = new bootstrap.Modal(document.getElementById('signupModal'));
    signupModal.show();
});

// Refresh
document.getElementById('refreshBtn').addEventListener('click', async () => {
    const refreshBtn = document.getElementById('refreshBtn');
    const icon = refreshBtn.querySelector('i');
    
    try {
        // Add spinning animation
        icon.classList.add('fa-spin');
        refreshBtn.disabled = true;
        
        // Fetch and render latest words
        await renderWordsList();
        
        showToast('Words refreshed successfully!');
    } catch (error) {
        showToast('Refresh failed: ' + error.message);
    } finally {
        // Remove spinning animation
        icon.classList.remove('fa-spin');
        refreshBtn.disabled = false;
    }
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        await handleLogout();
    } catch (error) {
        alert('Logout failed: ' + error.message);
    }
});

// Online/Offline detection
window.addEventListener('online', async () => {
    isOnline = true;
    console.log('Back online');
    if (currentUser) {
        await renderWordsList();
    }
});

window.addEventListener('offline', () => {
    isOnline = false;
    console.log('Offline');
});

// ===== LANDING PAGE AUTH BUTTONS =====

document.getElementById('landingLoginBtn').addEventListener('click', () => {
    const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
    loginModal.show();
});

document.getElementById('landingSignupBtn').addEventListener('click', () => {
    const signupModal = new bootstrap.Modal(document.getElementById('signupModal'));
    signupModal.show();
});

// ===== INITIALIZE APP =====

initSupabase();
checkAuth().then(async (user) => {
    if (user) {
        await renderWordsList();
        
        // Clear search input on page load
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
        
        console.log('Dictionary Notebook initialized!');
    }
}).catch(err => {
    console.error('Failed to initialize app:', err);
    alert('Failed to initialize app. Please try refreshing the page.');
});

/* Cache bust: Cloud-Only Version */
