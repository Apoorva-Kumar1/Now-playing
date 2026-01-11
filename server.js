const express = require('express');
const fetch = require('node-fetch');
const crypto = require('crypto');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const CLIENT_ID = 'dbd2a713c83b42cc946fdc3469b0f4b5';
const CLIENT_SECRET = '3ef61d01c4744af1a51788202d042dd0'; // Get this from Spotify Dashboard
const REDIRECT_URI = 'https://nowplaying.heyaprv.dev/callback';

// Initialize SQLite database
const db = new Database('users.db');

// Create tables
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        id TEXT NOT NULL,
        displayName TEXT,
        accessToken TEXT NOT NULL,
        refreshToken TEXT,
        expiresAt INTEGER NOT NULL,
        createdAt INTEGER NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS sessions (
        state TEXT PRIMARY KEY,
        codeVerifier TEXT NOT NULL,
        timestamp INTEGER NOT NULL
    );
`);

// Helper functions for database
const dbHelpers = {
    getUser: (username) => {
        return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    },
    
    saveUser: (username, userData) => {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO users (username, id, displayName, accessToken, refreshToken, expiresAt, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            username,
            userData.id,
            userData.displayName,
            userData.accessToken,
            userData.refreshToken,
            userData.expiresAt,
            userData.createdAt
        );
    },
    
    updateToken: (username, accessToken, refreshToken, expiresAt) => {
        const stmt = db.prepare(`
            UPDATE users 
            SET accessToken = ?, refreshToken = ?, expiresAt = ?
            WHERE username = ?
        `);
        stmt.run(accessToken, refreshToken || dbHelpers.getUser(username).refreshToken, expiresAt, username);
    },
    
    saveSession: (state, codeVerifier) => {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO sessions (state, codeVerifier, timestamp)
            VALUES (?, ?, ?)
        `);
        stmt.run(state, codeVerifier, Date.now());
    },
    
    getSession: (state) => {
        return db.prepare('SELECT * FROM sessions WHERE state = ?').get(state);
    },
    
    deleteSession: (state) => {
        db.prepare('DELETE FROM sessions WHERE state = ?').run(state);
    },
    
    cleanOldSessions: () => {
        // Delete sessions older than 10 minutes
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        db.prepare('DELETE FROM sessions WHERE timestamp < ?').run(tenMinutesAgo);
    }
};

// Clean old sessions every hour
setInterval(dbHelpers.cleanOldSessions, 60 * 60 * 1000);

app.use(express.json());
app.use(express.static('public'));

// Helper functions
function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
}

async function generateCodeChallenge(verifier) {
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return hash.toString('base64url');
}

// Routes

// Home page - shows login/setup
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'setup.html'));
});

// Start OAuth flow
app.get('/auth/login', async (req, res) => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    
    // Store verifier in database
    const state = crypto.randomBytes(16).toString('hex');
    dbHelpers.saveSession(state, codeVerifier);
    
    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.append('client_id', CLIENT_ID);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('scope', 'user-read-currently-playing user-read-playback-state user-top-read user-read-recently-played user-read-private user-read-email');
    authUrl.searchParams.append('code_challenge_method', 'S256');
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('state', state);
    
    res.redirect(authUrl.toString());
});

// OAuth callback
app.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    
    const sessionData = dbHelpers.getSession(state);
    if (!sessionData) {
        return res.status(400).send('Invalid state');
    }
    
    const { codeVerifier } = sessionData;
    
    try {
        // Exchange code for token
        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URI,
                code_verifier: codeVerifier,
            }),
        });
        
        const tokens = await tokenResponse.json();
        
        if (!tokens.access_token) {
            throw new Error('No access token received');
        }
        
        // Get user profile
        const profileResponse = await fetch('https://api.spotify.com/v1/me', {
            headers: { 'Authorization': `Bearer ${tokens.access_token}` }
        });
        
        const profile = await profileResponse.json();
        
        // Create username from display name or ID
        const username = profile.display_name?.toLowerCase().replace(/\s+/g, '') || profile.id;
        
        // Store user data in database
        dbHelpers.saveUser(username, {
            id: profile.id,
            displayName: profile.display_name,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: Date.now() + (tokens.expires_in * 1000),
            createdAt: Date.now()
        });
        
        // Clean up state
        dbHelpers.deleteSession(state);
        
        res.redirect(`/success?username=${username}`);
    } catch (error) {
        console.error('Error in callback:', error);
        res.status(500).send('Authentication failed');
    }
});

