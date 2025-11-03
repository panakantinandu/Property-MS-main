// jshint esversion:6
const express = require("express");
const router = express.Router();
const Property = require("../models/property");

// Middleware for tenant authentication
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.loggedIn) {
        return next();
    } else {
        res.redirect("/tenant/login/form");
    }
};

// --- GET: View all properties (tenant view)
router.get("/", isAuthenticated, async (req, res) => {
    try {
        const properties = await Property.find({});
        res.render("tenant/dashboard", {
            tenant: { name: req.session.tenantName },
            properties: properties
        });
    } catch (err) {
        console.error("Error fetching properties:", err);
        res.status(500).send("Server error");
    }
});

// --- GET: Register Property Form
router.get("/register", isAuthenticated, (req, res) => {
    res.render("tenant/propertyregistration", {
        tenantName: req.session.tenantName
    });
});

// --- POST: Submit new property
router.post("/register", isAuthenticated, async (req, res) => {
    try {
        const newProp = new Property({
            name: req.body.name,
            location: req.body.location,
            price: req.body.price
        });

        await newProp.save();
        res.redirect("/property");
    } catch (err) {
        console.error("Error saving property:", err);
        res.status(500).send("Could not register property.");
    }
});

// --- GET: Edit Property Form
router.get("/edit/:id", isAuthenticated, async (req, res) => {
    try {
        const prop = await Property.findById(req.params.id);
        if (!prop) return res.status(404).send("Property not found");

        res.render("tenant/editProperty", { property: prop });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading edit form");
    }
});

// --- POST: Submit property edits
router.post("/edit/:id", isAuthenticated, async (req, res) => {
    try {
        await Property.findByIdAndUpdate(req.params.id, {
            name: req.body.name,
            location: req.body.location,
            price: req.body.price
        });

        res.redirect("/property");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error updating property");
    }
});

// --- GET: Delete property
router.get("/delete/:id", isAuthenticated, async (req, res) => {
    try {
        await Property.findByIdAndDelete(req.params.id);
        res.redirect("/property");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error deleting property");
    }
});

module.exports = router;
