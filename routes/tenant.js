// jshint esversion:6
const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const router = express.Router();

const tenant = require("../controllers/tenant.controller");
const Registration = require("../models/registration");
const Tenant = require("../models/tenant");

// Middleware: Require tenant login
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.loggedIn) {
        return next();
    }
    res.redirect("/tenant/login/form");
};

// --- AUTH ROUTES ---

// GET: Login form
router.get("/login/form", (req, res) => {
    const error = req.session.loginError;
    req.session.loginError = null;

    res.render("tenant/login", {
        layout: false,
        viewTitle: "Tenant Login",
        error
    });
});

// POST: Login
router.post("/login", async (req, res) => {
    const { tenantid, password } = req.body;

    try {
        const user = await Tenant.findOne({ tenantid });

        if (!user) {
            req.session.loginError = "Tenant not found.";
            return res.redirect("/tenant/login/form");
        }

        const match = await bcrypt.compare(password, user.tenantpassword);
        if (!match) {
            req.session.loginError = "Invalid credentials.";
            return res.redirect("/tenant/login/form");
        }

        // Store session info
        req.session.loggedIn = true;
        req.session.tenantId = user._id;
        req.session.tenantName = user.firstname || "Tenant";
        req.session.tenantEmail = user.email;

        res.redirect("/tenant/dashboard");
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).send("Server error");
    }
});

// GET: Logout
router.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error("Logout error:", err);
        res.redirect("/tenant/login/form");
    });
});

// --- TENANT DASHBOARD ---

router.get("/dashboard", isAuthenticated, async (req, res) => {
    try {
        const properties = await Registration.find({
            email: req.session.tenantEmail || ""
        }).lean();

        res.render("tenant/dashboard", {
            tenant: {
                name: req.session.tenantName || "Tenant"
            },
            properties
        });
    } catch (err) {
        console.error("Error loading dashboard:", err);
        res.status(500).send("Unable to load dashboard");
    }
});

// --- TENANT REGISTRATION ---

router.get("/register", tenant.register);
router.post("/regsub", tenant.regsub);

// --- PROPERTY REGISTRATION ---

router.get("/property-registration", isAuthenticated, (req, res) => {
    res.render("tenant/propertyregistration", {
        tenantName: req.session.tenantName
    });
});

router.post("/registrationsub", isAuthenticated, (req, res) => {
    const registration = new Registration({
        propertyId: req.body.number,
        propertyName: req.body.propertyName,
        address: req.body.address,
        mobile: req.body.mobile,
        alternateMobile: req.body.alternateMobile,
        email: req.body.email,
        description: req.body.description || '',
        registrationDate: Date.now(),
        registrationStatus: "Pending",
        annualIncome: req.body.annualIncome
    });

    registration.save((err) => {
        if (!err) {
            console.log("Saved registration to DB");
            res.redirect("/tenant/dashboard");
        } else {
            console.error("Error during record insertion:", err);
            res.status(500).send("Error saving registration details.");
        }
    });
});

module.exports = router;
