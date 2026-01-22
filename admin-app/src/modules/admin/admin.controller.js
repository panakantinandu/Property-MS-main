// Admin Controller for Admin App
const Admin = require('../../../../shared/models').Admin;
const Tenant = require('../../../../shared/models').Tenant;
const Property = require('../../../../shared/models').Property;
const Payment = require('../../../../shared/models').Payment;
const Invoice = require('../../../../shared/models').Invoice;
const Application = require('../../../../shared/models').Application;
const Ticket = require('../../../../shared/models').Ticket;
const Notification = require('../../../../shared/models').Notification;
const { createAuditLog } = require('../../../../shared/services/auditService');
const notify = require('../../../../utils/notify');
const bcrypt = require('bcryptjs');

// Login
exports.login = async (req, res) => {
    const { username, password } = req.body;

    try {
        const admin = await Admin.findOne({ 
            username: username.toLowerCase(),
            isActive: true,
            isDeleted: false
        });

        if (!admin) {
            req.session.loginError = 'Invalid credentials';
            return res.redirect('/admin/login/form');
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            req.session.loginError = 'Invalid credentials';
            return res.redirect('/admin/login/form');
        }

        // Prevent session fixation
        req.session.regenerate((regenErr) => {
            if (regenErr) {
                console.error('Session regenerate error:', regenErr);
                req.session.loginError = 'An error occurred during login';
                return res.redirect('/admin/login/form');
            }

            // Set session
            req.session.loggedIn = true;
            req.session.userType = 'admin';
            req.session.adminId = admin._id;
            req.session.adminName = admin.username;
            req.session.adminRole = admin.role;

            return res.redirect('/admin/dashboard');
        });
    } catch (err) {
        console.error('Login error:', err);
        req.session.loginError = 'An error occurred during login';
        res.redirect('/admin/login/form');
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
        const now = new Date();
        const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
        const sevenDaysFromNow = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
        
        // Basic Stats
        const totalTenants = await Tenant.countDocuments({ isDeleted: false });
        const totalProperties = await Property.countDocuments({ isDeleted: false });
        const occupiedProperties = await Property.countDocuments({ status: 'occupied', isDeleted: false });
        const availableProperties = await Property.countDocuments({ status: 'available', isDeleted: false });
        const pendingApplications = await Application.countDocuments({ status: 'pending', isDeleted: false });

        // Critical Alerts
        const overdueInvoices = await Invoice.countDocuments({
            status: 'overdue',
            isDeleted: false
        });

        // Rent control metrics
        const nowStartOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // All open rent invoices (monthly rent or legacy rent) that are unpaid/partial/overdue
        const openRentInvoices = await Invoice.find({
            isDeleted: false,
            $and: [
                { $or: [ { type: 'monthly_rent' }, { type: 'rent' } ] },
                { $or: [ { status: 'unpaid' }, { status: 'partial' }, { status: 'overdue' } ] }
            ]
        }).lean();

        let totalOutstandingRent = 0;
        const tenantLateDays = new Map(); // tenantId -> { lateInvoices, totalLateDays }

        openRentInvoices.forEach(inv => {
            const totalAmount = Number(inv.totalAmount) || 0;
            const paidAmount = Number(inv.paidAmount) || 0;
            const balance = typeof inv.balance === 'number'
                ? Number(inv.balance)
                : Math.max(0, totalAmount - paidAmount);

            totalOutstandingRent += balance;

            if (inv.dueDate) {
                const due = new Date(inv.dueDate);
                if (!isNaN(due.getTime()) && nowStartOfDay > due) {
                    const diffDays = Math.floor((nowStartOfDay - due) / (1000 * 60 * 60 * 24));
                    const tenantKey = String(inv.tenantId);
                    if (!tenantLateDays.has(tenantKey)) {
                        tenantLateDays.set(tenantKey, { lateInvoices: 0, totalLateDays: 0 });
                    }
                    const agg = tenantLateDays.get(tenantKey);
                    agg.lateInvoices += 1;
                    agg.totalLateDays += diffDays;
                }
            }
        });

        // Tenants overdue > 5 days (at least one invoice more than 5 days late)
        let tenantsOverdue5Plus = 0;
        tenantLateDays.forEach(value => {
            if (value.totalLateDays > 5) {
                tenantsOverdue5Plus += 1;
            }
        });

        // Repeat late payers: tenants with 2+ late invoices
        let repeatLatePayers = 0;
        tenantLateDays.forEach(value => {
            if (value.lateInvoices >= 2) {
                repeatLatePayers += 1;
            }
        });

        // Leases expiring within 30 days
        const expiringLeases = await Tenant.countDocuments({
            leaseEndDate: { $lte: thirtyDaysFromNow, $gte: now },
            isDeleted: false
        });

        // Pending maintenance tickets
        const pendingMaintenance = await require('../../../../shared/models').Ticket.countDocuments({
            status: { $in: ['open', 'pending'] },
            isDeleted: false
        }).catch(() => 0);

        // Upcoming Rent Due (Next 7 Days)
        const upcomingDues = await Tenant.find({
            isDeleted: false
        })
        .populate('propertyId', 'propertyname rent rentDueDay')
        .lean();

        // Filter and format upcoming dues
        const upcomingDuesFormatted = upcomingDues
            .filter(tenant => {
                if (!tenant.propertyId) return false;
                const dueDay = tenant.propertyId.rentDueDay || 5;
                const nextDueDate = new Date(now.getFullYear(), now.getMonth(), dueDay);
                if (nextDueDate < now) {
                    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
                }
                return nextDueDate <= sevenDaysFromNow;
            })
            .map(tenant => {
                const dueDay = tenant.propertyId.rentDueDay || 5;
                const nextDueDate = new Date(now.getFullYear(), now.getMonth(), dueDay);
                if (nextDueDate < now) {
                    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
                }
                return {
                    tenantId: tenant._id,
                    tenantName: `${tenant.firstname} ${tenant.lastname}`,
                    propertyName: tenant.propertyId.propertyname,
                    dueDate: nextDueDate.toLocaleDateString('en-IN'),
                    amount: tenant.propertyId.rent
                };
            });

        // Get recent payments
        const recentPayments = await Payment.find({ isDeleted: false })
            .populate('tenantId', 'firstname lastname')
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        // Get pending invoices with overdue calculation (includes booking deposits)
        const pendingInvoices = await Invoice.find({ 
            isDeleted: false,
            $or: [
                { status: 'unpaid' },
                { status: 'overdue' }
            ]
        })
            .populate('tenantId', 'firstname lastname')
            .populate('propertyId', 'propertyname rent')
            .sort({ dueDate: 1 })
            .limit(10)
            .lean();

        // Calculate days overdue
        pendingInvoices.forEach(invoice => {
            if (invoice.dueDate && new Date(invoice.dueDate) < now) {
                const diffTime = Math.abs(now - new Date(invoice.dueDate));
                invoice.daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }
        });

        // Simple late payment prediction based on history
        const predictions = await Payment.aggregate([
            {
                $match: {
                    isDeleted: false,
                    status: 'approved'
                }
            },
            {
                $group: {
                    _id: '$tenantId',
                    avgDaysLate: { $avg: '$daysLate' },
                    lateCount: {
                        $sum: {
                            $cond: [{ $gt: ['$daysLate', 0] }, 1, 0]
                        }
                    },
                    totalPayments: { $sum: 1 }
                }
            },
            {
                $match: {
                    lateCount: { $gte: 2 }
                }
            },
            {
                $limit: 5
            }
        ]);

        const predictionsFormatted = await Promise.all(
            predictions.map(async (pred) => {
                const tenant = await Tenant.findById(pred._id).populate('propertyId', 'propertyname').lean();
                if (!tenant) return null;
                const riskLevel = Math.min(Math.round((pred.lateCount / pred.totalPayments) * 100), 100);
                return {
                    tenantName: `${tenant.firstname} ${tenant.lastname}`,
                    propertyName: tenant.propertyId?.propertyname || 'N/A',
                    riskLevel
                };
            })
        );

        const notifications = await Notification.find({ userType: 'admin' })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        res.render('admin-dashboard', {
            layout: false,
            adminName: req.session.adminName,
            currentDate: now.toLocaleDateString('en-IN', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            }),
            stats: {
                totalTenants,
                totalProperties,
                occupiedProperties,
                availableProperties,
                pendingApplications
            },
            alerts: {
                overduePayments: overdueInvoices,
                expiringLeases,
                pendingMaintenance,
                tenantsOverdue5Plus,
                totalOutstandingRent,
                repeatLatePayers
            },
            upcomingDues: upcomingDuesFormatted,
            recentPayments,
            pendingInvoices,
            predictions: predictionsFormatted.filter(p => p !== null)
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).send('Error loading dashboard: ' + err.message);
    }
};

