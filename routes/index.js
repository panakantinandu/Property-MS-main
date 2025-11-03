// jshint esversion:6
const express = require("express");
const router = express.Router();
const Admin = require("../models/admin");
const Tenant = require("../models/tenant");
const bcrypt = require("bcrypt");

// Render combined login page
router.get("/", (req, res) => {
    res.render("login"); // This should show dropdown for tenant/admin
});

// Handle combined login logic
router.post("/login", async (req, res) => {
    const { userType, userid, password } = req.body;

    try {
        if (userType === "admin") {
            if (userid == 9999 && password === "pass") {
                req.session.loggedIn = true;
                req.session.userType = "admin";
                return res.redirect("/admin/home");
            } else {
                return res.status(401).send("Invalid admin credentials");
            }
        } else if (userType === "tenant") {
            const tenant = await Tenant.findOne({ tenantid: userid });
            if (!tenant) return res.status(404).send("Tenant not found");

            const match = await bcrypt.compare(password, tenant.tenantpassword);
            if (!match) return res.status(401).send("Invalid tenant credentials");

            req.session.loggedIn = true;
            req.session.userType = "tenant";
            req.session.tenantId = tenant.tenantid;
            req.session.tenantName = tenant.firstname || "Tenant";

            return res.redirect("/tenant/dashboard");
        } else {
            return res.status(400).send("Unknown user type");
        }
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).send("Internal server error");
    }
});

router.get('/about', (req, res) => {
    res.render('about', { layout: 'layout' }); // optional layout line if you're explicitly using it
});


module.exports = router;
