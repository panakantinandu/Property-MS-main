function wantsJson(req) {
    // Express sets req.xhr when X-Requested-With: XMLHttpRequest is present
    if (req.xhr) return true;

    const accept = (req.headers && req.headers.accept) || '';
    if (accept.includes('application/json')) return true;

    const contentType = (req.headers && req.headers['content-type']) || '';
    if (contentType.includes('application/json')) return true;

    return false;
}

function respondUnauthenticated(req, res, redirectTo) {
    if (wantsJson(req)) return res.status(401).json({ error: 'Unauthorized' });
    return res.redirect(redirectTo);
}

function respondForbidden(req, res, redirectTo) {
    if (wantsJson(req)) return res.status(403).json({ error: 'Forbidden' });
    return res.redirect(redirectTo);
}

function requireAdmin() {
    const { Admin } = require('../models');

    return async (req, res, next) => {
        try {
            if (!req.session || !req.session.loggedIn || req.session.userType !== 'admin' || !req.session.adminId) {
                return respondUnauthenticated(req, res, '/admin/login/form');
            }

            const adminExists = await Admin.exists({
                _id: req.session.adminId,
                isActive: true,
                isDeleted: false
            });

            if (!adminExists) {
                if (req.session) {
                    req.session.destroy(() => {});
                }
                return respondForbidden(req, res, '/admin/login/form');
            }

            return next();
        } catch (err) {
            return next(err);
        }
    };
}

function requireTenant() {
    const { Tenant } = require('../models');

    return async (req, res, next) => {
        try {
            if (!req.session || !req.session.loggedIn || req.session.userType !== 'tenant' || !req.session.tenantId) {
                return respondUnauthenticated(req, res, '/tenant/login/form');
            }

            const tenant = await Tenant.findOne({
                _id: req.session.tenantId,
                isDeleted: false
            })
                .select('_id status')
                .lean();

            if (!tenant || tenant.status !== 'active') {
                if (req.session) {
                    req.session.destroy(() => {});
                }
                return respondForbidden(req, res, '/tenant/login/form');
            }

            return next();
        } catch (err) {
            return next(err);
        }
    };
}

module.exports = {
    requireAdmin,
    requireTenant,
    wantsJson
};