// Detailed list of overdue and open rent invoices
exports.overdueRent = async (req, res) => {
    try {
        const now = new Date();
        const nowStartOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const rentInvoices = await Invoice.find({
            isDeleted: false,
            $and: [
                { $or: [ { type: 'monthly_rent' }, { type: 'rent' } ] },
                { $or: [ { status: 'unpaid' }, { status: 'partial' }, { status: 'overdue' } ] }
            ]
        })
            .populate('tenantId', 'firstname lastname')
            .populate('propertyId', 'propertyname')
            .sort({ dueDate: 1 })
            .lean();

        // Late fee invoices associated with the same tenants/properties/months.
        // To keep this robust and avoid ObjectId $in casting issues, we simply
        // load all open late_fee invoices and filter/aggregate them in memory
        // keyed by tenant/property/month.
        const lateFeeInvoices = await Invoice.find({
            isDeleted: false,
            type: 'late_fee',
            $or: [
                { status: 'unpaid' },
                { status: 'partial' },
                { status: 'overdue' }
            ]
        }).lean();

        const lateFeeMap = new Map(); // key: tenantId|propertyId|month -> lateFeeOutstanding
        let totalRentOutstanding = 0;
        let totalLateFeeOutstanding = 0;
        let tenantsOverdue5Plus = 0;
        const tenantOverdueSet = new Set();

        rentInvoices.forEach(inv => {
            const totalAmount = Number(inv.totalAmount) || 0;
            const paidAmount = Number(inv.paidAmount) || 0;
            const balance = typeof inv.balance === 'number'
                ? Number(inv.balance)
                : Math.max(0, totalAmount - paidAmount);

            inv.outstanding = balance;
            totalRentOutstanding += balance;

            if (inv.dueDate) {
                const due = new Date(inv.dueDate);
                if (!isNaN(due.getTime()) && nowStartOfDay > due) {
                    const diffDays = Math.floor((nowStartOfDay - due) / (1000 * 60 * 60 * 24));
                    inv.daysOverdue = diffDays;

                    if (diffDays > 5 && inv.tenantId) {
                        const key = String(inv.tenantId._id);
                        if (!tenantOverdueSet.has(key)) {
                            tenantOverdueSet.add(key);
                            tenantsOverdue5Plus += 1;
                        }
                    }
                }
            }
        });

        // Build late fee map keyed by tenant/property/month
        for (const lf of lateFeeInvoices) {
            const key = `${lf.tenantId?.toString() || ''}|${lf.propertyId?.toString() || ''}|${lf.month || ''}`;
            const lfTotal = Number(lf.totalAmount) || 0;
            const lfPaid = Number(lf.paidAmount) || 0;
            const lfBalance = lf.balance != null
                ? Number(lf.balance)
                : Math.max(0, lfTotal - lfPaid);

            const prev = lateFeeMap.get(key) || 0;
            const sum = prev + lfBalance;
            lateFeeMap.set(key, sum);
            totalLateFeeOutstanding += lfBalance;
        }

        // Attach per-row late fee outstanding
        rentInvoices.forEach(inv => {
            const key = `${inv.tenantId?._id?.toString() || inv.tenantId?.toString() || ''}|${inv.propertyId?._id?.toString() || inv.propertyId?.toString() || ''}|${inv.month || ''}`;
            inv.lateFeeOutstanding = lateFeeMap.get(key) || 0;
        });

        res.render('admin-rent-overdue', {
            layout: false,
            adminName: req.session.adminName,
            invoices: rentInvoices,
            totals: {
                rentOutstanding: totalRentOutstanding,
                lateFeeOutstanding: totalLateFeeOutstanding,
                totalOutstanding: totalRentOutstanding + totalLateFeeOutstanding,
                tenantsOverdue5Plus
            }
        });
    } catch (err) {
        console.error('Overdue rent view error:', err);
        res.status(500).send('Error loading overdue rent view: ' + err.message);
    }
};

