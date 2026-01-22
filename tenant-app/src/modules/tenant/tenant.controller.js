// Tenant Controller for Tenant App
const Tenant = require('../../../../shared/models').Tenant;
const Payment = require('../../../../shared/models').Payment;
const Ticket = require('../../../../shared/models').Ticket;
const Property = require('../../../../shared/models').Property;
const Application = require('../../../../shared/models').Application;
const Invoice = require('../../../../shared/models').Invoice;
const Notification = require('../../../../shared/models').Notification;
const { createAuditLog } = require('../../../../shared/services/auditService');
const bcrypt = require('bcryptjs');
const emailService = require('../../../../utils/emailService');

// Derive the public app URL from env or the incoming request to avoid hard-coded ports
const getAppBaseUrl = (req) => {
    if (process.env.APP_URL) return process.env.APP_URL;
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    return `${proto}://${host}`;
};

// Login
exports.login = async (req, res) => {
    const { email, password, tenantid } = req.body;

    try {
        let tenant;
        
        // Find by email or tenant ID
        if (email) {
            tenant = await Tenant.findOne({ email: email.toLowerCase(), isDeleted: false });
        } else if (tenantid) {
            tenant = await Tenant.findOne({ tenantid: tenantid, isDeleted: false });
        }

        // More specific feedback: whether the account exists or the password is wrong
        if (!tenant) {
            req.session.loginError = email
                ? 'No account found with that email address.'
                : 'No account found with that Tenant ID.';
            return res.redirect('/tenant/login/form');
        }

        if (tenant.status && tenant.status !== 'active') {
            req.session.loginError = 'Your account is not active. Please contact support.';
            return res.redirect('/tenant/login/form');
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, tenant.tenantpassword);
        if (!isMatch) {
            req.session.loginError = 'Incorrect password. Please try again.';
            return res.redirect('/tenant/login/form');
        }

        // Prevent session fixation
        req.session.regenerate((regenErr) => {
            if (regenErr) {
                console.error('Session regenerate error:', regenErr);
                req.session.loginError = 'An error occurred during login';
                return res.redirect('/tenant/login/form');
            }

            // Set session
            req.session.loggedIn = true;
            req.session.userType = 'tenant';
            req.session.tenantId = tenant._id; // Use MongoDB _id for consistency
            req.session.tenantName = tenant.firstname || 'Tenant';
            req.session.tenantEmail = tenant.email;

            return res.redirect('/tenant/dashboard');
        });
    } catch (err) {
        console.error('Login error:', err);
        req.session.loginError = 'An error occurred during login';
        res.redirect('/tenant/login/form');
    }
};

// Logout
exports.logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Logout error:', err);
        res.redirect('/');
    });
};

// Dashboard
exports.dashboard = async (req, res) => {
    try {
        if (!req.session.tenantId) {
            return res.redirect('/tenant/login/form');
        }

        const tenant = await Tenant.findById(req.session.tenantId).lean();
        if (!tenant) {
            return req.session.destroy(() => res.redirect('/tenant/login/form'));
        }

        // Check for unpaid booking deposit invoice (drives banner)
        const now = new Date();
        let bookingDepositInfo = null;

        const depositInvoice = await Invoice.findOne({
            tenantId: tenant._id,
            type: 'booking_deposit',
            status: 'unpaid',
            isDeleted: false
        }).sort({ createdAt: -1 }).populate('propertyId').lean();

        if (depositInvoice && depositInvoice.propertyId) {
            // Try to find the related application to get precise expiresAt
            const relatedApplication = await Application.findOne({
                tenantId: tenant._id,
                propertyId: depositInvoice.propertyId._id,
                status: 'approved',
                isDeleted: false
            }).sort({ createdAt: -1 }).lean();

            const expiresAt = (relatedApplication && relatedApplication.expiresAt) || depositInvoice.dueDate;

            if (expiresAt && new Date(expiresAt) > now) {
                const msRemaining = new Date(expiresAt).getTime() - now.getTime();
                const totalMinutes = Math.max(0, Math.floor(msRemaining / 60000));
                const hoursRemaining = Math.floor(totalMinutes / 60);
                const minutesRemaining = totalMinutes % 60;

                // Ensure amount shown is never zero – fallback to 20% of rent
                let bookingAmount = Number(depositInvoice.totalAmount) || 0;
                if (!bookingAmount || bookingAmount <= 0) {
                    const monthlyRent = Number(depositInvoice.propertyId.rent) || 0;
                    let computedDeposit = Number(depositInvoice.propertyId.bookingDeposit) || 0;
                    if (!computedDeposit || computedDeposit <= 0) {
                        computedDeposit = Math.round(monthlyRent * 0.2);
                    }
                    if (!computedDeposit || computedDeposit <= 0) {
                        computedDeposit = monthlyRent;
                    }
                    bookingAmount = computedDeposit;
                }

                bookingDepositInfo = {
                    amount: bookingAmount,
                    hoursRemaining,
                    minutesRemaining,
                    applicationId: relatedApplication ? relatedApplication._id.toString() : ''
                };
            }
        }

        // Get latest application context for this tenant (for dashboard messaging)
        const latestApplication = await Application.findOne({
            isDeleted: false,
            $or: [
                { applicantEmail: tenant.email },
                { applicantId: tenant._id },
                { tenantId: tenant._id }
            ]
        }).sort({ createdAt: -1 }).lean();

        const hasExpiredApplication = !!(latestApplication && latestApplication.status === 'expired');

        // Get tenant's property (only if still assigned). Prefer the
        // property record that points to this tenant, but fall back to
        // the tenant's stored propertyId to handle legacy data.
        let property = await Property.findOne({
            tenantId: req.session.tenantId,
            isDeleted: false
        }).lean();

        if (!property && tenant.propertyId) {
            property = await Property.findById(tenant.propertyId).lean();
        }

        // Get recent invoices
        const invoices = await Invoice.find({
            tenantId: req.session.tenantId,
            isDeleted: false
        }).sort({ createdAt: -1 }).limit(5).lean();

        // Current month rent summary (for dashboard banner)
        let rentSummary = null;

        // If there is an unpaid booking deposit, hide monthly rent completely
        if (!bookingDepositInfo) {
            try {
                const openRentInvoice = await Invoice.findOne({
                    tenantId: tenant._id,
                    isDeleted: false,
                    $and: [
                        { $or: [{ type: 'monthly_rent' }, { type: 'rent' }] },
                        { $or: [{ status: 'unpaid' }, { status: 'partial' }, { status: 'overdue' }] }
                    ]
                }).sort({ dueDate: 1 }).lean();

                if (openRentInvoice) {
                    const totalAmount = Number(openRentInvoice.totalAmount) || 0;
                    const paidAmount = Number(openRentInvoice.paidAmount) || 0;
                    const balance = typeof openRentInvoice.balance === 'number'
                        ? Number(openRentInvoice.balance)
                        : Math.max(0, totalAmount - paidAmount);

                    const rentDue = balance;

                    // Late fee due for same tenant/property/month
                    let lateFeeDue = 0;
                    try {
                        const lateFeeInvoices = await Invoice.find({
                            tenantId: tenant._id,
                            propertyId: openRentInvoice.propertyId,
                            month: openRentInvoice.month,
                            type: 'late_fee',
                            isDeleted: false,
                            $or: [
                                { status: 'unpaid' },
                                { status: 'partial' },
                                { status: 'overdue' }
                            ]
                        }).lean();

                        for (const lf of lateFeeInvoices) {
                            const lfTotal = Number(lf.totalAmount) || 0;
                            const lfPaid = Number(lf.paidAmount) || 0;
                            const lfBalance = lf.balance != null
                                ? Number(lf.balance)
                                : Math.max(0, lfTotal - lfPaid);
                            lateFeeDue += lfBalance;
                        }
                    } catch (lateErr) {
                        console.error('Error computing late fee due for dashboard:', lateErr.message);
                    }

                    const totalDueForCard = rentDue + lateFeeDue;

                    let dueDateFormatted = null;
                    if (openRentInvoice.dueDate) {
                        const due = new Date(openRentInvoice.dueDate);
                        if (!isNaN(due.getTime())) {
                            dueDateFormatted = due.toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric'
                            });
                        }
                    }

                    rentSummary = {
                        hasInvoice: true,
                        invoiceId: openRentInvoice._id.toString(),
                        amount: totalAmount,
                        outstanding: totalDueForCard,
                        rentDue,
                        lateFeeDue,
                        totalDue: totalDueForCard,
                        status: openRentInvoice.status,
                        dueDate: dueDateFormatted,
                        rawDueDate: openRentInvoice.dueDate,
                        lateFeePerDay: 100,
                        graceDays: 3
                    };
                }
            } catch (rentErr) {
                console.error('Error computing rent summary for dashboard:', rentErr.message);
            }
        }

        // Aggregate totals for stats (rent + late fees only, using
        // true outstanding balances rather than full invoice totals).
        // We prefer the invoice.balance field when it is a positive
        // number, but fall back to (totalAmount - paidAmount) for any
        // legacy invoices where balance was left at the default 0.
        let totalDueAmount = 0;
        try {
            const openInvoices = await Invoice.find({
                tenantId: tenant._id,
                isDeleted: false,
                $and: [
                    { $or: [
                        { type: 'monthly_rent' },
                        { type: 'rent' },
                        { type: 'late_fee' }
                    ] },
                    { $or: [
                        { status: 'unpaid' },
                        { status: 'partial' },
                        { status: 'overdue' }
                    ] }
                ]
            }).lean();

            openInvoices.forEach(inv => {
                const total = Number(inv.totalAmount) || 0;
                const paid = Number(inv.paidAmount) || 0;
                const computedBalance = Math.max(0, total - paid);
                const balance = (inv.balance != null && Number(inv.balance) > 0)
                    ? Number(inv.balance)
                    : computedBalance;

                if (balance > 0) {
                    totalDueAmount += balance;
                }
            });
        } catch (aggErr) {
            console.error('Error computing total due for dashboard stats:', aggErr.message);
        }

        const totalPaidAgg = await Payment.aggregate([
            { $match: { tenantId: tenant._id, status: 'approved', isDeleted: false } },
            { $group: { _id: null, total: { $sum: '$amountPaid' } } }
        ]);

        const payments = await Payment.find({ tenantId: req.session.tenantId })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        const tickets = await Ticket.find({ tenantId: req.session.tenantId })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        res.render('dashboard', {
            layout: false,
            tenant,
            property,
            invoices,
            payments,
            tickets,
            totalDue: totalDueAmount,
            totalPaid: (totalPaidAgg[0] && totalPaidAgg[0].total) || 0,
            tenantName: req.session.tenantName,
            hasBookingDepositDue: !!bookingDepositInfo,
            bookingDeposit: bookingDepositInfo,
            rentSummary,
            hasExpiredApplication
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).send('Error loading dashboard');
    }
};

