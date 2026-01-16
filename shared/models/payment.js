const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
    amountPaid: { type: Number, required: true },
    paymentDate: { type: Date, default: Date.now },
    paymentMethod: { type: String, enum: ['cash', 'check', 'bank_transfer', 'upi', 'card', 'stripe'], default: 'cash' },
    transactionId: { type: String },
    stripePaymentIntentId: { type: String },
    status: { type: String, default: 'pending', enum: ['pending', 'approved', 'rejected'] },
    notes: { type: String },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema, 'payments');
