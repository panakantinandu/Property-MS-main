// jshint esversion:6
const express = require("express");
const router = express.Router();
const path = require("path");
const nodemailer = require("nodemailer");

const Admin = require("../models/admin");
const Tenant = require("../models/tenant");
const Property = require("../models/property");
const Registration = require("../models/registration");
const Loan = require("../models/loan");
const Testimonial = require("../models/testimonial");
const Transaction = require("../models/transaction");
const Cancellation = require("../models/cancellation");

const models = {
    tenant: Tenant,
    property: Property,
    registration: Registration,
    loan: Loan,
    testimonial: Testimonial,
    transaction: Transaction,
    cancellation: Cancellation,
};

const ids = {
    tenant: 6110,
    property: 3110,
    loan: 5110,
    transaction: 7110,
    testimonial: 6210,
    cancellation: 8110,
    registration: 4110
};

// --- Admin Auth Middleware ---
function isAdmin(req, res, next) {
    if (req.session && req.session.loggedIn && req.session.userType === 'admin') {
        return next();
    }
    res.redirect('/');
}

// --- Admin Dashboard ---
router.get("/home", isAdmin, (req, res) => {
    res.render("admin/home", {
        viewTitle: "Admin Dashboard",
        layout: false
    });
});

// --- Admin Login ---
router.get("/login", (req, res) => {
    res.render("admin/alogin", { layout: false });
});

router.post("/login", (req, res) => {
    const { adminid, password } = req.body;
    if (adminid == 9999 && password === "pass") {
        req.session.loggedIn = true;
        req.session.userType = "admin";
        res.redirect("/admin/home");
    } else {
        res.status(401).send("Invalid admin credentials");
    }
});

// --- Admin Logout ---
router.get("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) console.error("Logout error:", err);
        res.redirect("/admin/login");
    });
});

// --- Admin About Page ---
router.get("/home/about", isAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, "about.html"));
});

// --- Form Routes (Add, Edit, List, Delete) ---
Object.keys(models).forEach((key) => {
    // Add form
    router.get(`/home/add${key}`, isAdmin, (req, res) => {
        res.render(`admin/${key}`, { viewTitle: `Add ${capitalize(key)}` });
    });

    // Update form
    router.get(`/home/${key}update/:id`, isAdmin, async (req, res) => {
        const doc = await models[key].findById(req.params.id).lean();
        res.render(`admin/${key}`, {
            viewTitle: `Update ${capitalize(key)}`,
            [key]: doc
        });
    });

    // List view
    router.get(`/home/${key}list`, isAdmin, async (req, res) => {
        const list = await models[key].find({}).lean();
        res.render(`admin/${key}list`, { list });
    });

    // Delete
    router.get(`/home/${key}delete/:id`, isAdmin, async (req, res) => {
        await models[key].findByIdAndRemove(req.params.id);
        res.redirect(`/admin/home/${key}list`);
    });
});

// --- POST Submissions (Create or Update) ---
router.post('/tenantsub', async (req, res) => await handleSubmit('tenant', req, res));
router.post('/propertysub', async (req, res) => await handleSubmit('property', req, res));
router.post('/loansub', async (req, res) => await handleSubmit('loan', req, res));
router.post('/testimonialsub', async (req, res) => await handleSubmit('testimonial', req, res));
router.post('/transactionsub', async (req, res) => await handleSubmit('transaction', req, res));
router.post('/cancellationsub', async (req, res) => await handleSubmit('cancellation', req, res));
router.post('/registrationsub', async (req, res) => await handleSubmit('registration', req, res));

// --- Helpers ---
async function handleSubmit(type, req, res) {
    const Model = models[type];
    const view = `admin/${type}`;
    const isUpdate = req.body._id && req.body._id.trim() !== '';

    try {
        if (isUpdate) {
            await Model.findByIdAndUpdate(req.body._id, req.body, { new: true });
        } else {
            const doc = new Model({ ...req.body });
            if (ids[type]) doc[`${type}id`] = ++ids[type];
            await doc.save();
        }
        res.redirect(`/admin/home/${type}list`);
    } catch (err) {
        if (err.name === 'ValidationError') {
            handleValidationError(err, req.body);
            res.render(view, {
                viewTitle: isUpdate ? `Update ${capitalize(type)}` : `Add ${capitalize(type)}`,
                [type]: req.body
            });
        } else {
            console.error(`Error saving ${type}:`, err);
            res.status(500).send("Server error");
        }
    }
}

function handleValidationError(err, body) {
    for (const field in err.errors) {
        body[field + "Error"] = err.errors[field].message;
    }
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// --- Email Setup (for future use, optional) ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'nandupanakanti@gmail.com',
        pass: process.env.EMAIL_PASS  // move password to .env
    }
});

module.exports = router;