// Payments - show current dues + history
exports.payments = async (req, res) => {
    try {
        if (!req.session.tenantId) {
            return res.redirect('/tenant/login/form');
        }

        const tenantId = req.session.tenantId;

        // Load payment history (most recent first)
        const payments = await Payment.find({ tenantId, isDeleted: false })
            .sort({ createdAt: -1 })
            .lean();

        // Detect a recently paid booking deposit (to show confirmation banner)
        let bookingDepositSuccess = false;
        try {
            const now = new Date();
            const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

            const recentBookingPayment = await Payment.findOne({
                tenantId,
                isDeleted: false,
                status: 'approved',
                notes: /Booking deposit via Stripe/i,
                createdAt: { $gte: twentyFourHoursAgo }
            })
                .sort({ createdAt: -1 })
                .lean();

            bookingDepositSuccess = !!recentBookingPayment;
        } catch (bannerErr) {
            console.error('Error checking recent booking deposit payment for payments page:', bannerErr.message);
        }

        // Compute current rent due card (reuse logic similar to dashboard)
        let rentSummary = null;
        try {
            const openRentInvoice = await Invoice.findOne({
                tenantId,
                isDeleted: false,
                $and: [
                    { $or: [{ type: 'monthly_rent' }, { type: 'rent' }] },
                    { $or: [{ status: 'unpaid' }, { status: 'partial' }, { status: 'overdue' }] }
                ]
            }).sort({ dueDate: 1 }).lean();

            if (openRentInvoice) {
                const totalAmount = Number(openRentInvoice.totalAmount) || 0;
                const paidAmount = Number(openRentInvoice.paidAmount) || 0;
                const balance = typeof openRentInvoice.balance === 'number'
                    ? Number(openRentInvoice.balance)
                    : Math.max(0, totalAmount - paidAmount);

                const rentDue = balance;

                // Late fee due for same tenant/property/month
                let lateFeeDue = 0;
                try {
                    const lateFeeInvoices = await Invoice.find({
                        tenantId,
                        propertyId: openRentInvoice.propertyId,
                        month: openRentInvoice.month,
                        type: 'late_fee',
                        isDeleted: false,
                        $or: [
                            { status: 'unpaid' },
                            { status: 'partial' },
                            { status: 'overdue' }
                        ]
                    }).lean();

                    for (const lf of lateFeeInvoices) {
                        const lfTotal = Number(lf.totalAmount) || 0;
                        const lfPaid = Number(lf.paidAmount) || 0;
                        const lfBalance = lf.balance != null
                            ? Number(lf.balance)
                            : Math.max(0, lfTotal - lfPaid);
                        lateFeeDue += lfBalance;
                    }
                } catch (lateErr) {
                    console.error('Error computing late fee due for payments page:', lateErr.message);
                }

                const totalDueForCard = rentDue + lateFeeDue;

                let dueDateFormatted = null;
                if (openRentInvoice.dueDate) {
                    const due = new Date(openRentInvoice.dueDate);
                    if (!isNaN(due.getTime())) {
                        dueDateFormatted = due.toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                        });
                    }
                }

                rentSummary = {
                    hasInvoice: true,
                    invoiceId: openRentInvoice._id.toString(),
                    amount: totalAmount,
                    outstanding: totalDueForCard,
                    rentDue,
                    lateFeeDue,
                    totalDue: totalDueForCard,
                    status: openRentInvoice.status,
                    dueDate: dueDateFormatted,
                    rawDueDate: openRentInvoice.dueDate,
                    lateFeePerDay: 100,
                    graceDays: 3
                };
            }
        } catch (rentErr) {
            console.error('Error computing rent summary for payments page:', rentErr.message);
        }

        res.render('payments', {
            layout: false,
            payments,
            tenantName: req.session.tenantName,
            bookingDepositSuccess,
            rentSummary
        });
    } catch (err) {
        console.error('Payments error:', err);
        res.status(500).send('Error loading payments');
    }
};

// Initiate Stripe Payment for Invoice
exports.initiatePayment = async (req, res) => {
    try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const invoiceId = req.params.invoiceId;
        
        const invoice = await Invoice.findById(invoiceId).populate('propertyId');
        
        if (!invoice) {
            req.session.error = 'Invoice not found';
            return res.redirect('/tenant/invoices');
        }
        
        if (invoice.status === 'paid') {
            req.session.error = 'Invoice is already paid';
            return res.redirect('/tenant/invoices');
        }
        
        // Decide purpose based on invoice type so webhook and
        // success page can distinguish booking deposits from rent.
        const purpose = invoice.type === 'booking_deposit' ? 'booking_deposit' : 'rent';

        const baseUrl = getAppBaseUrl(req);

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: invoice.type === 'booking_deposit'
                                ? `Booking Deposit - ${invoice.propertyId.propertyname}`
                                : `Rent Payment - ${invoice.propertyId.propertyname}`,
                            description: invoice.type === 'booking_deposit'
                                ? 'Booking deposit to reserve property'
                                : `Invoice for month: ${invoice.month}`
                        },
                        unit_amount: Math.round(invoice.totalAmount * 100) // Convert to paise
                    },
                    quantity: 1
                }
            ],
            mode: 'payment',
            success_url: `${baseUrl}/tenant/payments/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/tenant/payments/cancel`,
            metadata: {
                invoiceId: invoiceId.toString(),
                tenantId: req.session.tenantId.toString(),
                purpose
            }
        });
        
        console.log(`✅ Stripe session created for invoice ${invoiceId}: ${session.id}`);
        
        // Return Stripe URL as JSON for client-side redirect
        res.json({ url: session.url });
        
    } catch (err) {
        console.error('Payment initiation error:', err);
        res.status(500).json({ error: 'Failed to initiate payment. Please try again.' });
    }
};