// Tenants List
exports.tenants = async (req, res) => {
    try {
        const tenants = await Tenant.find({ isDeleted: false })
            .populate('propertyId', 'propertyname propertyaddress')
            .sort({ createdAt: -1 })
            .lean();

        res.render('admin-tenants', {
            layout: false,
            adminName: req.session.adminName,
            tenants
        });
    } catch (err) {
        console.error('Tenants error:', err);
        res.status(500).send('Error loading tenants');
    }
};

// View single tenant
exports.viewTenant = async (req, res) => {
    try {
        const tenant = await Tenant.findById(req.params.id)
            .populate('propertyId', 'propertyname')
            .lean();

        if (!tenant) {
            return res.redirect('/admin/tenants');
        }

        res.render('admin-tenant-view', {
            layout: false,
            adminName: req.session.adminName,
            tenant
        });
    } catch (err) {
        console.error('View tenant error:', err);
        res.redirect('/admin/tenants');
    }
};

// Edit tenant form
exports.editTenantForm = async (req, res) => {
    try {
        const tenant = await Tenant.findById(req.params.id)
            .populate('propertyId', 'propertyname')
            .lean();

        if (!tenant) {
            return res.redirect('/admin/tenants');
        }

        res.render('admin-tenant-edit', {
            layout: false,
            adminName: req.session.adminName,
            tenant
        });
    } catch (err) {
        console.error('Edit tenant form error:', err);
        res.redirect('/admin/tenants');
    }
};

// Update tenant
exports.updateTenant = async (req, res) => {
    try {
        const tenant = await Tenant.findById(req.params.id);
        if (!tenant) {
            return res.redirect('/admin/tenants');
        }

        const before = {
            firstname: tenant.firstname,
            lastname: tenant.lastname,
            email: tenant.email,
            phone: tenant.phone,
            status: tenant.status
        };

        tenant.firstname = req.body.firstname;
        tenant.lastname = req.body.lastname;
        tenant.email = req.body.email.toLowerCase();
        tenant.phone = req.body.phone;
        tenant.status = req.body.status || tenant.status;

        await tenant.save();

        await createAuditLog({
            req,
            userId: req.session.adminId,
            userType: 'admin',
            action: 'update_tenant',
            entity: 'Tenant',
            entityId: tenant._id,
            changes: { before, after: {
                firstname: tenant.firstname,
                lastname: tenant.lastname,
                email: tenant.email,
                phone: tenant.phone,
                status: tenant.status
            }}
        });

        req.session.success = 'Tenant updated successfully!';
        res.redirect('/admin/tenants');
    } catch (err) {
        console.error('Update tenant error:', err);
        req.session.error = 'Failed to update tenant';
        res.redirect('/admin/tenants');
    }
};

