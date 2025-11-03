const Property = require('../models/property');

exports.registerProperty = async (req, res) => {
    const { _id, title, description, price } = req.body;

    try {
        if (!req.session.tenantId) {
            return res.status(403).send('You must be logged in as a tenant');
        }

        if (_id && _id.trim() !== "") {
            // Update existing property
            await Property.findByIdAndUpdate(_id, {
                title,
                description,
                price,
                tenant: req.session.tenantId
            });
            console.log("Property updated:", _id);
        } else {
            // Create new property
            const newProperty = new Property({
                title,
                description,
                price,
                tenant: req.session.tenantId
            });
            await newProperty.save();
            console.log("New property created:", newProperty);
        }

        res.redirect('/tenant/dashboard');
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
};