// Pay Now - Auto-create invoice and redirect to Stripe
exports.payNow = async (req, res) => {
    try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const applicationId = req.body.applicationId;
        const tenant = await Tenant.findById(req.session.tenantId).lean();
        
        // Get the approved application
        const application = await Application.findById(applicationId)
            .populate('propertyId')
            .populate('tenantId');
        
        if (!application) {
            return res.status(400).json({ success: false, message: 'Application not found' });
        }
        
        if (application.status !== 'approved') {
            return res.status(400).json({ success: false, message: 'Application is not approved' });
        }
        
        // Check authorization - compare by email (before tenantId assignment) or by tenantId (after approval)
        const isAuthorized = (application.applicantEmail === tenant.email) || 
                           (application.tenantId && application.tenantId._id.toString() === req.session.tenantId);
        
        if (!isAuthorized) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }
        
        // Get the actual tenant ID to use (prefer tenantId if set, otherwise use session)
        const actualTenantId = application.tenantId?._id || req.session.tenantId;
        
        // Find or create unpaid monthly rent invoice for this application/property
        let invoice = await Invoice.findOne({
            tenantId: actualTenantId,
            propertyId: application.propertyId._id,
            type: { $in: ['monthly_rent', 'rent'] },
            status: 'unpaid'
        }).populate('propertyId');
        
        if (!invoice) {
            // Auto-create first monthly rent invoice
            const moveInDate = new Date(application.preferredMoveIn);
            const dueDate = new Date(moveInDate);
            dueDate.setDate(dueDate.getDate() + 5); // Due 5 days from approval
            const month = `${moveInDate.getFullYear()}-${String(moveInDate.getMonth() + 1).padStart(2, '0')}`;
            
            invoice = new Invoice({
                type: 'monthly_rent',
                tenantId: actualTenantId,
                propertyId: application.propertyId._id,
                month,
                rentAmount: application.propertyId.rent,
                maintenanceCharges: application.propertyId.maintenanceFee || 0,
                waterCharges: 0,
                electricityCharges: 0,
                otherCharges: 0,
                totalAmount: application.propertyId.rent + (application.propertyId.maintenanceFee || 0),
                dueDate,
                status: 'unpaid',
                paidAmount: 0,
                balance: application.propertyId.rent + (application.propertyId.maintenanceFee || 0),
                isDeleted: false
            });
            
            await invoice.save();
            console.log(`✅ Auto-created invoice for tenant: ${invoice._id}`);
        }
        
        const baseUrl = getAppBaseUrl(req);

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `Rent Payment - ${application.propertyId.propertyname}`,
                            description: `Invoice for month: ${invoice.month}`
                        },
                        unit_amount: Math.round(invoice.totalAmount * 100) // Convert to paise
                    },
                    quantity: 1
                }
            ],
            mode: 'payment',
            success_url: `${baseUrl}/tenant/payments/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/tenant/payments/cancel`,
            metadata: {
                invoiceId: invoice._id.toString(),
                applicationId: applicationId.toString(),
                tenantId: req.session.tenantId.toString()
            }
        });
        
        console.log(`✅ Stripe session created: ${session.id}`);
        
        res.json({ success: true, redirectUrl: session.url });
        
    } catch (err) {
        console.error('Pay now error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Pay booking deposit for approved application
exports.payDeposit = async (req, res) => {
    try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const tenantId = req.session.tenantId;

        if (!tenantId) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const tenant = await Tenant.findById(tenantId).lean();
        if (!tenant) {
            return res.status(401).json({ success: false, message: 'Tenant not found' });
        }

        const { applicationId } = req.body || {};

        // Ensure application belongs to this tenant and is still approved
        const application = await Application.findOne({
            _id: applicationId,
            $or: [
                { tenantId },
                { applicantEmail: tenant.email }
            ],
            status: 'approved',
            isDeleted: false
        }).populate('propertyId');

        if (!application) {
            return res.status(400).json({ success: false, message: 'No approved application found for booking deposit' });
        }

        if (!application.expiresAt || new Date(application.expiresAt) <= new Date()) {
            return res.status(400).json({ success: false, message: 'Booking deposit window has expired' });
        }

        // Find latest unpaid booking deposit invoice
        let invoice = await Invoice.findOne({
            tenantId,
            propertyId: application.propertyId._id,
            type: 'booking_deposit',
            status: 'unpaid',
            isDeleted: false
        }).populate('propertyId');

        if (!invoice) {
            return res.status(400).json({ success: false, message: 'No pending booking deposit invoice found' });
        }

        // Ensure invoice amount is non-zero: fall back to 20% of rent/bookingDeposit
        let bookingAmount = Number(invoice.totalAmount) || 0;
        if (!bookingAmount || bookingAmount <= 0) {
            const monthlyRent = Number(invoice.propertyId.rent) || 0;
            let computedDeposit = Number(invoice.propertyId.bookingDeposit) || 0;
            if (!computedDeposit || computedDeposit <= 0) {
                computedDeposit = Math.round(monthlyRent * 0.2);
            }
            if (!computedDeposit || computedDeposit <= 0) {
                computedDeposit = monthlyRent;
            }
            bookingAmount = computedDeposit;

            // Persist corrected amount on invoice so future views/payments see the same value
            invoice.rentAmount = bookingAmount;
            invoice.totalAmount = bookingAmount;
            await invoice.save();
        }

        const baseUrl = getAppBaseUrl(req);

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `Booking Deposit - ${invoice.propertyId.propertyname}`,
                            description: 'Booking deposit to reserve property'
                        },
                        unit_amount: Math.round(bookingAmount * 100) // Convert to paise
                    },
                    quantity: 1
                }
            ],
            mode: 'payment',
            success_url: `${baseUrl}/tenant/payments/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/tenant/payments/cancel`,
            metadata: {
                invoiceId: invoice._id.toString(),
                tenantId: tenantId.toString(),
                purpose: 'booking_deposit'
            }
        });

        console.log(`✅ Stripe session created for booking deposit invoice ${invoice._id}: ${session.id}`);

        return res.json({ success: true, url: session.url });

    } catch (err) {
        console.error('Booking deposit payment error:', err);
        return res.status(500).json({ success: false, message: 'Failed to initiate booking deposit payment. Please try again.' });
    }
};

// Get Approved Application
exports.getApprovedApplication = async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const tenant = await Tenant.findById(tenantId).lean();
        
        if (!tenant) {
            return res.status(401).json({ 
                success: false, 
                message: 'Tenant not found' 
            });
        }
        
        // Find approved application - check both tenantId (after approval) and applicantEmail
        const application = await Application.findOne({
            $or: [
                { tenantId: tenantId },
                { applicantEmail: tenant.email }
            ],
            status: 'approved',
            isDeleted: false
        });
        
        if (!application) {
            return res.status(404).json({ 
                success: false, 
                message: 'No approved application found' 
            });
        }
        
        res.json({ 
            success: true, 
            applicationId: application._id.toString() 
        });
        
    } catch (err) {
        console.error('Get approved application error:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching approved application' 
        });
    }
};