// Properties List
exports.properties = async (req, res) => {
    try {
        const properties = await Property.find({ isDeleted: false })
            .populate('tenantId', 'firstname lastname')
            .sort({ createdAt: -1 })
            .lean();

        res.render('admin-properties', {
            layout: false,
            adminName: req.session.adminName,
            properties
        });
    } catch (err) {
        console.error('Properties error:', err);
        res.status(500).send('Error loading properties');
    }
};

// View single property
exports.viewProperty = async (req, res) => {
    try {
        const property = await Property.findById(req.params.id)
            .populate('tenantId', 'firstname lastname email')
            .lean();

        if (!property) {
            return res.redirect('/admin/properties');
        }

        res.render('admin-property-view', {
            layout: false,
            adminName: req.session.adminName,
            property
        });
    } catch (err) {
        console.error('View property error:', err);
        res.redirect('/admin/properties');
    }
};

// Edit property form
exports.editPropertyForm = async (req, res) => {
    try {
        const property = await Property.findById(req.params.id).lean();
        if (!property) {
            return res.redirect('/admin/properties');
        }

        res.render('admin-property-edit', {
            layout: false,
            adminName: req.session.adminName,
            property
        });
    } catch (err) {
        console.error('Edit property form error:', err);
        res.redirect('/admin/properties');
    }
};

// Update property
exports.updateProperty = async (req, res) => {
    try {
        const property = await Property.findById(req.params.id);
        if (!property) {
            return res.redirect('/admin/properties');
        }

        const before = {
            propertyname: property.propertyname,
            rent: property.rent,
            status: property.status
        };

        // Handle existing images
        let existingImages = [];
        if (req.body.existingImages) {
            existingImages = Array.isArray(req.body.existingImages) 
                ? req.body.existingImages 
                : [req.body.existingImages];
        }

        // Handle newly uploaded images
        const newImages = req.files ? req.files.map(file => file.filename) : [];

        // Combine existing and new images
        const allImages = [...existingImages, ...newImages];

        property.propertyname = req.body.propertyname;
        property.propertyaddress = req.body.propertyaddress;
        property.city = req.body.city;
        property.state = req.body.state;
        property.pincode = req.body.pincode;
        property.rent = Number(req.body.rent) || property.rent;
        property.bookingDeposit = Number(req.body.bookingDeposit) || property.bookingDeposit;
        property.deposit = Number(req.body.deposit) || property.deposit;
        property.status = req.body.status || property.status;
        property.images = allImages;

        await property.save();

        await createAuditLog({
            req,
            userId: req.session.adminId,
            userType: 'admin',
            action: 'update_property',
            entity: 'Property',
            entityId: property._id,
            changes: { before, after: {
                propertyname: property.propertyname,
                rent: property.rent,
                status: property.status
            }}
        });

        req.session.success = 'Property updated successfully!';
        res.redirect('/admin/properties');
    } catch (err) {
        console.error('Update property error:', err);
        req.session.error = 'Failed to update property';
        res.redirect('/admin/properties');
    }
};

// Payments List (driven by invoices so admin can see deposit status)
exports.payments = async (req, res) => {
    try {
        const filter = req.query.filter; // currently not used for DB filter to avoid casting issues

        const invoices = await Invoice.find({ isDeleted: false })
            .populate('tenantId', 'firstname lastname')
            .populate('propertyId', 'propertyname rent')
            .sort({ createdAt: -1 })
            .lean();

        res.render('admin-payments', {
            layout: false,
            adminName: req.session.adminName,
            invoices,
            filter
        });
    } catch (err) {
        console.error('Payments error:', err);
        res.status(500).send('Error loading payments');
    }
};

// Create Invoice Form
exports.createInvoiceForm = async (req, res) => {
    try {
        const tenants = await Tenant.find({ isDeleted: false })
            .select('firstname lastname email tenantId')
            .lean();

        const properties = await Property.find({ isDeleted: false })
            .select('propertyname')
            .lean();

        res.render('admin-add-invoice', {
            layout: false,
            adminName: req.session.adminName,
            tenants,
            properties
        });
    } catch (err) {
        console.error('Create invoice form error:', err);
        res.status(500).send('Error loading invoice form');
    }
};

