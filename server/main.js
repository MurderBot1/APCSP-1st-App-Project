const path = require('path');
const crypto = require('crypto');
const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;

const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const CREATE_USERS_TABLE = `
    CREATE TABLE IF NOT EXISTS users (
        username VARCHAR(64) PRIMARY KEY,
        salt CHAR(32) NOT NULL,
        hash CHAR(128) NOT NULL
    )
`;
const CREATE_SESSIONS_TABLE = `
    CREATE TABLE IF NOT EXISTS sessions (
        token_hash CHAR(64) PRIMARY KEY,
        username VARCHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
    )
`;
const CREATE_DECKS_TABLE = `
    CREATE TABLE IF NOT EXISTS decks (
        deck_key CHAR(64) PRIMARY KEY,
        username VARCHAR(64) NOT NULL,
        name VARCHAR(100) NOT NULL DEFAULT 'Untitled deck',
        FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
    )
`;
const CREATE_DECK_CARDS_TABLE = `
    CREATE TABLE IF NOT EXISTS deck_cards (
        deck_key CHAR(64) NOT NULL,
        card_id VARCHAR(64) NOT NULL,
        PRIMARY KEY (deck_key, card_id),
        FOREIGN KEY (deck_key) REFERENCES decks(deck_key) ON DELETE CASCADE
    )
`;
const SELECT_DECKS_NAME_COLUMN = `
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'decks' AND column_name = 'name'
`;
const ADD_DECKS_NAME_COLUMN = "ALTER TABLE decks ADD COLUMN name VARCHAR(100) NOT NULL DEFAULT 'Untitled deck'";
const DELETE_EXPIRED_SESSIONS = 'DELETE FROM sessions WHERE expires_at < NOW()';
const INSERT_SESSION = 'INSERT INTO sessions (token_hash, username, expires_at) VALUES (?, ?, ?)';
const SELECT_SESSION_USER = 'SELECT username FROM sessions WHERE token_hash = ? AND expires_at > NOW()';
const DELETE_SESSION = 'DELETE FROM sessions WHERE token_hash = ?';
const INSERT_USER = 'INSERT INTO users (username, salt, hash) VALUES (?, ?, ?)';
const SELECT_USER_CREDENTIALS = 'SELECT salt, hash FROM users WHERE username = ?';
const SELECT_USER_DECKS = 'SELECT deck_key, name FROM decks WHERE username = ?';
const INSERT_DECK = 'INSERT INTO decks (deck_key, username) VALUES (?, ?)';
const SELECT_OWNED_DECK = 'SELECT deck_key FROM decks WHERE deck_key = ? AND username = ?';
const SELECT_DECK_CARDS = 'SELECT card_id FROM deck_cards WHERE deck_key = ?';
const UPDATE_DECK_NAME = 'UPDATE decks SET name = ? WHERE deck_key = ? AND username = ?';
const INSERT_DECK_CARD = 'INSERT IGNORE INTO deck_cards (deck_key, card_id) VALUES (?, ?)';
const CREATE_USER_SETTINGS_TABLE = 'CREATE TABLE IF NOT EXISTS user_settings (username VARCHAR(64) PRIMARY KEY, currency VARCHAR(3) NOT NULL DEFAULT \'USD\', FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE)';

async function initDatabase() {
    await db.query(CREATE_USERS_TABLE);
    await db.query(CREATE_SESSIONS_TABLE);
    await db.query(CREATE_DECKS_TABLE);
    await db.query(CREATE_USER_SETTINGS_TABLE);
    // CREATE TABLE IF NOT EXISTS won't add the column to a table created before it existed
    const [nameColumn] = await db.query(SELECT_DECKS_NAME_COLUMN);
    if (!nameColumn.length) {
        await db.query(ADD_DECKS_NAME_COLUMN);
    }
    await db.query(CREATE_DECK_CARDS_TABLE);
    await db.query(DELETE_EXPIRED_SESSIONS);
}

const SESSION_COOKIE = 'session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function readSessionToken(req) {
    const cookies = (req.headers.cookie ?? '').split(';');
    for (const cookie of cookies) {
        const [name, ...value] = cookie.trim().split('=');
        if (name === SESSION_COOKIE) {
            return value.join('=');
        }
    }
    return null;
}

function cookieOptions(maxAgeMs) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure}`;
}

async function startSession(res, username) {
    const token = crypto.randomBytes(32).toString('hex');
    await db.query(INSERT_SESSION, [hashToken(token), username, new Date(Date.now() + SESSION_MS)]);
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; ${cookieOptions(SESSION_MS)}`);
}

async function requireAuth(req, res, next) {
    const token = readSessionToken(req);
    if (!token) {
        return res.status(401).json({ error: 'Not logged in' });
    }
    try {
        const [rows] = await db.query(SELECT_SESSION_USER, [hashToken(token)]);
        if (!rows[0]) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        req.username = rows[0].username;
        next();
    } catch (error) {
        serverError(res, error);
    }
}

function serverError(res, error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
}

function hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString('hex');
}

