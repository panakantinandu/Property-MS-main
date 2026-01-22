// admin-app/app.js
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const exphbs = require('express-handlebars');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');
const morgan = require('morgan');
const crypto = require('crypto');
const csurf = require('csurf');
const multer = require('multer');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Shared imports
const { connect } = require('../shared/config/db');
const models = require('../shared/models');
const utils = require('../shared/utils');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.TENANT_URL || 'http://localhost:3000',
        credentials: true
    }
});

// ======================
// MIDDLEWARE
// ======================
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}
app.disable('x-powered-by');
app.use(bodyParser.urlencoded({ extended: true, limit: '10kb' }));
app.use(bodyParser.json({ limit: '10kb' }));

// Basic query parameter pollution defense (normalize arrays to first value)
app.use((req, res, next) => {
    for (const [key, value] of Object.entries(req.query || {})) {
        if (Array.isArray(value)) req.query[key] = value[0];
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Multer configuration for property image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public', 'uploads', 'properties'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'property-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (jpeg, jpg, png, gif, webp) are allowed'));
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: fileFilter
});

// Export upload middleware for routes
app.locals.upload = upload;

// CSP nonce for inline scripts
app.use((req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
});

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'self'"],
            scriptSrc: [
                "'self'",
                (req, res) => `'nonce-${res.locals.cspNonce}'`,
                "https://code.jquery.com",
                "https://stackpath.bootstrapcdn.com",
                "https://cdn.jsdelivr.net"
            ],
            scriptSrcElem: [
                "'self'",
                (req, res) => `'nonce-${res.locals.cspNonce}'`,
                "https://code.jquery.com",
                "https://stackpath.bootstrapcdn.com",
                "https://cdn.jsdelivr.net"
            ],
            styleSrc: ["'self'", "'unsafe-inline'", "https://stackpath.bootstrapcdn.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
            styleSrcElem: ["'self'", "'unsafe-inline'", "https://stackpath.bootstrapcdn.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https://stackpath.bootstrapcdn.com", "https://cdnjs.cloudflare.com"],
            connectSrc: ["'self'", "https://stackpath.bootstrapcdn.com", "https://cdn.jsdelivr.net", "https://code.jquery.com"]
        }
    }
}));
app.use(mongoSanitize());

// Rate limiter
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/admin/login', authLimiter);

// Session
const session_config = {
    secret: process.env.SESSION_SECRET || 'admin-app-secret',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 2 * 60 * 60 * 1000
    }
};

if (process.env.REDIS_URL) {
    const redis = require('redis');
    const connectRedis = require('connect-redis');
    const RedisStore = connectRedis(session);
    const redisClient = redis.createClient({ url: process.env.REDIS_URL });
    redisClient.connect();
    session_config.store = new RedisStore({ client: redisClient });
}

app.use(session(session_config));

// CSRF protection (uses session storage)
app.use(csurf());

// Morgan logging
const morganFormat = ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"';
app.use(morgan(morganFormat, {
    stream: {
        write: (message) => utils.logger.info(message.trim())
    }
}));

// Expose session and common config to views
app.use((req, res, next) => {
    res.locals.session = req.session || {};
    res.locals.appName = 'Admin Console';
    // Currency configuration shared with tenant app
    res.locals.currencySymbol = utils.currency.symbol;
    res.locals.currencyCode = utils.currency.code;
    if (typeof req.csrfToken === 'function') {
        res.locals.csrfToken = req.csrfToken();
    }
    next();
});

// ======================
// VIEW ENGINE
// ======================
app.engine('hbs', exphbs.engine({
    extname: '.hbs',
    defaultLayout: false,
    layoutsDir: path.join(__dirname, 'views'),
    partialsDir: path.join(__dirname, 'views'),
    helpers: {
        formatDate: (date) => date ? new Date(date).toLocaleDateString() : '—',
        eq: (a, b) => a === b,
        or: function() {
            // Returns true if any argument is truthy
            return Array.prototype.slice.call(arguments, 0, -1).some(Boolean);
        },
        currencySymbol: () => utils.currency.symbol,
        formatCurrency: (amount) => `${utils.currency.symbol}${Number(amount || 0)}`
    }
}));

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// ======================
// DATABASE CONNECTION
// ======================
connect().then(() => {
    console.log('✓ Admin App: MongoDB Connected');
}).catch(err => {
    console.error('✗ Admin App: MongoDB Error', err);
});

// ======================
// ROUTES (Admin App)
// ======================
// Root route - redirect to admin login
app.get('/', (req, res) => {
    res.render('admin-login', { layout: false });
});

// Import and mount routes
const adminRoutes = require('./src/modules/admin');

app.use('/admin', adminRoutes);

// ======================
// SOCKET.IO (Real-time for admins)
// ======================
io.on('connection', (socket) => {
    const adminId = socket.handshake.query.adminId;
    
    if (adminId) {
        socket.join('admins');
        console.log(`✓ Admin connected via Socket.IO`);
    }
    
    socket.on('disconnect', () => {
        console.log(`✗ Admin disconnected`);
    });
});

// Expose io to services
const emitter = require('../shared/realtime/emitter');
emitter.set(io);

// ======================
// ERROR HANDLING
// ======================
app.use((err, req, res, next) => {
    if (err && err.code === 'EBADCSRFTOKEN') {
        if (req.accepts('html')) {
            req.session.error = 'Your session expired. Please try again.';
            return res.redirect(req.get('Referrer') || '/admin/login');
        }
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    next(err);
});

app.use((err, req, res, next) => {
    utils.logger.error('Unhandled Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error'
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).send('Page not found');
});

// ======================
// START SERVER
// ======================
// Prefer Render/hosting provider PORT, fall back to configured ADMIN_PORT or default.
const PORT = process.env.PORT || process.env.ADMIN_PORT || 4000;
server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   ADMIN CONSOLE - LeaseHub             ║
║   Running on: http://localhost:${PORT} ║
║   Environment: ${process.env.NODE_ENV || 'development'}         ║
╚════════════════════════════════════════╝
    `);
    utils.logger.info(`Admin app started on port ${PORT}`);
});

module.exports = { app, io };
