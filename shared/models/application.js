const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
    // Application Details
    applicantName: { type: String, required: true },
    applicantEmail: { type: String, required: true },
    phone: { type: String, required: true },
    monthlyIncome: { type: Number, required: true },
    occupation: { type: String, required: true },
    occupants: { type: Number, required: true, default: 1 },
    leaseDuration: { type: Number, required: true }, // in months
    // Preferred move-in date (business field: preferredMoveInDate)
    preferredMoveIn: { type: Date, required: true },
    
    // Status and References
    status: { 
        type: String, 
        default: 'pending', 
        enum: ['pending', 'approved', 'reserved', 'cancelled', 'expired', 'rejected', 'withdrawn'] 
    },
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' }, // Set after approval
    
    // Admin Actions
    adminComments: { type: String },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    reviewedAt: { type: Date },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    approvedAt: { type: Date },

    // Booking deposit expiry (set when application is approved)
    expiresAt: { type: Date },
    
    // Metadata
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

// Virtual alias so business logic can use `preferredMoveInDate`
applicationSchema.virtual('preferredMoveInDate')
    .get(function () {
        return this.preferredMoveIn;
    })
    .set(function (val) {
        this.preferredMoveIn = val;
    });

module.exports = mongoose.model('Application', applicationSchema, 'applications');