// Create Invoice
exports.createInvoice = async (req, res) => {
    try {
        const { tenantId, propertyId, month, rentAmount, maintenanceCharges, waterCharges, electricityCharges, otherCharges, totalAmount, dueDate } = req.body;

        if (!tenantId || !propertyId || !month || !rentAmount || !dueDate || !totalAmount) {
            return res.status(400).json({ 
                success: false, 
                message: 'Tenant, Property, Month, Rent Amount, Total Amount, and Due Date are required' 
            });
        }

        // Create invoice
        const invoice = new Invoice({
            tenantId,
            propertyId,
            month,
            rentAmount: parseFloat(rentAmount),
            maintenanceCharges: parseFloat(maintenanceCharges) || 0,
            waterCharges: parseFloat(waterCharges) || 0,
            electricityCharges: parseFloat(electricityCharges) || 0,
            otherCharges: parseFloat(otherCharges) || 0,
            totalAmount: parseFloat(totalAmount),
            dueDate: new Date(dueDate),
            status: 'unpaid'
        });

        await invoice.save();

        // Create ledger entry
        await LedgerEntry.create({
            tenantId,
            type: 'debit',
            amount: parseFloat(totalAmount),
            description: `Invoice created for ${month} - Rent: $${rentAmount}`,
            reference: `invoice_${invoice._id}`,
            balance: 0
        });

        res.json({ 
            success: true, 
            message: 'Invoice created successfully',
            invoiceId: invoice._id
        });
    } catch (err) {
        console.error('Create invoice error:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Error creating invoice: ' + err.message 
        });
    }
};

// Reports
exports.reports = async (req, res) => {
    try {
        res.render('admin-reports', {
            layout: false,
            adminName: req.session.adminName
        });
    } catch (err) {
        console.error('Reports error:', err);
        res.status(500).send('Error loading reports');
    }
};

// Show Add Property Form
exports.addPropertyForm = async (req, res) => {
    try {
        res.render('admin-add-property', {
            layout: false,
            adminName: req.session.adminName,
            error: req.session.error,
            success: req.session.success
        });
        delete req.session.error;
        delete req.session.success;
    } catch (err) {
        console.error('Add property form error:', err);
        res.status(500).send('Error loading form');
    }
};

// Add Property
exports.addProperty = async (req, res) => {
    try {
        const rent = Number(req.body.rent) || 0;
        const deposit = Number(req.body.deposit) || 0;
        const maintenanceFee = Number(req.body.maintenanceFee) || 0;

        // If bookingDeposit not provided, default to ~20% of upfront cost
        let bookingDeposit = Number(req.body.bookingDeposit);
        if (!bookingDeposit || bookingDeposit <= 0) {
            const totalUpfront = rent + deposit + maintenanceFee;
            bookingDeposit = totalUpfront > 0 ? Math.round(totalUpfront * 0.2) : 0;
        }

        // Handle uploaded images
        const images = req.files ? req.files.map(file => file.filename) : [];

        const propertyData = {
            propertyname: req.body.propertyname,
            propertytype: req.body.propertytype,
            propertyaddress: req.body.propertyaddress,
            city: req.body.city,
            state: req.body.state,
            pincode: req.body.pincode,
            bedrooms: req.body.bedrooms,
            bathrooms: req.body.bathrooms,
            squareFeet: req.body.squareFeet,
            furnishing: req.body.furnishing || 'unfurnished',
            rent,
            bookingDeposit,
            deposit,
            maintenanceFee,
            rentDueDay: req.body.rentDueDay || 5,
            lateFeePerDay: req.body.lateFeePerDay || 100,
            status: req.body.status || 'available',
            parking: req.body.parking,
            amenities: req.body.amenities ? req.body.amenities.split(',').map(a => a.trim()) : [],
            description: req.body.description,
            images: images,
            isActive: true,
            isDeleted: false
        };

        const property = new Property(propertyData);
        await property.save();

        req.session.success = 'Property added successfully!';
        res.redirect('/admin/properties');
    } catch (err) {
        console.error('Add property error:', err);
        req.session.error = 'Failed to add property: ' + err.message;
        res.redirect('/admin/properties/add');
    }
};

// Show Add Tenant Form
exports.addTenantForm = async (req, res) => {
    try {
        const properties = await Property.find({ 
            status: 'available',
            isDeleted: false
        }).lean();

        res.render('admin-add-tenant', {
            layout: false,
            adminName: req.session.adminName,
            properties,
            error: req.session.error,
            success: req.session.success
        });
        delete req.session.error;
        delete req.session.success;
    } catch (err) {
        console.error('Add tenant form error:', err);
        res.status(500).send('Error loading form');
    }
};