// Payment Success
exports.paymentSuccess = async (req, res) => {
    try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const sessionId = req.query.session_id;
        
        if (!sessionId) {
            return res.status(400).send('No session ID provided');
        }
        
        // Retrieve session from Stripe
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        
        if (session.payment_status === 'paid') {
            const invoiceId = session.metadata && session.metadata.invoiceId;
            const tenantId = session.metadata && session.metadata.tenantId;
            const purpose = session.metadata && session.metadata.purpose;

            if (invoiceId) {
                try {
                    // Ensure invoice and payment records are updated, even if webhook didn't run
                    const invoice = await Invoice.findById(invoiceId).populate('propertyId');

                    if (invoice) {
                        // Mark invoice as paid if not already
                        if (invoice.status !== 'paid') {
                            invoice.status = 'paid';
                            invoice.paidAmount = invoice.totalAmount;
                            invoice.paidAt = new Date();
                            await invoice.save();
                        }

                        // Create Payment record if missing
                        const existingPayment = await Payment.findOne({
                            invoiceId: invoice._id,
                            stripePaymentIntentId: session.payment_intent || session.id,
                            status: 'approved'
                        });

                        if (!existingPayment) {
                            const payment = new Payment({
                                tenantId: invoice.tenantId || tenantId,
                                propertyId: invoice.propertyId?._id,
                                invoiceId: invoice._id,
                                amountPaid: session.amount_total / 100,
                                paymentMethod: 'stripe',
                                stripePaymentIntentId: session.payment_intent || session.id,
                                status: 'approved',
                                notes: purpose === 'booking_deposit' || invoice.type === 'booking_deposit'
                                    ? 'Booking deposit via Stripe'
                                    : 'Rent payment via Stripe'
                            });
                            await payment.save();
                        }

                        // If this was a booking deposit and the webhook didn't run,
                        // mirror the webhook's behaviour: update application, tenant,
                        // property, and create first monthly rent invoice.
                        if (invoice.type === 'booking_deposit') {
                            try {
                                const propertyDoc = invoice.propertyId || null;
                                const propertyId = propertyDoc?._id || invoice.propertyId;

                                // Promote approved application to reserved
                                const application = await Application.findOne({
                                    tenantId: invoice.tenantId || tenantId,
                                    propertyId,
                                    status: 'approved',
                                    isDeleted: false
                                });

                                if (application) {
                                    application.status = 'reserved';
                                    await application.save();

                                    // Audit: system reserved application after booking deposit (success page fallback)
                                    try {
                                        await createAuditLog({
                                            req,
                                            userId: invoice.tenantId || tenantId,
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
                                        console.error('Audit log error (reserve application after deposit - success page):', auditErr.message || auditErr);
                                    }
                                }

                                // Update property status and tenant linkage
                                if (propertyId) {
                                    const propertyBefore = await Property.findById(propertyId).lean();

                                    await Property.findByIdAndUpdate(propertyId, {
                                        status: 'reserved',
                                        tenantId: invoice.tenantId || tenantId
                                    });

                                    // Audit: system assigned property after deposit (success page fallback)
                                    try {
                                        await createAuditLog({
                                            req,
                                            userId: invoice.tenantId || tenantId,
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
                                                    after: invoice.tenantId || tenantId,
                                                },
                                            },
                                        });
                                    } catch (auditErr) {
                                        console.error('Audit log error (assign property after deposit - success page):', auditErr.message || auditErr);
                                    }
                                }

                                // Link tenant to property and application
                                try {
                                    await Tenant.findByIdAndUpdate(invoice.tenantId || tenantId, {
                                        propertyId,
                                        ...(application ? { applicationId: application._id } : {})
                                    });
                                } catch (tenantUpdateErr) {
                                    console.error('Failed to update tenant with property/application after booking deposit (success page):', tenantUpdateErr);
                                }

                                // Create first monthly rent invoice if none exists for upcoming cycle
                                try {
                                    if (propertyId) {
                                        const existingMonthly = await Invoice.findOne({
                                            tenantId: invoice.tenantId || tenantId,
                                            propertyId,
                                            type: 'monthly_rent',
                                            status: { $in: ['unpaid', 'partial', 'overdue'] },
                                            isDeleted: false
                                        }).lean();

                                        if (!existingMonthly) {
                                            const fullPropertyDoc = propertyDoc || await Property.findById(propertyId).lean();
                                            if (fullPropertyDoc && typeof fullPropertyDoc.rent === 'number') {
                                                const now = new Date();
                                                const due = new Date(now);
                                                const rentDay = 5;
                                                if (now.getDate() > rentDay) {
                                                    // Move to next month
                                                    due.setMonth(due.getMonth() + 1);
                                                }
                                                due.setDate(rentDay);

                                                const monthStr = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}`;
                                                const rentAmount = Number(fullPropertyDoc.rent) || 0;
                                                const maintenanceCharges = Number(fullPropertyDoc.maintenanceFee || 0);
                                                const totalAmount = rentAmount + maintenanceCharges;

                                                const rentInvoice = new Invoice({
                                                    type: 'monthly_rent',
                                                    tenantId: invoice.tenantId || tenantId,
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
                                                console.log(`📄 [Success Page] Created first monthly rent invoice ${rentInvoice._id} for tenant ${invoice.tenantId || tenantId}`);

                                                // Audit: system created first monthly rent invoice after deposit (success page fallback)
                                                try {
                                                    await createAuditLog({
                                                        req,
                                                        userId: invoice.tenantId || tenantId,
                                                        userType: 'system',
                                                        action: 'system_create_monthly_rent_after_deposit',
                                                        entity: 'Invoice',
                                                        entityId: rentInvoice._id,
                                                        changes: {
                                                            type: 'monthly_rent',
                                                            amount: totalAmount,
                                                            month: monthStr,
                                                            propertyId,
                                                            tenantId: invoice.tenantId || tenantId,
                                                        },
                                                    });
                                                } catch (auditErr) {
                                                    console.error('Audit log error (create monthly rent after deposit - success page):', auditErr.message || auditErr);
                                                }
                                            }
                                        }
                                    }
                                } catch (rentInvoiceErr) {
                                    console.error('Failed to create first monthly rent invoice after booking deposit (success page):', rentInvoiceErr);
                                }
                            } catch (bookingErr) {
                                console.error('Failed to update application/property after booking deposit (success page):', bookingErr);
                            }
                        }
                    }
                } catch (syncErr) {
                    console.error('Payment success sync error:', syncErr);
                }
            }
            
            res.render('payment-success', {
                layout: false,
                tenantName: req.session.tenantName,
                invoiceId,
                sessionId
            });
        } else {
            res.render('payment-failed', {
                layout: false,
                tenantName: req.session.tenantName,
                message: 'Payment was not completed'
            });
        }
    } catch (err) {
        console.error('Payment success page error:', err);
        res.status(500).send('Error retrieving payment status');
    }
};

// Payment Cancel
exports.paymentCancel = async (req, res) => {
    res.render('payment-cancelled', {
        layout: false,
        tenantName: req.session.tenantName
    });
};

// Invoices
exports.invoices = async (req, res) => {
    try {
        const tenant = await Tenant.findById(req.session.tenantId);
        
        if (!tenant) {
            console.log('❌ [Invoices] Tenant not found:', req.session.tenantId);
            return res.redirect('/tenant/login/form');
        }
        
        // Find invoices by tenantId
        let invoices = await Invoice.find({ 
            tenantId: req.session.tenantId,
            isDeleted: false
        }).populate('propertyId').sort({ createdAt: -1 }).lean();

        // Compute rent vs late fee vs total outstanding
        let rentDue = 0;
        let lateFeeDue = 0;
        invoices.forEach(inv => {
            const total = Number(inv.totalAmount) || 0;
            const paid = Number(inv.paidAmount) || 0;
            const computedBalance = Math.max(0, total - paid);
            const balance = (inv.balance != null && Number(inv.balance) > 0)
                ? Number(inv.balance)
                : computedBalance;

            if (inv.status === 'paid' || balance <= 0) {
                return;
            }

            if (inv.type === 'late_fee') {
                lateFeeDue += balance;
            } else if (inv.type === 'monthly_rent' || inv.type === 'rent') {
                rentDue += balance;
            }
        });
        const totalDue = rentDue + lateFeeDue;

        // If tenant has an assigned property but no invoices (e.g. earlier approval error),
        // auto-generate the first monthly rent invoice so payments can proceed.
        if (invoices.length === 0 && tenant.propertyId) {
            try {
                const property = await Property.findById(tenant.propertyId).lean();
                if (property) {
                    const existingCount = await Invoice.countDocuments({
                        tenantId: tenant._id,
                        propertyId: property._id,
                        isDeleted: false
                    });

                    if (existingCount === 0) {
                        const now = new Date();
                        const dueDate = new Date(now);

                        // Align with primary flow: rent is due on the 5th of the
                        // current month, or next month if today is already past
                        // the 5th. This ensures first rent behaves like all
                        // subsequent monthly_rent invoices created after deposit.
                        const rentDay = 5;
                        if (now.getDate() > rentDay) {
                            dueDate.setMonth(dueDate.getMonth() + 1);
                        }
                        dueDate.setDate(rentDay);

                        const month = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`;

                        const rentAmount = Number(property.rent) || 0;
                        const maintenanceCharges = Number(property.maintenanceFee) || 0;
                        const totalAmount = rentAmount + maintenanceCharges;

                        const newInvoice = new Invoice({
                            type: 'monthly_rent',
                            tenantId: tenant._id,
                            propertyId: property._id,
                            month,
                            rentAmount,
                            maintenanceCharges,
                            waterCharges: 0,
                            electricityCharges: 0,
                            otherCharges: 0,
                            totalAmount,
                            dueDate,
                            status: 'unpaid',
                            paidAmount: 0,
                            balance: totalAmount,
                            isDeleted: false
                        });

                        await newInvoice.save();
                        console.log('📄 [Invoices] Auto-generated first invoice for tenant', tenant.email, 'Amount:', totalAmount);

                        // Notify tenant about newly generated invoice
                        try {
                            await Notification.create({
                                userType: 'tenant',
                                tenantId: tenant._id,
                                title: 'New invoice generated',
                                message: `Your first invoice for ${property.propertyname} has been generated for ₹${totalAmount}.`,
                                type: 'invoice_generated',
                                metadata: {
                                    invoiceId: newInvoice._id,
                                    propertyId: property._id
                                }
                            });
                        } catch (notifyErr) {
                            console.error('Failed to create tenant notification for auto invoice:', notifyErr.message);
                        }

                        // Re-query invoices so the new one shows up in the UI
                        invoices = await Invoice.find({ 
                            tenantId: req.session.tenantId,
                            isDeleted: false
                        }).populate('propertyId').sort({ createdAt: -1 }).lean();
                    }
                }
            } catch (genErr) {
                console.error('❌ [Invoices] Error auto-generating first invoice:', genErr.message);
            }
        }

        console.log('📄 [Invoices] Tenant:', tenant.email, '| TenantId:', req.session.tenantId);
        console.log('📄 [Invoices] Found', invoices.length, 'invoices');
        
        if (invoices.length > 0) {
            console.log('📄 [Invoices] First invoice ID:', invoices[0]._id);
            console.log('📄 [Invoices] First invoice month:', invoices[0].month);
            console.log('📄 [Invoices] First invoice amount:', invoices[0].totalAmount);
            console.log('📄 [Invoices] First invoice status:', invoices[0].status);
        }
        
        res.render('invoices', { 
            layout: false,
            invoices,
            rentDue,
            lateFeeDue,
            totalDue,
            tenantName: req.session.tenantName 
        });
    } catch (err) {
        console.error('❌ [Invoices] Error:', err.message);
        console.error('❌ [Invoices] Stack:', err.stack);
        res.status(500).send('Error loading invoices: ' + err.message);
    }
};

// Maintenance Requests
exports.maintenance = async (req, res) => {
    try {
        const tickets = await Ticket.find({ tenantId: req.session.tenantId })
            .sort({ createdAt: -1 })
            .lean();
        
        const successMessage = req.session.maintenanceSuccess;
        const errorMessage = req.session.maintenanceError;
        delete req.session.maintenanceSuccess;
        delete req.session.maintenanceError;
        
        res.render('maintenance', { 
            layout: false,
            tickets,
            tenantName: req.session.tenantName,
            success: successMessage,
            error: errorMessage
        });
    } catch (err) {
        console.error('Maintenance error:', err);
        res.status(500).send('Error loading maintenance requests');
    }
};

// Submit Maintenance Request
exports.submitMaintenanceRequest = async (req, res) => {
    try {
        const { title, description, priority } = req.body;
        
        if (!title || !description) {
            req.session.maintenanceError = 'Please fill in all required fields';
            return res.redirect('/tenant/maintenance');
        }
        
        const ticket = new Ticket({
            tenantId: req.session.tenantId,
            title,
            description,
            priority: priority || 'medium',
            status: 'open',
            isDeleted: false
        });
        
        await ticket.save();

        // Notify admin about new maintenance request
        try {
            await Notification.create({
                userType: 'admin',
                title: 'New maintenance request',
                message: `${req.session.tenantName || 'Tenant'} submitted a maintenance request: ${title}`,
                type: 'maintenance_request',
                metadata: {
                    tenantId: req.session.tenantId,
                    ticketId: ticket._id
                }
            });
        } catch (notifyErr) {
            console.error('Failed to create admin notification for maintenance:', notifyErr.message);
        }
        
        console.log(`✅ Maintenance request created: ${ticket._id} - ${title}`);
        req.session.maintenanceSuccess = 'Maintenance request submitted successfully! The admin team will review it soon.';
        res.redirect('/tenant/maintenance');
        
    } catch (err) {
        console.error('Submit maintenance error:', err);
        req.session.maintenanceError = 'Failed to submit maintenance request. Please try again.';
        res.redirect('/tenant/maintenance');
    }
};

// Tenant Notifications
exports.notifications = async (req, res) => {
    try {
        const notifications = await Notification.find({
            userType: 'tenant',
            tenantId: req.session.tenantId
        })
            .sort({ createdAt: -1 })
            .lean();

        res.render('notifications', {
            layout: false,
            notifications,
            tenantName: req.session.tenantName
        });
    } catch (err) {
        console.error('Tenant notifications error:', err);
        res.status(500).send('Error loading notifications');
    }
};

// View Available Properties
exports.properties = async (req, res) => {
    try {
        const { city, type, bedrooms, maxRent } = req.query;

        const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Build filter query
        const filter = {
            status: 'available',
            isDeleted: false
        };
        
        if (city) {
            const normalizedCity = String(city).trim().slice(0, 60);
            filter.city = new RegExp(escapeRegExp(normalizedCity), 'i');
        }
        if (type) filter.propertytype = type;
        if (bedrooms) filter.bedrooms = parseInt(bedrooms);
        if (maxRent) filter.rent = { $lte: parseInt(maxRent) };
        
        const properties = await Property.find(filter)
            .sort({ createdAt: -1 })
            .lean();
        
        // Get tenant info for email-based queries
        const tenant = await Tenant.findById(req.session.tenantId).lean();
        if (!tenant) {
            return res.redirect('/tenant/login/form');
        }
        
        // Check if tenant has an approved application (check email and tenantId)
        const hasApprovedApplication = await Application.findOne({
            applicantEmail: tenant.email,
            status: 'approved',
            isDeleted: false
        });
        
        console.log(`🔍 [Properties] Tenant: ${req.session.tenantId} | Email: ${tenant.email}`);
        console.log(`🔍 [Properties] Looking for approved apps with email: ${tenant.email}`);
        console.log(`🔍 [Properties] Found approved app: ${hasApprovedApplication ? hasApprovedApplication._id : 'NONE'}`);
        
        // Count pending applications (check email)
        const pendingCount = await Application.countDocuments({
            applicantEmail: tenant.email,
            status: 'pending',
            isDeleted: false
        });
        
        console.log(`[Properties View] Tenant ${req.session.tenantId} (${tenant.email}) - Pending: ${pendingCount}, Approved: ${!!hasApprovedApplication}`);
        
        const errorMessage = req.session.error;
        delete req.session.error;
        
        res.render('properties', {
            layout: false,
            tenantName: req.session.tenantName,
            properties,
            filters: req.query,
            hasApprovedApplication: !!hasApprovedApplication,
            approvedPropertyId: hasApprovedApplication ? hasApprovedApplication.propertyId : null,
            pendingCount,
            maxPendingAllowed: 3,
            error: errorMessage
        });
    } catch (err) {
        console.error('Properties error:', err);
        res.status(500).send('Error loading properties');
    }
};

// Show Application Form
exports.applyPropertyForm = async (req, res) => {
    try {
        const propertyId = req.params.propertyId;
        const property = await Property.findById(propertyId).lean();
        
        if (!property || property.status !== 'available') {
            return res.redirect('/tenant/properties');
        }
        
        // Get tenant info
        const tenant = await Tenant.findById(req.session.tenantId).lean();
        if (!tenant) {
            return res.redirect('/tenant/login/form');
        }
        
        // Check if already applied to this specific property (check email)
        const existingApplication = await Application.findOne({
            applicantEmail: tenant.email,
            propertyId: propertyId,
            isDeleted: false,
            $or: [
                { status: 'pending' },
                { status: 'approved' }
            ]
        });
        
        if (existingApplication) {
            req.session.error = 'You have already applied for this property';
            return res.redirect('/tenant/applications');
        }
        
        // Check if tenant already has an active lease (linked property)
        const existingLease = await Property.findOne({
            tenantId: req.session.tenantId,
            isDeleted: false
        });

        if (existingLease) {
            req.session.error = 'You already have an active lease. You cannot apply to other properties.';
            return res.redirect('/tenant/applications');
        }
        
        // Limit to 3 pending applications at a time
        const pendingApplicationsCount = await Application.countDocuments({
            $or: [
                { applicantId: req.session.tenantId },
                { applicantEmail: tenant.email }
            ],
            status: 'pending',
            isDeleted: false
        });
        
        if (pendingApplicationsCount >= 3) {
            req.session.error = 'You can only have up to 3 pending applications at a time. Please wait for a response or withdraw an existing application.';
            return res.redirect('/tenant/applications');
        }
        
        // Get today's date in YYYY-MM-DD format for min date validation
        const todayDate = new Date().toISOString().split('T')[0];
        
        res.render('apply-property', {
            layout: false,
            tenantName: req.session.tenantName,
            property,
            tenant,
            todayDate,
            error: req.session.error
        });
        delete req.session.error;
    } catch (err) {
        console.error('Apply property form error:', err);
        res.status(500).send('Error loading application form');
    }
};

// Submit Application
exports.applyProperty = async (req, res) => {
    try {
        const propertyId = req.params.propertyId;
        const property = await Property.findById(propertyId);
        
        // Validate property exists and is available
        if (!property || property.status !== 'available') {
            req.session.error = 'Property is no longer available for applications.';
            return res.redirect('/tenant/properties');
        }
        
        // Validate tenant exists
        const tenant = await Tenant.findById(req.session.tenantId);
        if (!tenant) {
            req.session.error = 'Your account information could not be found. Please log in again.';
            return res.redirect('/tenant/login/form');
        }
        
        // Check for existing pending/approved application for this property
        const existingApplication = await Application.findOne({
            applicantId: req.session.tenantId,
            propertyId: propertyId,
            isDeleted: false,
            $or: [
                { status: 'pending' },
                { status: 'approved' }
            ]
        });
        
        if (existingApplication) {
            req.session.error = 'You have already applied for this property. Check your applications page for status.';
            return res.redirect('/tenant/applications');
        }
        
        // Check if tenant already has an active lease (linked property)
        const existingLease = await Property.findOne({
            tenantId: req.session.tenantId,
            isDeleted: false
        });

        if (existingLease) {
            req.session.error = 'You already have an active lease. You cannot apply to other properties.';
            return res.redirect('/tenant/applications');
        }
        
        // Limit to 3 pending applications at a time
        const pendingApplicationsCount = await Application.countDocuments({
            applicantId: req.session.tenantId,
            status: 'pending',
            isDeleted: false
        });
        
        if (pendingApplicationsCount >= 3) {
            req.session.error = 'You can only have up to 3 pending applications at a time. Please wait for a response or withdraw an existing application.';
            return res.redirect('/tenant/applications');
        }
        
        // Validate required fields
        const { applicantName, applicantEmail, phone, monthlyIncome, occupation, leaseDuration, preferredMoveIn, occupants } = req.body;
        
        if (!applicantName || !applicantEmail || !phone || !monthlyIncome || !occupation || !leaseDuration || !preferredMoveIn || !occupants) {
            req.session.error = 'Please fill all required fields marked with *';
            return res.redirect('/tenant/properties/apply/' + propertyId);
        }
        
        // Validate move-in date is in future
        const moveInDate = new Date(preferredMoveIn);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (moveInDate < today) {
            req.session.error = 'Move-in date must be today or in the future.';
            return res.redirect('/tenant/properties/apply/' + propertyId);
        }
        
        // Validate income is sufficient (at least 3x rent)
        const minimumIncome = property.rent * 3;
        if (parseInt(monthlyIncome) < minimumIncome) {
            req.session.error = `Your monthly income should be at least ₹${minimumIncome} (3x the rent) to qualify for this property.`;
            return res.redirect('/tenant/properties/apply/' + propertyId);
        }
        
        // Create application
        const application = new Application({
            applicantId: req.session.tenantId,
            applicantName,
            applicantEmail,
            phone,
            monthlyIncome: parseInt(monthlyIncome),
            occupation,
            occupants: parseInt(occupants),
            leaseDuration: parseInt(leaseDuration),
            preferredMoveIn: moveInDate,
            propertyId: propertyId,
            status: 'pending'
        });
        
        await application.save();

        // Notify admin about new application
        try {
            await Notification.create({
                userType: 'admin',
                title: 'New rental application submitted',
                message: `${applicantName} applied for ${property.propertyname}`,
                type: 'application_submitted',
                metadata: {
                    tenantId: req.session.tenantId,
                    propertyId: propertyId,
                    applicationId: application._id
                }
            });
        } catch (notifyErr) {
            console.error('Failed to create admin notification for application:', notifyErr.message);
        }
        
        console.log(`✅ New application submitted by ${applicantName} for property ${property.propertyname}`);
        
        req.session.success = 'Application submitted successfully! You will be notified once the admin reviews your application.';
        res.redirect('/tenant/applications');
    } catch (err) {
        console.error('Apply property error:', err);
        req.session.error = 'Failed to submit application. Please try again.';
        res.redirect('/tenant/properties/apply/' + req.params.propertyId);
    }
};

// View My Applications
exports.applications = async (req, res) => {
    try {
        // Find by email since we don't store tenantId yet
        const tenant = await Tenant.findById(req.session.tenantId);
        if (!tenant) {
            return res.redirect('/tenant/login/form');
        }
        
        const applications = await Application.find({
            isDeleted: false,
            $or: [
                { applicantEmail: tenant.email },
                { applicantId: tenant._id }
            ]
        })
        .populate('propertyId')
        .populate('tenantId')
        .sort({ createdAt: -1 })
        .lean();
        
        // Count pending applications
        const pendingCount = applications.filter(app => app.status === 'pending').length;
        const hasApprovedApplication = applications.some(app => app.status === 'approved');
        
        const successMessage = req.session.success;
        delete req.session.success;
        
        const errorMessage = req.session.error;
        delete req.session.error;
        
        res.render('applications', {
            layout: false,
            tenantName: req.session.tenantName,
            applications,
            pendingCount,
            hasApprovedApplication,
            maxPendingAllowed: 3,
            success: successMessage,
            error: errorMessage
        });
    } catch (err) {
        console.error('Applications error:', err);
        res.status(500).send('Error loading applications');
    }
};

// Cancel Application (Tenant)
exports.cancelApplication = async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const applicationId = req.params.id;

        const tenant = await Tenant.findById(tenantId).lean();
        if (!tenant) {
            req.session.error = 'Tenant not found. Please log in again.';
            return res.redirect('/tenant/login/form');
        }

        const application = await Application.findOne({
            _id: applicationId,
            isDeleted: false,
            $or: [
                { applicantEmail: tenant.email },
                { applicantId: tenantId }
            ]
        }).populate('propertyId').lean();

        if (!application) {
            req.session.error = 'Application not found.';
            return res.redirect('/tenant/applications');
        }

        if (!['pending', 'approved'].includes(application.status)) {
            req.session.error = 'Only pending or approved applications can be cancelled.';
            return res.redirect('/tenant/applications');
        }

        // Additional safety: block cancellation if a booking deposit payment exists
        if (application.tenantId && application.propertyId) {
            const depositPaid = await Payment.exists({
                tenantId: application.tenantId,
                propertyId: application.propertyId._id || application.propertyId,
                status: 'approved',
                isDeleted: false,
                notes: /Booking deposit/i
            });

            if (depositPaid) {
                req.session.error = 'Once the booking deposit has been paid, the application cannot be canceled by the tenant.If the monthly rent is not paid by the due date, the application will be automatically canceled, and the booking deposit will be non-refundable. Please contact the admin for further assistance.';
                return res.redirect('/tenant/applications');
            }
        }

        const beforeStatus = application.status;

        await Application.updateOne(
            { _id: application._id },
            { status: 'cancelled', adminComments: 'Cancelled by tenant' }
        );

        if (application.propertyId) {
            await Property.updateOne(
                { _id: application.propertyId._id || application.propertyId },
                { status: 'available', tenantId: null }
            );
        }

        await createAuditLog({
            req,
            userId: tenantId,
            userType: 'tenant',
            action: 'cancel_application',
            entity: 'Application',
            entityId: application._id,
            changes: {
                status: { before: beforeStatus, after: 'cancelled' }
            }
        });

        req.session.success = 'Application cancelled successfully.';
        res.redirect('/tenant/applications');
    } catch (err) {
        console.error('Cancel application error:', err);
        req.session.error = 'Failed to cancel application. Please try again.';
        res.redirect('/tenant/applications');
    }
};

// Registration Form
// Registration Form
exports.registerForm = (req, res) => {
    const error = req.session.registerError;
    delete req.session.registerError;
    res.render('register', { 
        layout: false, 
        error,
        cspNonce: res.locals.cspNonce
    });
};

// Register New Tenant
exports.register = async (req, res) => {
    try {
        const {
            firstname, lastname, email, phone, dob, gender,
            occupation, companyName, currentAddress,
            tenantid, password, confirmPassword
        } = req.body;

        // Validate password match
        if (password !== confirmPassword) {
            req.session.registerError = 'Passwords do not match';
            return res.redirect('/tenant/register/form');
        }

        // Check if tenantid already exists
        const existingTenantId = await Tenant.findOne({ tenantid });
        if (existingTenantId) {
            req.session.registerError = 'Tenant ID already exists';
            return res.redirect('/tenant/register/form');
        }

        // Check if email already exists
        const existingEmail = await Tenant.findOne({ email: email.toLowerCase() });
        if (existingEmail) {
            req.session.registerError = 'Email already registered';
            return res.redirect('/tenant/register/form');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new tenant
        const newTenant = new Tenant({
            firstname,
            lastname,
            email: email.toLowerCase(),
            phone,
            dob: dob ? new Date(dob) : undefined,
            gender,
            occupation,
            companyName,
            currentAddress,
            tenantid,
            tenantpassword: hashedPassword,
            status: 'active',
            isActive: true,
            isDeleted: false
        });

        await newTenant.save();

        // Set success message
        req.session.registerSuccess = 'Registration successful! Please login.';
        res.redirect('/tenant/login/form');
    } catch (err) {
        console.error('Registration error:', err);
        req.session.registerError = 'An error occurred during registration';
        res.redirect('/tenant/register/form');
    }
};

// Profile Page
exports.profile = async (req, res) => {
    try {
        const tenant = await Tenant.findById(req.session.tenantId)
            .populate('propertyId')
            .lean();
        
        if (!tenant) {
            return req.session.destroy(() => res.redirect('/tenant/login/form'));
        }

        const success = req.session.profileSuccess;
        const error = req.session.profileError;
        delete req.session.profileSuccess;
        delete req.session.profileError;

        res.render('profile', {
            layout: false,
            tenantName: req.session.tenantName,
            tenant,
            success,
            error
        });
    } catch (err) {
        console.error('Profile error:', err);
        res.status(500).send('Error loading profile');
    }
};

// Send OTP for password change
exports.sendPasswordChangeOTP = async (req, res) => {
    console.log('[OTP] === START OTP REQUEST ===');
    try {
        const tenant = await Tenant.findById(req.session.tenantId);
        if (!tenant) {
            console.log('[OTP] ERROR: Tenant not found');
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const { currentPassword } = req.body;
        console.log('[OTP] Request from tenant:', tenant.email);

        if (!currentPassword) {
            console.log('[OTP] ERROR: No current password provided');
            return res.status(400).json({ success: false, message: 'Current password is required' });
        }

        // Verify current password before sending OTP
        const isMatch = await bcrypt.compare(currentPassword, tenant.tenantpassword);
        if (!isMatch) {
            console.log('[OTP] ERROR: Current password incorrect');
            return res.status(401).json({ success: false, message: 'Current password is incorrect' });
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

        // Store OTP temporarily
        tenant.passwordChangeOTP = otp;
        tenant.passwordChangeOTPExpiry = otpExpiry;
        await tenant.save();
        console.log('[OTP] OTP generated and saved:', otp);

        console.log(`[OTP] Sending OTP to ${tenant.email} at ${new Date().toISOString()}`);

        // Send OTP via email (using Resend with fallback to SMTP)
        try {
            console.log('[OTP] Calling email service...');
            
            if (emailService.isResendAvailable()) {
                // Try Resend first (HTTPS port 443 - no SMTP blocking)
                await emailService.sendPasswordChangeOtpEmail(tenant.email, otp, tenant.firstname);
                console.log(`[OTP] ✅ [RESEND] Password change OTP sent to ${tenant.email}`);
            } else {
                // Fallback to SMTP (Gmail)
                const notifyService = require('../../../../utils/notify');
                await notifyService.sendMail({
                    to: tenant.email,
                    subject: 'Password Change OTP - LeaseHub',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
                                <h1 style="color: white; margin: 0; text-align: center;">🔐 Password Change OTP</h1>
                            </div>
                            <div style="background: #f5f5f5; padding: 30px; border-radius: 0 0 10px 10px;">
                                <p>Hi <strong>${tenant.firstname}</strong>,</p>
                                <p>Your OTP is: <strong style="font-size: 24px; color: #667eea;">${otp}</strong></p>
                                <p style="color: #999; font-size: 12px;">Valid for 10 minutes</p>
                                <p style="color: #856404;">⚠️ If you did not request this, ignore this email.</p>
                            </div>
                        </div>
                    `,
                    text: `Your password change OTP is: ${otp}. Valid for 10 minutes.`
                });
                console.log(`[OTP] ✅ [SMTP] Password change OTP sent to ${tenant.email}`);
            }
            
            return res.json({ 
                success: true, 
                message: 'OTP sent to your email. Check your inbox.' 
            });
        } catch (emailErr) {
            console.error('[OTP] ❌ Failed to send email:', emailErr);
            console.error('[OTP] Error stack:', emailErr.stack);
            
            // Clear OTP if email fails
            tenant.passwordChangeOTP = undefined;
            tenant.passwordChangeOTPExpiry = undefined;
            await tenant.save();
            
            return res.status(500).json({ 
                success: false, 
                message: `Failed to send OTP: ${emailErr.message || 'Email service error'}` 
            });
        }
    } catch (err) {
        console.error('[OTP] ❌ Unexpected error:', err);
        console.error('[OTP] Error stack:', err.stack);
        res.status(500).json({ success: false, message: `Server error: ${err.message}` });
    }
};

// Update Profile
exports.updateProfile = async (req, res) => {
    try {
        const {
            firstname, lastname, email, phone, dob, gender,
            occupation, companyName, currentAddress,
            emergencyContactName, emergencyContactPhone, emergencyContactRelation,
            currentPassword, newPassword, confirmNewPassword, passwordOTP
        } = req.body;

        const tenant = await Tenant.findById(req.session.tenantId);
        if (!tenant) {
            return req.session.destroy(() => res.redirect('/tenant/login/form'));
        }

        const before = {
            firstname: tenant.firstname,
            lastname: tenant.lastname,
            email: tenant.email,
            phone: tenant.phone
        };

        // Check if email is being changed and already exists
        if (email.toLowerCase() !== tenant.email) {
            const existingEmail = await Tenant.findOne({ 
                email: email.toLowerCase(),
                _id: { $ne: tenant._id }
            });
            if (existingEmail) {
                req.session.profileError = 'Email already in use';
                return res.redirect('/tenant/profile');
            }
        }

        // Update basic fields
        tenant.firstname = firstname;
        tenant.lastname = lastname;
        tenant.email = email.toLowerCase();
        tenant.phone = phone;
        tenant.dob = dob ? new Date(dob) : tenant.dob;
        tenant.gender = gender;
        tenant.occupation = occupation;
        tenant.companyName = companyName;
        tenant.currentAddress = currentAddress;

        // Update emergency contact if provided
        if (emergencyContactName || emergencyContactPhone || emergencyContactRelation) {
            tenant.emergencyContact = {
                name: emergencyContactName,
                phone: emergencyContactPhone,
                relation: emergencyContactRelation
            };
        }

        // Handle password change if requested
        if (newPassword || confirmNewPassword || currentPassword) {
            // Password validation regex: 8+ chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
            const passwordRule = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

            // If any password field is filled, all validation checks must pass
            if (newPassword && !confirmNewPassword) {
                req.session.profileError = 'Please confirm your new password';
                return res.redirect('/tenant/profile');
            }

            if (confirmNewPassword && !newPassword) {
                req.session.profileError = 'Please enter your new password';
                return res.redirect('/tenant/profile');
            }

            if (newPassword && !currentPassword) {
                req.session.profileError = 'Please enter your current password to change it';
                return res.redirect('/tenant/profile');
            }

            // Verify current password before allowing change
            if (currentPassword && newPassword) {
                const isMatch = await bcrypt.compare(currentPassword, tenant.tenantpassword);
                if (!isMatch) {
                    req.session.profileError = 'Current password is incorrect';
                    return res.redirect('/tenant/profile');
                }

                // Validate new password format
                if (!passwordRule.test(newPassword)) {
                    req.session.profileError = 'New password must be 8+ characters with 1 uppercase letter, 1 number, and 1 special character';
                    return res.redirect('/tenant/profile');
                }

                // Validate new password match
                if (newPassword !== confirmNewPassword) {
                    req.session.profileError = 'New passwords do not match';
                    return res.redirect('/tenant/profile');
                }

                // Check that new password is different from current password
                if (newPassword === currentPassword) {
                    req.session.profileError = 'New password must be different from your current password. Please choose a different password.';
                    return res.redirect('/tenant/profile');
                }

                // Check if OTP verification is needed (if password OTP exists)
                if (tenant.passwordChangeOTP && tenant.passwordChangeOTPExpiry) {
                    if (!passwordOTP) {
                        req.session.profileError = 'OTP verification required for password change. Please check your email for the OTP.';
                        return res.redirect('/tenant/profile');
                    }

                    // Verify OTP is not expired
                    if (new Date() > tenant.passwordChangeOTPExpiry) {
                        tenant.passwordChangeOTP = undefined;
                        tenant.passwordChangeOTPExpiry = undefined;
                        await tenant.save();
                        req.session.profileError = 'OTP has expired. Please request a new one.';
                        return res.redirect('/tenant/profile');
                    }

                    // Verify OTP matches
                    if (tenant.passwordChangeOTP !== passwordOTP) {
                        req.session.profileError = 'Invalid OTP. Please try again.';
                        return res.redirect('/tenant/profile');
                    }

                    // OTP verified, clear it
                    tenant.passwordChangeOTP = undefined;
                    tenant.passwordChangeOTPExpiry = undefined;
                }

                // Hash and update password
                tenant.tenantpassword = await bcrypt.hash(newPassword, 10);
            }
        }

        await tenant.save();

        // Update session
        req.session.tenantName = tenant.firstname;
        req.session.tenantEmail = tenant.email;

        // Audit log for profile update
        try {
            await createAuditLog({
                req,
                userId: tenant._id,
                userType: 'tenant',
                action: 'update_profile',
                entity: 'Tenant',
                entityId: tenant._id,
                changes: {
                    before,
                    after: {
                        firstname: tenant.firstname,
                        lastname: tenant.lastname,
                        email: tenant.email,
                        phone: tenant.phone
                    }
                }
            });
        } catch (auditErr) {
            console.error('Audit log error for tenant profile update:', auditErr.message || auditErr);
        }

        req.session.profileSuccess = 'Profile updated successfully!';
        res.redirect('/tenant/profile');
    } catch (err) {
        console.error('Update profile error:', err);
        req.session.profileError = 'An error occurred while updating profile';
        res.redirect('/tenant/profile');
    }
};

// Check email availability
exports.checkEmail = async (req, res) => {
    try {
        const { email } = req.body;
        const existing = await Tenant.findOne({ email: email.toLowerCase() });
        res.json({ available: !existing });
    } catch (err) {
        res.status(500).json({ available: false });
    }
};

// Check tenant ID availability
exports.checkTenantId = async (req, res) => {
    try {
        const { tenantid } = req.body;
        const existing = await Tenant.findOne({ tenantid });
        res.json({ available: !existing });
    } catch (err) {
        res.status(500).json({ available: false });
    }
};

// Forgot Password - Show Form
exports.forgotPasswordForm = (req, res) => {
    const success = req.session.forgotPasswordSuccess;
    const error = req.session.forgotPasswordError;
    delete req.session.forgotPasswordSuccess;
    delete req.session.forgotPasswordError;
    res.render('forgot-password', { 
        layout: false, 
        success, 
        error,
        cspNonce: res.locals.cspNonce
    });
};

// Forgot Password - Send OTP
exports.sendResetOTP = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            req.session.forgotPasswordError = 'Email is required';
            return res.redirect('/tenant/forgot-password');
        }

        const tenant = await Tenant.findOne({ 
            email: email.toLowerCase(),
            isDeleted: false
        });

        // If email not found, show error message
        if (!tenant) {
            req.session.forgotPasswordError = 'Email not registered. Please check your email address or sign up for a new account.';
            return res.redirect('/tenant/forgot-password');
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

        tenant.resetOTP = otp;
        tenant.resetOTPExpiry = otpExpiry;
        await tenant.save();

        // Send OTP via email (using Resend with fallback to SMTP)
        try {
            if (emailService.isResendAvailable()) {
                // Try Resend first (HTTPS port 443 - no SMTP blocking)
                await emailService.sendResetOtpEmail(tenant.email, otp, tenant.firstname);
                console.log(`✅ [RESEND] Password reset OTP sent to ${tenant.email}`);
            } else {
                // Fallback to SMTP (Gmail)
                const notifyService = require('../../../../utils/notify');
                await notifyService.sendMail({
                    to: tenant.email,
                    subject: 'Password Reset OTP - LeaseHub',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
                                <h1 style="color: white; margin: 0; text-align: center;">🔐 Password Reset OTP</h1>
                            </div>
                            
                            <div style="background: #f5f5f5; padding: 30px; border-radius: 0 0 10px 10px;">
                                <p>Hi <strong>${tenant.firstname}</strong>,</p>
                                
                                <p>You requested to reset your password for your LeaseHub Tenant Portal account.</p>
                                
                                <div style="background: white; padding: 20px; border-radius: 8px; text-align: center; margin: 25px 0;">
                                    <p style="color: #666; margin: 0 0 10px 0; font-size: 14px;">Your OTP is:</p>
                                    <h2 style="color: #667eea; font-size: 36px; letter-spacing: 8px; margin: 10px 0;">${otp}</h2>
                                    <p style="color: #999; margin: 10px 0 0 0; font-size: 12px;">Valid for 10 minutes</p>
                                </div>
                                
                                <p style="color: #666;">Enter this OTP on the password reset page to create a new password.</p>
                                
                                <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
                                    <p style="margin: 0; color: #856404;"><strong>⚠️ Security Notice:</strong> If you did not request a password reset, please ignore this email and ensure your account is secure.</p>
                                </div>
                                
                                <p style="color: #999; font-size: 12px; margin-top: 30px;">
                                    This is an automated email from LeaseHub Tenant Portal. Please do not reply to this email.
                                </p>
                            </div>
                        </div>
                    `,
                    text: `Your password reset OTP is: ${otp}. This OTP is valid for 10 minutes. If you did not request this, please ignore this email.`
                });
                console.log(`✅ [SMTP] Password reset OTP sent to ${tenant.email}`);
            }
        } catch (emailError) {
            console.error('Failed to send password reset OTP:', emailError);
            // Still redirect with success to prevent email enumeration
        }

        req.session.forgotPasswordSuccess = 'OTP sent successfully! Please check your email inbox for the password reset OTP.';
        res.redirect('/tenant/forgot-password');
    } catch (err) {
        console.error('Forgot password error:', err);
        req.session.forgotPasswordError = 'An error occurred. Please try again later.';
        res.redirect('/tenant/forgot-password');
    }
};

// Reset Password - Show Form
exports.resetPasswordForm = (req, res) => {
    const error = req.session.resetPasswordError;
    delete req.session.resetPasswordError;
    res.render('reset-password', { 
        layout: false, 
        error,
        cspNonce: res.locals.cspNonce
    });
};

// Reset Password - Verify OTP and Update Password
exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword, confirmPassword } = req.body;

        if (!email || !otp || !newPassword || !confirmPassword) {
            req.session.resetPasswordError = 'All fields are required';
            return res.redirect('/tenant/reset-password');
        }

        if (newPassword !== confirmPassword) {
            req.session.resetPasswordError = 'Passwords do not match';
            return res.redirect('/tenant/reset-password');
        }

        if (newPassword.length < 6) {
            req.session.resetPasswordError = 'Password must be at least 6 characters long';
            return res.redirect('/tenant/reset-password');
        }

        const tenant = await Tenant.findOne({ 
            email: email.toLowerCase(),
            isDeleted: false
        });

        if (!tenant || !tenant.resetOTP || !tenant.resetOTPExpiry) {
            req.session.resetPasswordError = 'Invalid or expired OTP';
            return res.redirect('/tenant/reset-password');
        }

        // Check if OTP is expired
        if (new Date() > tenant.resetOTPExpiry) {
            tenant.resetOTP = undefined;
            tenant.resetOTPExpiry = undefined;
            await tenant.save();
            req.session.resetPasswordError = 'OTP has expired. Please request a new one.';
            return res.redirect('/tenant/reset-password');
        }

        // Verify OTP
        if (tenant.resetOTP !== otp) {
            req.session.resetPasswordError = 'Invalid OTP';
            return res.redirect('/tenant/reset-password');
        }

        // Hash new password and update
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        tenant.tenantpassword = hashedPassword;
        tenant.resetOTP = undefined;
        tenant.resetOTPExpiry = undefined;
        await tenant.save();

        console.log(`✅ Password reset successful for ${tenant.email}`);

        req.session.registerSuccess = 'Password reset successful! Please login with your new password.';
        res.redirect('/tenant/login/form');
    } catch (err) {
        console.error('Reset password error:', err);
        req.session.resetPasswordError = 'An error occurred. Please try again.';
        res.redirect('/tenant/reset-password');
    }
};
