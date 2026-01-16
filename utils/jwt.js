const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change_jwt_secret';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'change_refresh_secret';

function signAccessToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
}

function signRefreshToken(payload) {
    return jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });
}

function verifyAccessToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

function verifyRefreshToken(token) {
    return jwt.verify(token, REFRESH_SECRET);
}

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken };
