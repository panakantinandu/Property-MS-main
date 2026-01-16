const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId },
    userType: { type: String, enum: ['admin', 'tenant', 'applicant', 'system'] },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    changes: { type: Object },
    ipAddress: { type: String },
    userAgent: { type: String },
    timestamp: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', auditLogSchema, 'auditlogs');
