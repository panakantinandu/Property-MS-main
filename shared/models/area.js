const mongoose = require('mongoose');

const areaSchema = new mongoose.Schema({
    areaname: { type: String, required: true, unique: true },
    city: { type: String, required: true },
    state: { type: String },
    pincode: { type: String },
    description: { type: String },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Area', areaSchema, 'areas');
