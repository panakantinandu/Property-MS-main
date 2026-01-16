// Tenant-specific routes for tenant app
const express = require('express');
const router = express.Router();
const controller = require('./tenant.controller');

const { requireTenant } = require('../../../../shared/middleware/auth');

// Login routes
router.get('/login/form', (req, res) => {
    res.render('login', { 
        layout: false,
        error: req.session.loginError,
        success: req.session.registerSuccess,
        cspNonce: res.locals.cspNonce
    });
    req.session.loginError = null;
    req.session.registerSuccess = null;
});

router.post('/login', controller.login);
router.get('/logout', controller.logout);

// Registration routes
router.get('/register/form', controller.registerForm);
router.post('/register', controller.register);

// AJAX validation routes
router.post('/check-email', controller.checkEmail);
router.post('/check-tenantid', controller.checkTenantId);

// Forgot & Reset Password routes
router.get('/forgot-password', controller.forgotPasswordForm);
router.post('/forgot-password', controller.sendResetOTP);
router.get('/reset-password', controller.resetPasswordForm);
router.post('/reset-password', controller.resetPassword);

// Dashboard and tenant features (protected)
router.get('/dashboard', requireTenant(), controller.dashboard);
router.get('/profile', requireTenant(), controller.profile);
router.post('/profile/update', requireTenant(), controller.updateProfile);
router.get('/payments', requireTenant(), controller.payments);
router.get('/invoices', requireTenant(), controller.invoices);
router.post('/invoices/:invoiceId/pay', requireTenant(), controller.initiatePayment);
router.post('/pay-now', requireTenant(), controller.payNow);
router.post('/pay-deposit', requireTenant(), controller.payDeposit);
router.get('/payments/success', controller.paymentSuccess);
router.get('/payments/cancel', controller.paymentCancel);
router.get('/notifications', requireTenant(), controller.notifications);
router.get('/maintenance', requireTenant(), controller.maintenance);
router.post('/maintenance/request', requireTenant(), controller.submitMaintenanceRequest);

// Property and Application routes
router.get('/properties', requireTenant(), controller.properties);
router.get('/properties/apply/:propertyId', requireTenant(), controller.applyPropertyForm);
router.post('/properties/apply/:propertyId', requireTenant(), controller.applyProperty);
router.get('/applications', requireTenant(), controller.applications);
router.get('/get-approved-application', requireTenant(), controller.getApprovedApplication);
router.post('/applications/:id/cancel', requireTenant(), controller.cancelApplication);

module.exports = router;
