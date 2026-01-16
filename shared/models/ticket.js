const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, enum: ['plumbing', 'electrical', 'appliance', 'structural', 'other'], default: 'other' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    status: { type: String, default: 'open', enum: ['open', 'in-progress', 'resolved', 'closed'] },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    resolutionNotes: { type: String },
    resolvedAt: { type: Date },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Ticket', ticketSchema, 'tickets');