function validCredentials(body) {
    const { username, password } = body ?? {};
    return typeof username === 'string' && typeof password === 'string' && username.trim() && password;
}

app.post('/api/signup', async (req, res) => {
    if (!validCredentials(req.body)) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    const username = req.body.username.trim();
    const salt = crypto.randomBytes(16).toString('hex');

    try {
        await db.query(INSERT_USER, [username, salt, hashPassword(req.body.password, salt)]);
        await startSession(res, username);
        res.status(201).json({ ok: true, username });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'That username is already taken' });
        }
        serverError(res, error);
    }
});

app.post('/api/login', async (req, res) => {
    if (!validCredentials(req.body)) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    const username = req.body.username.trim();

    try {
        const [rows] = await db.query(SELECT_USER_CREDENTIALS, [username]);
        const user = rows[0];

        const valid = user && crypto.timingSafeEqual(
            Buffer.from(hashPassword(req.body.password, user.salt), 'hex'),
            Buffer.from(user.hash, 'hex')
        );
        if (!valid) {
            return res.status(401).json({ error: 'Incorrect username or password' });
        }
        await startSession(res, username);
        res.json({ ok: true, username });
    } catch (error) {
        serverError(res, error);
    }
});

app.get('/api/me', requireAuth, (req, res) => {
    res.json({ ok: true, username: req.username });
});

app.get('/api/decks', requireAuth, async (req, res) => {
    try {
        const [rows] = await db.query(SELECT_USER_DECKS, [req.username]);
        res.json({ ok: true, decks: rows.map((row) => ({ key: row.deck_key, name: row.name })) });
    } catch (error) {
        serverError(res, error);
    }
});

app.post('/api/decks', requireAuth, async (req, res) => {
    const key = crypto.randomBytes(32).toString('hex');
    try {
        await db.query(INSERT_DECK, [key, req.username]);
        res.status(201).json({ ok: true, deck: { key, name: 'Untitled deck' } });
    } catch (error) {
        serverError(res, error);
    }
});

app.patch('/api/decks/:deckKey', requireAuth, async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 100) {
        return res.status(400).json({ error: 'Deck name must be 1-100 characters' });
    }
    try {
        const [result] = await db.query(UPDATE_DECK_NAME, [name, req.params.deckKey, req.username]);
        if (!result.affectedRows) {
            return res.status(404).json({ error: 'Deck not found' });
        }
        res.json({ ok: true, name });
    } catch (error) {
        serverError(res, error);
    }
});

app.get('/api/decks/:deckKey/cards', requireAuth, async (req, res) => {
    try {
        const [decks] = await db.query(SELECT_OWNED_DECK, [req.params.deckKey, req.username]);
        if (!decks[0]) {
            return res.status(404).json({ error: 'Deck not found' });
        }
        const [rows] = await db.query(SELECT_DECK_CARDS, [req.params.deckKey]);
        res.json({ ok: true, cards: rows.map((row) => row.card_id) });
    } catch (error) {
        serverError(res, error);
    }
});

app.post('/api/decks/:deckKey/cards', requireAuth, async (req, res) => {
    const { cardId } = req.body ?? {};
    if (typeof cardId !== 'string' || !cardId || cardId.length > 64) {
        return res.status(400).json({ error: 'Card id is required' });
    }
    try {
        const [decks] = await db.query(SELECT_OWNED_DECK, [req.params.deckKey, req.username]);
        if (!decks[0]) {
            return res.status(404).json({ error: 'Deck not found' });
        }
        await db.query(INSERT_DECK_CARD, [req.params.deckKey, cardId]);
        res.status(201).json({ ok: true });
    } catch (error) {
        serverError(res, error);
    }
});

app.post('/api/logout', async (req, res) => {
    const token = readSessionToken(req);
    try {
        if (token) {
            await db.query(DELETE_SESSION, [hashToken(token)]);
        }
        res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; ${cookieOptions(0)}`);
        res.json({ ok: true });
    } catch (error) {
        serverError(res, error);
    }
});

app.get('/api/user-settings', requireAuth, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT currency FROM user_settings WHERE username = ?', [req.username]);
        res.json({ ok: true, currency: rows[0]?.currency || 'USD' });
    } catch (error) {
        serverError(res, error);
    }
});

app.post('/api/user-settings', requireAuth, async (req, res) => {
    const { currency } = req.body ?? {};
    if (currency !== 'USD' && currency !== 'EUR') {
        return res.status(400).json({ error: 'Unsupported currency' });
    }

    try {
        await db.query('INSERT INTO user_settings (username, currency) VALUES (?, ?) ON DUPLICATE KEY UPDATE currency = ?', [req.username, currency, currency]);
        res.json({ ok: true, currency });
    } catch (error) {
        serverError(res, error);
    }
});

// Client-side routes: serve the app for each page so refreshing or opening a link works
app.get(['/login', '/signup', '/search', '/decks', '/decks/:deckKey', '/settings'], (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

initDatabase()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`CardKeeper running at http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.error('Could not connect to the database:', error.message);
        process.exit(1);
    });
