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
        res.json({ ok: true, username });
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
