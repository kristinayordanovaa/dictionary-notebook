# Dictionary Notebook PWA

A Progressive Web App for managing your personal dictionary with cloud sync and multi-device support.

## Features

- ✅ **User Authentication**: Sign up and login to sync your words across devices
- ✅ **Cloud Sync**: Automatic synchronization with Supabase backend
- ✅ **Guest Mode**: Use locally without an account (offline-only)
- ✅ **Multi-Device Support**: Access your dictionary from any device when logged in
- ✅ **Local Storage**: All data saved in IndexedDB (works offline)
- ✅ **PWA**: Installable on iOS and Android
- ✅ **Search**: Filter your saved words
- ✅ **CRUD operations**: Create, read, update, delete words
- ✅ **Duplicate Detection**: Smart detection of similar words
- ✅ **Responsive**: Works on mobile and desktop
- ✅ **Bootstrap 5**: Modern, clean UI

## How It Works

### Guest Mode (Offline)
- Use the app without creating an account
- All words saved locally in your browser
- Works completely offline
- Data stays on your device only

### Authenticated Mode (Cloud Sync)
1. **Sign Up**: Create an account with email and password
2. **Login**: Access your dictionary from any device
3. **Auto Sync**: Every add/edit/delete automatically syncs to cloud
4. **Cross-Device**: Words appear on all your logged-in devices
5. **Private**: Each user has their own private dictionary

**Note**: You need to be logged in to sync data across devices. Guest mode keeps everything local.

## Installation on Devices

### Android (Chrome/Edge)
1. Visit the website
2. Tap the "Install app" prompt or menu option
3. App icon added to home screen

### iOS (Safari)
1. Visit the website in Safari
2. Tap the Share button (square with arrow)
3. Select "Add to Home Screen"
4. Tap "Add"


## File Structure

```
Dictionary-notebook/
├── index.html          # Main HTML file
├── styles.css          # Custom styles
├── app.js              # Application logic
├── config.js           # Supabase configuration
├── manifest.json       # PWA manifest
├── service-worker.js   # Service worker for offline
├── netlify.toml        # Netlify configuration
├── icon-192.png        # App icon (192x192)
├── icon-512.png        # App icon (512x512)
└── README.md           # This file
```

## Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **UI Framework**: Bootstrap 5
- **Local Storage**: IndexedDB
- **Backend**: Supabase (PostgreSQL + Authentication)
- **Hosting**: Netlify
- **PWA**: Service Worker, Web App Manifest


