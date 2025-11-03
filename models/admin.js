//jshint esversion:6
const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
    adminid: {
        type: Number,
        required: [true, 'Admin ID is required']
    },
    adminpassword: {
        type: String,
        required: [true, 'Admin password is required']
    }
    // Uncomment below if needed in the future
    // firstname: {
    //     type: String,
    //     required: true
    // },
    // middlename: String,
    // lastname: {
    //     type: String,
    //     required: true
    // },
    // email: {
    //     type: String,
    //     required: true
    // },
    // phonenumber: {
    //     type: String,
    //     required: true,
    //     minlength: 10,
    //     maxlength: 10
    // },
    // address: String
});

module.exports = mongoose.model('Admin', adminSchema, 'admin');
