const mongoose = require('mongoose');

const loanSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    amount: { type: Number, required: true },
    purpose: { type: String },
    status: { type: String, default: 'pending', enum: ['pending', 'approved', 'rejected', 'paid'] },
    approvedDate: { type: Date },
    dueDate: { type: Date },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Loan', loanSchema, 'loans');