// Add Tenant
exports.addTenant = async (req, res) => {
    try {
        const tenantData = {
            tenantid: req.body.tenantid,
            firstname: req.body.firstname,
            lastname: req.body.lastname,
            email: req.body.email,
            phone: req.body.phone,
            password: req.body.password, // Will be hashed by model pre-save hook
            dob: req.body.dob,
            occupation: req.body.occupation,
            idProofType: req.body.idProofType,
            idProofNumber: req.body.idProofNumber,
            propertyId: req.body.propertyId || null,
            leaseStartDate: req.body.leaseStartDate,
            leaseEndDate: req.body.leaseEndDate,
            emergencyContact: {
                name: req.body.emergencyContactName,
                phone: req.body.emergencyContactPhone
            },
            status: 'active',
            isActive: true,
            isDeleted: false
        };

        const tenant = new Tenant(tenantData);
        await tenant.save();

        // Update property status if assigned
        if (req.body.propertyId) {
            await Property.findByIdAndUpdate(req.body.propertyId, {
                status: 'occupied',
                tenantId: tenant._id
            });
        }

        req.session.success = 'Tenant added successfully!';
        res.redirect('/admin/tenants');
    } catch (err) {
        console.error('Add tenant error:', err);
        req.session.error = 'Failed to add tenant: ' + err.message;
        res.redirect('/admin/tenants/add');
    }
};

