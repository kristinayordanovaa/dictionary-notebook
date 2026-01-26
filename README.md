# Dictionary Notebook PWA

A cloud-based Progressive Web App for managing your personal dictionary with real-time sync across all your devices.

## Features

- ✅ **User Authentication**: Required - Sign up and login to use the app
- ✅ **Cloud Storage**: All data stored securely in Supabase cloud database
- ✅ **Real-Time Sync**: Instant synchronization across all your devices
- ✅ **Multi-Device Support**: Access your dictionary from anywhere
- ✅ **PWA**: Installable on iOS and Android
- ✅ **Search**: Filter your saved words
- ✅ **CRUD operations**: Create, read, update, delete words
- ✅ **Duplicate Detection**: Smart detection of similar words
- ✅ **Responsive**: Works on mobile and desktop
- ✅ **Bootstrap 5**: Modern, clean UI

## How It Works

### Cloud-Only Architecture
1. **Sign Up**: Create an account with email and password (required to use the app)
2. **Login**: Access your dictionary from any device
3. **Real-Time Sync**: All operations (add/edit/delete) go directly to the cloud
4. **Cross-Device**: Words instantly appear on all your logged-in devices
5. **Private**: Each user has their own private dictionary with row-level security

**Note**: Authentication is required to use this app. All data is stored in the cloud, not locally. This ensures your dictionary is always available on any device you log in from.

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
- **Backend**: Supabase (PostgreSQL + Authentication + Row-Level Security)
- **Cloud Database**: Supabase PostgreSQL
- **Hosting**: Netlify
- **PWA**: Service Worker, Web App Manifest


