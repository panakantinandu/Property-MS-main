// tenant-app/app.js
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
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Shared imports
const { connect } = require('../shared/config/db');
const models = require('../shared/models');
const utils = require('../shared/utils');
const { sendBookingDepositExpired } = require('../utils/notify');
const { createAuditLog } = require('../shared/services/auditService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.ADMIN_URL || 'http://localhost:4000',
        credentials: true
    }
});

// ======================
// AUTO-EXPIRY JOBS
// ======================
// Every 30 minutes, expire approved applications whose booking deposit
// window has passed and no booking_deposit payment exists.
if (process.env.DISABLE_WORKERS !== '1') {
    const THIRTY_MINUTES = 30 * 60 * 1000;
    setInterval(async () => {
        try {
            const { Application, Invoice, Payment, Property, Tenant } = models;
            const now = new Date();

            const expiringApps = await Application.find({
                status: 'approved',
                isDeleted: false,
                expiresAt: { $lt: now }
            }).lean();

            if (!expiringApps.length) {
                return;
            }

            for (const appDoc of expiringApps) {
                try {
                    // Find booking deposit invoice for this application
                    const depositInvoice = await Invoice.findOne({
                        tenantId: appDoc.tenantId,
                        propertyId: appDoc.propertyId,
                        type: 'booking_deposit',
                        isDeleted: false
                    }).lean();

                    if (depositInvoice) {
                        const payment = await Payment.findOne({
                            invoiceId: depositInvoice._id,
                            status: 'approved',
                            isDeleted: false
                        }).lean();

                        // Skip if payment exists
                        if (payment) {
                            continue;
                        }
                    }

                    // Mark application as expired
                    await Application.updateOne({ _id: appDoc._id }, { status: 'expired' });

                    // Reset property status to available
                    if (appDoc.propertyId) {
                        await Property.updateOne(
                            { _id: appDoc.propertyId },
                            { status: 'available', tenantId: null }
                        );
                    }

                    // Send email notification to tenant
                    if (appDoc.tenantId) {
                        const tenant = await Tenant.findById(appDoc.tenantId).lean();
                        const property = await Property.findById(appDoc.propertyId).lean();
                        if (tenant && property) {
                            await sendBookingDepositExpired({ tenant, property, application: appDoc });
                        }
                    }
                } catch (jobErr) {
                    console.error('Error processing booking deposit expiry for application', appDoc._id, jobErr);
                }
            }

            console.log(`⌛ Booking deposit expiry job executed. Processed ${expiringApps.length} application(s).`);
        } catch (err) {
            console.error('Booking deposit expiry job failed:', err);
        }
    }, THIRTY_MINUTES);
}

