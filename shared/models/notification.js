const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userType: { type: String, enum: ['admin', 'tenant'], required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String }, // e.g. invoice_due, application_approved
  isRead: { type: Boolean, default: false },
  readAt: { type: Date },
  metadata: { type: Object },
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema, 'notifications');
