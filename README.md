# Spotify Now Playing - Shared Music Profile

A beautiful web app that lets you share what you're listening to on Spotify in real-time! Each user gets their own unique, shareable URL that displays their current track, top songs, and recent listens.

## ✨ Features

- 🎵 **Real-time Now Playing** - See what someone is listening to right now
- 🎨 **Beautiful UI** - Custom cursor, smooth animations, and Spotify-inspired design
- 📊 **Top Tracks & Recent Plays** - Shows most played and recently played songs
- 🔗 **Shareable Links** - Each user gets a unique URL (e.g., `yoursite.com/username`)
- 📱 **Fully Responsive** - Works perfectly on desktop, tablet, and mobile

## 🚀 Setup Instructions

### 1. Get Spotify API Credentials

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click "Create app"
3. Fill in the details:
   - **App name**: Spotify Now Playing
   - **App description**: Share what you're listening to
   - **Redirect URI**: `http://localhost:3000/callback` (for local dev)
4. Click "Create"
5. Copy your **Client ID** and **Client Secret**

### 2. Configure the Application

1. Open `server.js` and replace the placeholders:
   ```javascript
   const CLIENT_ID = 'your_client_id_here';
   const CLIENT_SECRET = 'your_client_secret_here';
   ```

2. If deploying to production, update the `REDIRECT_URI`:
   ```javascript
   const REDIRECT_URI = 'https://yourdomain.com/callback';
   ```
   
   **Important**: Add this same redirect URI to your Spotify app settings!

### 3. Install Dependencies

```bash
npm install
```

### 4. Run the Server

```bash
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

The server will start on `http://localhost:3000`

### 5. Connect Your Account

1. Visit `http://localhost:3000`
2. Click "Connect with Spotify"
3. Authorize the app
4. You'll get your unique shareable URL!

## 🌐 Deployment

### Option 1: Deploy to Heroku

1. Create a Heroku app:
   ```bash
   heroku create your-app-name
   ```

2. Set environment variables:
   ```bash
   heroku config:set CLIENT_ID=your_client_id
   heroku config:set CLIENT_SECRET=your_client_secret
   heroku config:set REDIRECT_URI=https://your-app-name.herokuapp.com/callback
   ```

3. Deploy:
   ```bash
   git push heroku main
   ```

4. Update Spotify app redirect URI to: `https://your-app-name.herokuapp.com/callback`

### Option 2: Deploy to VPS (DigitalOcean, AWS, etc.)

1. SSH into your server
2. Clone the repository
3. Install Node.js and dependencies
4. Set up environment variables
5. Use PM2 to keep the server running:
   ```bash
   npm install -g pm2
   pm2 start server.js
   pm2 save
   ```

6. Set up nginx as a reverse proxy
7. Configure SSL with Let's Encrypt

### Option 3: Deploy to Vercel/Netlify (Serverless)

You'll need to adapt the code to use serverless functions. The current version is designed for a traditional Node.js server.

## 📦 Database (Production)

The current version uses an in-memory Map for storing users. For production, you should use a real database:

### MongoDB Example:

```bash
npm install mongodb
```

```javascript
const { MongoClient } = require('mongodb');
const client = new MongoClient(process.env.MONGODB_URI);

// Replace the users Map with MongoDB operations
```

### PostgreSQL Example:

```bash
npm install pg
```

## 🎨 Customization

### Change Colors

Edit the CSS variables in `public/viewer.html` and `public/setup.html`:

```css
:root {
    --bg-dark: #0a0e27;
    --bg-card: #151b3d;
    --accent: #1db954;
    --accent-bright: #1ed760;
}
```

### Modify Layout

The layout uses CSS Grid. Adjust in `public/viewer.html`:

```css
.layout-grid {
    grid-template-columns: 280px 1fr 280px; /* left sidebar, center, right sidebar */
}
```

## 🔒 Security Notes

- **Never commit your Client Secret** to version control
- Use environment variables in production
- Consider implementing rate limiting
- Add CORS protection if needed
- Implement proper session management for production

## 📝 URL Structure

- `/` - Setup page (connect Spotify account)
- `/success?username=...` - Success page after connecting
- `/:username` - Public viewer page (anyone can visit)
- `/api/nowplaying/:username` - API endpoint for now playing data
- `/api/toptracks/:username` - API endpoint for top tracks
- `/api/recent/:username` - API endpoint for recently played

## 🛠️ Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: Vanilla JavaScript (no frameworks)
- **API**: Spotify Web API
- **Auth**: OAuth 2.0 with PKCE

## 🤝 Contributing

Feel free to fork and improve! Some ideas:
- Add user profiles with bio/social links
- Implement playlist sharing
- Add listening statistics/charts
- Theme customization per user
- Friend system to see what friends are playing

## 📄 License

MIT License - feel free to use for personal or commercial projects!

## 🎉 Credits

Built with ❤️ using the Spotify Web API