// ======================
// MIDDLEWARE
// ======================
// Stripe webhook needs raw body, must come before other body parsers
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    const sig = req.headers['stripe-signature'];
    let event;
    
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error('⚠️  Webhook signature verification failed:', err.message);
        return res.sendStatus(400);
    }
    
    // Handle checkout.session.completed
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        
        try {
            const { Invoice, Payment, LedgerEntry, Tenant, Application, Property } = models;
            
            const invoiceId = session.metadata.invoiceId;
            const tenantId = session.metadata.tenantId;
            const purpose = session.metadata.purpose;
            
            // Fetch invoice
            const invoice = await Invoice.findById(invoiceId).populate('propertyId');
            if (!invoice) {
                console.error('❌ Invoice not found:', invoiceId);
                return res.sendStatus(400);
            }
            
            // Check if already paid (idempotency) - based on invoice & amount
            const existingPayment = await Payment.findOne({ 
                invoiceId,
                tenantId,
                amountPaid: session.amount_total / 100,
                status: 'approved'
            });
            
            if (existingPayment) {
                console.log('⚠️  Payment already processed for invoice:', invoiceId);
                return res.sendStatus(200);
            }
            
            // Mark invoice as paid
            invoice.status = 'paid';
            invoice.paidAmount = invoice.totalAmount;
            invoice.paidAt = new Date();
            await invoice.save();
            
            // Create payment record aligned with Payment schema
            const payment = new Payment({
                tenantId: invoice.tenantId,
                propertyId: invoice.propertyId?._id,
                invoiceId: invoiceId,
                amountPaid: session.amount_total / 100,
                paymentMethod: 'stripe',
                stripePaymentIntentId: session.payment_intent || session.id,
                status: 'approved',
                notes: purpose === 'booking_deposit' ? 'Booking deposit via Stripe' : 'Rent payment via Stripe'
            });
            await payment.save();
            
            // Create ledger entry using current LedgerEntry schema
            const description =
                invoice.type === 'booking_deposit'
                    ? `Booking deposit received for ${invoice.propertyId?.propertyname || ''}`
                    : `Rent payment received for ${invoice.month}`;

            const ledgerEntry = new LedgerEntry({
                tenantId: invoice.tenantId,
                type: 'credit',
                amount: session.amount_total / 100,
                description,
                referenceType: 'invoice',
                referenceId: invoice._id
            });
            await ledgerEntry.save();
            
            console.log(`✅ Payment processed successfully - Invoice: ${invoiceId}, Amount: $${session.amount_total / 100}, Purpose: ${purpose || invoice.type}`);

            // If this was a booking deposit, update application, tenant, property and create first monthly rent invoice
            if (invoice.type === 'booking_deposit') {
                try {
                    const application = await Application.findOne({
                        tenantId: invoice.tenantId,
                        propertyId: invoice.propertyId,
                        status: 'approved',
                        isDeleted: false
                    });

                    if (application) {
                        application.status = 'reserved';
                        await application.save();

                        // Audit: system reserved application after booking deposit (webhook)
                        try {
                            await createAuditLog({
                                req,
                                userId: invoice.tenantId,
                                userType: 'system',
                                action: 'system_reserve_application_after_deposit',
                                entity: 'Application',
                                entityId: application._id,
                                changes: {
                                    status: {
                                        before: 'approved',
                                        after: 'reserved',
                                    },
                                },
                            });
                        } catch (auditErr) {
                            console.error('Audit log error (reserve application after deposit - webhook):', auditErr.message || auditErr);
                        }
                    }

                    const propertyId = invoice.propertyId?._id || invoice.propertyId;

                    if (propertyId) {
                        const propertyBefore = await Property.findById(propertyId).lean();

                        await Property.findByIdAndUpdate(propertyId, {
                            status: 'reserved',
                            tenantId: invoice.tenantId
                        });

                        // Audit: system assigned property after deposit
                        try {
                            await createAuditLog({
                                req,
                                userId: invoice.tenantId,
                                userType: 'system',
                                action: 'system_assign_property_after_deposit',
                                entity: 'Property',
                                entityId: propertyId,
                                changes: {
                                    status: {
                                        before: propertyBefore ? propertyBefore.status : undefined,
                                        after: 'reserved',
                                    },
                                    tenantId: {
                                        before: propertyBefore ? propertyBefore.tenantId : undefined,
                                        after: invoice.tenantId,
                                    },
                                },
                            });
                        } catch (auditErr) {
                            console.error('Audit log error (assign property after deposit - webhook):', auditErr.message || auditErr);
                        }
                    }

                    // Link tenant to property and application
                    try {
                        const Tenant = models.Tenant;
                        await Tenant.findByIdAndUpdate(invoice.tenantId, {
                            propertyId,
                            ...(application ? { applicationId: application._id } : {})
                        });
                    } catch (tenantUpdateErr) {
                        console.error('Failed to update tenant with property/application after booking deposit:', tenantUpdateErr);
                    }

                    // Create first monthly rent invoice if none exists for upcoming cycle
                    try {
                        const existingMonthly = await Invoice.findOne({
                            tenantId: invoice.tenantId,
                            propertyId,
                            type: 'monthly_rent',
                            status: { $in: ['unpaid', 'partial', 'overdue'] },
                            isDeleted: false
                        }).lean();

                        if (!existingMonthly) {
                            const propertyDoc = await Property.findById(propertyId).lean();
                            if (propertyDoc && typeof propertyDoc.rent === 'number') {
                                const now = new Date();
                                const due = new Date(now);
                                const rentDay = 5;
                                if (now.getDate() > rentDay) {
                                    // Move to next month
                                    due.setMonth(due.getMonth() + 1);
                                }
                                due.setDate(rentDay);

                                const monthStr = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}`;
                                const rentAmount = Number(propertyDoc.rent) || 0;
                                const maintenanceCharges = Number(propertyDoc.maintenanceFee || 0);
                                const totalAmount = rentAmount + maintenanceCharges;

                                const rentInvoice = new Invoice({
                                    type: 'monthly_rent',
                                    tenantId: invoice.tenantId,
                                    propertyId,
                                    month: monthStr,
                                    rentAmount,
                                    maintenanceCharges,
                                    waterCharges: 0,
                                    electricityCharges: 0,
                                    otherCharges: 0,
                                    totalAmount,
                                    dueDate: due,
                                    status: 'unpaid',
                                    paidAmount: 0,
                                    balance: totalAmount,
                                    isDeleted: false
                                });
                                await rentInvoice.save();
                                console.log(`📄 Created first monthly rent invoice ${rentInvoice._id} for tenant ${invoice.tenantId}`);

                                // Audit: system created first monthly rent invoice after deposit
                                try {
                                    await createAuditLog({
                                        req,
                                        userId: invoice.tenantId,
                                        userType: 'system',
                                        action: 'system_create_monthly_rent_after_deposit',
                                        entity: 'Invoice',
                                        entityId: rentInvoice._id,
                                        changes: {
                                            type: 'monthly_rent',
                                            amount: totalAmount,
                                            month: monthStr,
                                            propertyId,
                                            tenantId: invoice.tenantId,
                                        },
                                    });
                                } catch (auditErr) {
                                    console.error('Audit log error (create monthly rent after deposit - webhook):', auditErr.message || auditErr);
                                }
                            }
                        }
                    } catch (rentInvoiceErr) {
                        console.error('Failed to create first monthly rent invoice after booking deposit:', rentInvoiceErr);
                    }
                } catch (e) {
                    console.error('Failed to update application/property after booking deposit:', e);
                }
            }
            
            // Notify tenant via socket.io
            io.to(`tenant:${invoice.tenantId}`).emit('paymentConfirmed', {
                invoiceId: invoiceId,
                amount: session.amount_total / 100,
                status: 'paid',
                type: invoice.type
            });
            
        } catch (err) {
            console.error('❌ Webhook processing error:', err);
            return res.sendStatus(500);
        }
    }
    
    res.sendStatus(200);
});

if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Regular body parsers for other endpoints
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
            connectSrc: ["'self'", "https://stackpath.bootstrapcdn.com", "https://cdn.jsdelivr.net"]
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
app.use('/tenant/login', authLimiter);
app.use('/properties/apply', authLimiter);

// Session
const session_config = {
    secret: process.env.SESSION_SECRET || 'tenant-app-secret',
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
    res.locals.appName = 'Tenant Portal';
    res.locals.cspNonce = res.locals.cspNonce || '';
    // Currency configuration (shared between admin and tenant apps)
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
        subtract: (a, b) => a - b,
        substring: (str, start, end) => str ? str.substring(start, end) : '',
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
    console.log('✓ Tenant App: MongoDB Connected');
}).catch(err => {
    console.error('✗ Tenant App: MongoDB Error', err);
});

// ======================
// ROUTES (Tenant App)
// ======================
// Import and mount routes
const tenantRoutes = require('./src/modules/tenant');

// Mount tenant routes (all tenant features are under /tenant)
app.use('/tenant', tenantRoutes);

// Root route - redirect to tenant login
app.get('/', (req, res) => {
    if (req.session && req.session.loggedIn && req.session.userType === 'tenant') {
        return res.redirect('/tenant/dashboard');
    }
    res.render('login', { layout: false, cspNonce: res.locals.cspNonce });
});

// ======================
// SOCKET.IO (Real-time for tenants)
// ======================
io.on('connection', (socket) => {
    const tenantId = socket.handshake.query.tenantId;
    
    if (tenantId) {
        socket.join(`tenant:${tenantId}`);
        console.log(`✓ Tenant ${tenantId} connected via Socket.IO`);
    }
    
    socket.on('disconnect', () => {
        if (tenantId) {
            console.log(`✗ Tenant ${tenantId} disconnected`);
        }
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
        // Don't leak details; treat as forbidden.
        if (req.accepts('html')) {
            req.session.error = 'Your session expired. Please try again.';
            return res.redirect(req.get('Referrer') || '/tenant/login/form');
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
// Prefer Render/hosting provider PORT, fall back to configured TENANT_PORT or default.
const PORT = process.env.PORT || process.env.TENANT_PORT || 3000;
server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   TENANT PORTAL - LeaseHub             ║
║   Running on: http://localhost:${PORT}  ║
║   Environment: ${process.env.NODE_ENV || 'development'}         ║
╚════════════════════════════════════════╝
    `);
    utils.logger.info(`Tenant app started on port ${PORT}`);
});

module.exports = { app, io };