// Send Reminder to Tenant
exports.sendReminder = async (req, res) => {
    try {
        const tenantId = req.params.tenantId;
        const tenant = await Tenant.findById(tenantId)
            .populate('propertyId', 'propertyname rent')
            .lean();

        if (!tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        // In a real application, this would send an email/SMS
        // For now, we'll just log it and return success
        console.log(`Reminder sent to ${tenant.email} for property ${tenant.propertyId?.propertyname}`);
        console.log(`Rent amount: ₹${tenant.propertyId?.rent}`);

        // You can integrate with notification service here
        // const notify = require('../../../../utils/notify');
        // await notify.sendEmail({
        //     to: tenant.email,
        //     subject: 'Rent Payment Reminder',
        //     body: `Dear ${tenant.firstname}, this is a reminder that your rent payment of ₹${tenant.propertyId.rent} is due soon.`
        // });

        res.json({ 
            success: true, 
            message: `Reminder sent to ${tenant.firstname} ${tenant.lastname}` 
        });
    } catch (err) {
        console.error('Send reminder error:', err);
        res.status(500).json({ error: 'Failed to send reminder' });
    }
};

// View Maintenance Requests
exports.maintenance = async (req, res) => {
    try {
        const tickets = await Ticket.find({ isDeleted: false })
            .populate('tenantId', 'firstname lastname email')
            .populate({
                path: 'tenantId',
                populate: {
                    path: 'propertyId',
                    select: 'propertyname'
                }
            })
            .sort({ createdAt: -1 })
            .lean();

        // Calculate ticket counts
        const openCount = tickets.filter(t => t.status === 'open').length;
        const inProgressCount = tickets.filter(t => t.status === 'in-progress').length;
        const resolvedCount = tickets.filter(t => t.status === 'resolved').length;

        res.render('admin-maintenance', {
            tickets,
            openCount,
            inProgressCount,
            resolvedCount,
            totalCount: tickets.length,
            maintenanceSuccess: req.session.maintenanceSuccess,
            maintenanceError: req.session.maintenanceError
        });

        // Clear flash messages
        req.session.maintenanceSuccess = null;
        req.session.maintenanceError = null;
    } catch (err) {
        console.error('Maintenance fetch error:', err);
        res.render('admin-maintenance', {
            tickets: [],
            openCount: 0,
            inProgressCount: 0,
            resolvedCount: 0,
            totalCount: 0,
            maintenanceError: 'Failed to load maintenance requests'
        });
    }
};

// Update Maintenance Request Status
exports.updateMaintenanceStatus = async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { status } = req.body;

        if (!['open', 'in-progress', 'resolved'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const ticket = await Ticket.findByIdAndUpdate(
            ticketId,
            { status },
            { new: true }
        ).populate('tenantId', 'firstname lastname email');

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        // Optional: Send notification to tenant
        console.log(`Ticket #${ticket._id} status updated to: ${status}`);
        console.log(`Tenant: ${ticket.tenantId?.firstname} ${ticket.tenantId?.lastname} (${ticket.tenantId?.email})`);

        req.session.maintenanceSuccess = `Ticket status updated to ${status}`;
        res.json({ 
            success: true, 
            message: `Ticket status updated to ${status}`,
            ticket 
        });
    } catch (err) {
        console.error('Update maintenance status error:', err);
        res.status(500).json({ error: 'Failed to update ticket status' });
    }
};

// View Applications
exports.applications = async (req, res) => {
    try {
        const filter = req.query.filter;
        
        const query = { isDeleted: false };
        if (filter === 'pending') query.status = 'pending';
        if (filter === 'approved') query.status = 'approved';
        if (filter === 'rejected') query.status = 'rejected';
        
        const applications = await Application.find(query)
            .populate('propertyId')
            .populate('tenantId', 'firstname lastname email phone')
            .sort({ createdAt: -1 })
            .lean();
        
        // Get counts for filters
        const counts = {
            total: await Application.countDocuments({ isDeleted: false }),
            pending: await Application.countDocuments({ status: 'pending', isDeleted: false }),
            approved: await Application.countDocuments({ status: 'approved', isDeleted: false }),
            rejected: await Application.countDocuments({ status: 'rejected', isDeleted: false })
        };
        
        const successMessage = req.session.applicationSuccess;
        const errorMessage = req.session.applicationError;
        delete req.session.applicationSuccess;
        delete req.session.applicationError;
        
        res.render('admin-applications', {
            layout: false,
            adminName: req.session.adminName,
            applications,
            counts,
            filter,
            successMessage,
            errorMessage
        });
    } catch (err) {
        console.error('Applications error:', err);
        res.status(500).send('Error loading applications');
    }
};

// Approve/Reject Application
exports.applicationDecision = async (req, res) => {
    try {
        const applicationId = req.params.id;
        const decision = req.body.decision; // 'approve' or 'reject'
        const adminComments = req.body.adminComments;
        
        const application = await Application.findById(applicationId)
            .populate('propertyId')
            .populate('tenantId');
        
        if (!application) {
            req.session.applicationError = 'Application not found';
            return res.redirect('/admin/applications');
        }
        
        // Check if property data exists
        if (!application.propertyId) {
            req.session.applicationError = 'Property information is missing or has been deleted.';
            return res.redirect('/admin/applications');
        }
        
        if (application.status !== 'pending') {
            req.session.applicationError = 'This application has already been processed.';
            return res.redirect('/admin/applications');
        }
        
        if (decision === 'approve') {
            // APPROVAL ENGINE - create/associate tenant account, then issue booking deposit invoice

            // Check if tenant already exists with this email
            let tenant = await Tenant.findOne({ email: application.applicantEmail, isDeleted: false });

            if (!tenant) {
                // Create new tenant account automatically (without assigning property yet)
                const bcrypt = require('bcryptjs');
                const temporaryPassword = Math.random().toString(36).slice(-8); // Generate random password
                const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

                // Extract first and last name from applicantName
                const nameParts = application.applicantName.trim().split(' ');
                const firstname = nameParts[0];
                const lastname = nameParts.slice(1).join(' ') || firstname;

                // Generate unique tenant ID
                const tenantCount = await Tenant.countDocuments();
                const tenantid = `TEN${String(tenantCount + 1).padStart(5, '0')}`;

                tenant = new Tenant({
                    tenantid,
                    firstname,
                    lastname,
                    email: application.applicantEmail,
                    phone: application.phone,
                    tenantpassword: hashedPassword,
                    occupation: application.occupation,
                    status: 'active',
                    isActive: true,
                    isDeleted: false
                });

                await tenant.save();

                console.log(`✅ Auto-created tenant account: ${tenant.email} | Tenant ID: ${tenantid} | Temporary Password: ${temporaryPassword}`);

                // In production, send email with credentials
                // await sendEmail(tenant.email, 'Welcome to LeaseHub', `Your account has been created. Tenant ID: ${tenantid}, Temp Password: ${temporaryPassword}`);
            } else {
                console.log(`✅ Using existing tenant account for approval: ${tenant.email}`);
            }

            // Update application: mark as approved and set expiry for booking deposit
            const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours from now
            application.status = 'approved';
            application.tenantId = tenant._id;
            application.adminComments = adminComments || 'Your application has been approved! Please pay the booking deposit within 48 hours to reserve the property.';
            application.approvedBy = req.session.adminId;
            application.approvedAt = new Date();
            application.expiresAt = expiresAt;
            await application.save();

            // Generate booking deposit invoice
            const Invoice = require('../../../../shared/models').Invoice;
            const now = new Date();
            const dueDate = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 hours from now
            const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            // Ensure booking deposit is at least 20% of monthly rent
            const monthlyRent = Number(application.propertyId.rent) || 0;
            let bookingDeposit = Number(application.propertyId.bookingDeposit);
            if (!bookingDeposit || bookingDeposit <= 0) {
                bookingDeposit = Math.round(monthlyRent * 0.2);
            }

            const invoice = new Invoice({
                type: 'booking_deposit',
                tenantId: tenant._id,
                propertyId: application.propertyId._id,
                month,
                rentAmount: bookingDeposit,
                maintenanceCharges: 0,
                waterCharges: 0,
                electricityCharges: 0,
                otherCharges: 0,
                totalAmount: bookingDeposit,
                dueDate,
                status: 'unpaid',
                paidAmount: 0,
                isDeleted: false
            });

            await invoice.save();

            console.log(`✅ Generated booking deposit invoice: ${invoice._id} | Amount: ₹${invoice.totalAmount}`);

            // Notify tenant about approval and booking deposit requirement
            try {
                await Notification.create({
                    userType: 'tenant',
                    tenantId: tenant._id,
                    title: 'Application approved - Booking deposit required',
                    message: `Your application for ${application.propertyId.propertyname} has been approved. Pay the booking deposit of ₹${bookingDeposit} within 48 hours to reserve the property.`,
                    type: 'booking_deposit_required',
                    metadata: {
                        applicationId: application._id,
                        propertyId: application.propertyId._id,
                        invoiceId: invoice._id,
                        expiresAt
                    }
                });
            } catch (notifyErr) {
                console.error('Failed to create tenant notification for booking deposit:', notifyErr.message);
            }
            
            // Reject all other pending applications for this property
            await Application.updateMany(
                {
                    propertyId: application.propertyId._id,
                    status: 'pending'
                },
                {
                    status: 'rejected',
                    adminComments: 'Property has been assigned to another applicant'
                }
            );
            
            // Auto-cancel all other pending applications by the same tenant (by email)
            const cancelledApps = await Application.updateMany(
                {
                    applicantEmail: application.applicantEmail,
                    status: 'pending'
                },
                {
                    status: 'cancelled',
                    adminComments: 'Automatically cancelled - Tenant approved for another property'
                }
            );
            
            if (cancelledApps.modifiedCount > 0) {
                console.log(`✅ Auto-cancelled ${cancelledApps.modifiedCount} other pending application(s) by this tenant`);
            }
            
            req.session.applicationSuccess = `Application approved successfully! Tenant account created and property assigned. First invoice generated. ${cancelledApps.modifiedCount > 0 ? `(${cancelledApps.modifiedCount} other pending application(s) by this tenant were auto-cancelled)` : ''}`;
            
        } else if (decision === 'reject') {
            // Reject application
            application.status = 'rejected';
            application.adminComments = adminComments || 'Application did not meet requirements';
            application.reviewedBy = req.session.adminId;
            application.reviewedAt = new Date();
            await application.save();
            
            console.log(`❌ Application REJECTED. Reason: ${application.adminComments}`);
            req.session.applicationSuccess = 'Application rejected successfully!';
        }
        
        res.redirect('/admin/applications');
    } catch (err) {
        console.error('Application decision error:', err);
        console.error('Error details:', err.message);
        console.error('Error stack:', err.stack);
        req.session.applicationError = `Error: ${err.message}`;
        res.redirect('/admin/applications');
    }
};

// Admin-initiated cancellation of an application/reservation
exports.applicationCancel = async (req, res) => {
    try {
        const applicationId = req.params.id;
        const reason = req.body.reason;

        const application = await Application.findById(applicationId)
            .populate('propertyId')
            .populate('tenantId');

        if (!application) {
            req.session.applicationError = 'Application not found';
            return res.redirect('/admin/applications');
        }

        const property = application.propertyId;

        // Do not allow cancellation after occupancy is marked
        if (property && property.status === 'occupied') {
            req.session.applicationError = 'Cannot cancel an application after the tenant has moved in.';
            return res.redirect('/admin/applications');
        }

        if (application.status === 'cancelled') {
            req.session.applicationSuccess = 'Application is already cancelled.';
            return res.redirect('/admin/applications');
        }

        const beforeStatus = application.status;
        const propertyBeforeStatus = property ? property.status : undefined;

        application.status = 'cancelled';
        application.adminComments = reason || 'Cancelled by admin';
        application.reviewedBy = req.session.adminId;
        application.reviewedAt = new Date();
        await application.save();

        if (property) {
            property.status = 'available';
            if (property.tenantId && application.tenantId && String(property.tenantId) === String(application.tenantId._id)) {
                property.tenantId = null;
            }
            await property.save();
        }

        // Find tenant for notification: prefer linked tenant, fall back to email lookup
        let tenant = application.tenantId;
        if (!tenant && application.applicantEmail) {
            tenant = await Tenant.findOne({ email: application.applicantEmail.toLowerCase(), isDeleted: false });
        }

        if (tenant && notify && typeof notify.sendApplicationCancelledByAdmin === 'function') {
            try {
                await notify.sendApplicationCancelledByAdmin({
                    tenant,
                    application,
                    property,
                    reason
                });
            } catch (emailErr) {
                console.error('Failed to send application cancellation email:', emailErr.message || emailErr);
            }
        }

        await createAuditLog({
            req,
            userId: req.session.adminId,
            userType: 'admin',
            action: 'cancel_application',
            entity: 'Application',
            entityId: application._id,
            changes: {
                status: { before: beforeStatus, after: 'cancelled' },
                ...(property ? { propertyStatus: { before: propertyBeforeStatus, after: property.status } } : {})
            }
        });

        req.session.applicationSuccess = 'Application cancelled successfully.';
        res.redirect('/admin/applications');
    } catch (err) {
        console.error('Application cancel error:', err);
        req.session.applicationError = 'Error cancelling application: ' + err.message;
        res.redirect('/admin/applications');
    }
};

// Admin Notifications page
exports.notifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ userType: 'admin' })
            .sort({ createdAt: -1 })
            .lean();

        res.render('admin-notifications', {
            layout: false,
            adminName: req.session.adminName,
            notifications
        });
    } catch (err) {
        console.error('Admin notifications error:', err);
        res.status(500).send('Error loading notifications');
    }
};
