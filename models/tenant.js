//jshint esversion:6
const mongoose = require('mongoose');

let tenantSchema = mongoose.Schema({
    tenantid: {
        type: Number,
        required: true,
        unique: true
    },
    tenantpassword: {
        type: String,
        required: 'Password is required'
    },
    firstname: {
        type: String,
        required: 'First Name is required'
    },
    middlename: {
        type: String
    },
    lastname: {
        type: String,
        required: 'Last name is required'
    },
    email: {
        type: String,
        required: 'Email ID is required',
        validate: {
            validator: function (val) {
                const emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@(([^<>()[\]\\.,;:\s@"]+\.)+[^<>()[\]\\.,;:\s@"]{2,})$/i;
                return emailRegex.test(val);
            },
            message: 'Invalid e-mail.'
        }
    },
    dob: {
        type: Date,
        required: 'Birthdate is required'
    },
    phonenumber: {
        type: String,
        required: 'Phone number is required',
        minlength: 10,
        maxlength: 10,
        validate: {
            validator: function (val) {
                return /^\d{10}$/.test(val);
            },
            message: 'Phone number must be exactly 10 digits.'
        }
    },
    occupation: {
        type: String,
        required: 'Occupation is required'
    },
    annualincome: {
        type: Number,
        required: 'Annual Income is required'
    },
    address: {
        type: String,
        required: 'Address is required'
    }
});

let tenant = module.exports = mongoose.model('Tenant', tenantSchema, 'tenant');
