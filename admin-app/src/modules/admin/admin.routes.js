// Admin-specific routes for admin app
const express = require('express');
const router = express.Router();
const controller = require('./admin.controller');
const reportsController = require('./adminReports.controller');

const { requireAdmin } = require('../../../../shared/middleware/auth');

// Login routes
router.get('/login/form', (req, res) => {
    res.render('admin-login', { 
        layout: false,
        error: req.session.loginError 
    });
    req.session.loginError = null;
});

router.post('/login', controller.login);
router.get('/logout', controller.logout);

// Dashboard and admin features (protected)
router.get('/dashboard', requireAdmin(), controller.dashboard);
router.get('/tenants', requireAdmin(), controller.tenants);
router.get('/tenants/add', requireAdmin(), controller.addTenantForm);
router.post('/tenants/add', requireAdmin(), controller.addTenant);
router.get('/tenants/:id', requireAdmin(), controller.viewTenant);
router.get('/tenants/:id/edit', requireAdmin(), controller.editTenantForm);
router.post('/tenants/:id', requireAdmin(), controller.updateTenant);
router.get('/properties', requireAdmin(), controller.properties);
router.get('/properties/add', requireAdmin(), controller.addPropertyForm);
router.post('/properties/add', requireAdmin(), (req, res, next) => {
    const upload = req.app.locals.upload;
    upload.array('propertyImages', 10)(req, res, (err) => {
        if (err) {
            req.session.error = err.message || 'Error uploading images';
            return res.redirect('/admin/properties/add');
        }
        next();
    });
}, controller.addProperty);
router.get('/properties/:id', requireAdmin(), controller.viewProperty);
router.get('/properties/:id/edit', requireAdmin(), controller.editPropertyForm);
router.post('/properties/:id', requireAdmin(), (req, res, next) => {
    const upload = req.app.locals.upload;
    upload.array('propertyImages', 10)(req, res, (err) => {
        if (err) {
            req.session.error = err.message || 'Error uploading images';
            return res.redirect('/admin/properties/' + req.params.id + '/edit');
        }
        next();
    });
}, controller.updateProperty);
router.get('/payments', requireAdmin(), controller.payments);
router.get('/rent/overdue', requireAdmin(), controller.overdueRent);
router.get('/invoices/create', requireAdmin(), controller.createInvoiceForm);
router.post('/invoices/create', requireAdmin(), controller.createInvoice);
router.get('/applications', requireAdmin(), controller.applications);
router.post('/applications/:id/decision', requireAdmin(), controller.applicationDecision);
router.post('/applications/:id/cancel', requireAdmin(), controller.applicationCancel);
router.get('/reports', requireAdmin(), reportsController.getReports);
router.post('/send-reminder/:tenantId', requireAdmin(), controller.sendReminder);
router.get('/maintenance', requireAdmin(), controller.maintenance);
router.post('/maintenance/:ticketId/status', requireAdmin(), controller.updateMaintenanceStatus);
router.get('/notifications', requireAdmin(), controller.notifications);

module.exports = router;
