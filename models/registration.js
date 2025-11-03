//jshint esversion:6
const mongoose = require('mongoose');

let registrationSchema = mongoose.Schema({
    propertyId: {
        type: Number,
    },
    propertyName: {
        type: String,
    },
    address: {
        type: String,
    },
    mobile: {
        type: String,  // Ensure it's a string (or use an array if you want multiple numbers)
    },
    alternateMobile: {
        type: String,  // Store alternate mobile in a separate field
    },
    email: {
        type: String,
    },
    description: {
        type: String,
    },
    registrationDate: {
        type: Date,
        default: Date.now,
    },
    registrationStatus: {
        type: String,
        default: 'Pending',
    },
    annualIncome:{
        type: Number,
    },
});


let Registration = module.exports = mongoose.model('Registration', registrationSchema, 'registration');
