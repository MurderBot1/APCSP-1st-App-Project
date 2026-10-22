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

async function initDatabase() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS users (
            username VARCHAR(64) PRIMARY KEY,
            salt CHAR(32) NOT NULL,
            hash CHAR(128) NOT NULL
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash CHAR(64) PRIMARY KEY,
            username VARCHAR(64) NOT NULL,
            expires_at DATETIME NOT NULL,
            FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
        )
    `);
    await db.query('DELETE FROM sessions WHERE expires_at < NOW()');
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
    await db.query(
        'INSERT INTO sessions (token_hash, username, expires_at) VALUES (?, ?, ?)',
        [hashToken(token), username, new Date(Date.now() + SESSION_MS)]
    );
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; ${cookieOptions(SESSION_MS)}`);
}

// Sets req.username for logged-in requests; use as middleware on protected routes.
async function requireAuth(req, res, next) {
    const token = readSessionToken(req);
    if (!token) {
        return res.status(401).json({ error: 'Not logged in' });
    }
    try {
        const [rows] = await db.query(
            'SELECT username FROM sessions WHERE token_hash = ? AND expires_at > NOW()',
            [hashToken(token)]
        );
        if (!rows[0]) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        req.username = rows[0].username;
        next();
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
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
        await db.query(
            'INSERT INTO users (username, salt, hash) VALUES (?, ?, ?)',
            [username, salt, hashPassword(req.body.password, salt)]
        );
        await startSession(res, username);
        res.status(201).json({ ok: true, username });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'That username is already taken' });
        }
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/login', async (req, res) => {
    if (!validCredentials(req.body)) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    const username = req.body.username.trim();

    try {
        const [rows] = await db.query('SELECT salt, hash FROM users WHERE username = ?', [username]);
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
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/me', requireAuth, (req, res) => {
    res.json({ ok: true, username: req.username });
});

app.post('/api/logout', async (req, res) => {
    const token = readSessionToken(req);
    try {
        if (token) {
            await db.query('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
        }
        res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; ${cookieOptions(0)}`);
        res.json({ ok: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
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