// Refresh access token
async function refreshAccessToken(username) {
    const user = dbHelpers.getUser(username);
    if (!user || !user.refreshToken) {
        return null;
    }
    
    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                grant_type: 'refresh_token',
                refresh_token: user.refreshToken,
            }),
        });
        
        const tokens = await response.json();
        
        if (tokens.access_token) {
            dbHelpers.updateToken(
                username,
                tokens.access_token,
                tokens.refresh_token,
                Date.now() + (tokens.expires_in * 1000)
            );
            return tokens.access_token;
        }
    } catch (error) {
        console.error('Error refreshing token:', error);
    }
    
    return null;
}

// Get valid access token (refresh if needed)
async function getValidAccessToken(username) {
    const user = dbHelpers.getUser(username);
    if (!user) return null;
    
    // Check if token is expired
    if (Date.now() >= user.expiresAt - 60000) { // Refresh 1 minute before expiry
        const newToken = await refreshAccessToken(username);
        return newToken || user.accessToken;
    }
    
    return user.accessToken;
}

// API: Get user's now playing
app.get('/api/nowplaying/:username', async (req, res) => {
    const { username } = req.params;
    const user = dbHelpers.getUser(username);
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    const accessToken = await getValidAccessToken(username);
    if (!accessToken) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    
    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.status === 204 || response.status === 404) {
            return res.json({ 
                isPlaying: false,
                displayName: user.displayName
            });
        }
        
        if (!response.ok) {
            throw new Error('Failed to fetch now playing');
        }
        
        const data = await response.json();
        
        res.json({
            isPlaying: true,
            displayName: user.displayName,
            track: {
                name: data.item.name,
                artist: data.item.artists.map(a => a.name).join(', '),
                album: data.item.album.name,
                albumArt: data.item.album.images[0]?.url,
                url: data.item.external_urls.spotify,
                duration: data.item.duration_ms,
                progress: data.progress_ms
            },
            playing: data.is_playing
        });
    } catch (error) {
        console.error('Error fetching now playing:', error);
        res.status(500).json({ error: 'Failed to fetch now playing' });
    }
});

// API: Get user's top tracks
app.get('/api/toptracks/:username', async (req, res) => {
    const { username } = req.params;
    const accessToken = await getValidAccessToken(username);
    
    if (!accessToken) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    
    try {
        const response = await fetch('https://api.spotify.com/v1/me/top/tracks?limit=5&time_range=short_term', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        const data = await response.json();
        
        res.json({
            tracks: data.items.map(track => ({
                name: track.name,
                artist: track.artists.map(a => a.name).join(', '),
                albumArt: track.album.images[2]?.url || track.album.images[0]?.url
            }))
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch top tracks' });
    }
});

// API: Get user's recently played
app.get('/api/recent/:username', async (req, res) => {
    const { username } = req.params;
    const accessToken = await getValidAccessToken(username);
    
    if (!accessToken) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    
    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=5', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        const data = await response.json();
        
        res.json({
            tracks: data.items.map(item => ({
                name: item.track.name,
                artist: item.track.artists.map(a => a.name).join(', '),
                albumArt: item.track.album.images[2]?.url || item.track.album.images[0]?.url
            }))
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch recent tracks' });
    }
});

// Success page - MUST come before /:username route
app.get('/success', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'success.html'));
});

// View user's now playing page
app.get('/:username', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Setup your account at: http://localhost:${PORT}`);
});
