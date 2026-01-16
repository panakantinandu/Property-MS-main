const mongoose = require('mongoose');

const testimonialSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
    name: { type: String, required: true },
    email: { type: String },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, required: true },
    isApproved: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Testimonial', testimonialSchema, 'testimonials');
