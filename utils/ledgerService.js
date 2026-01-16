const Invoice = require('../shared/models/invoice');
const LedgerEntry = require('../shared/models/ledgerEntry');
const Payment = require('../shared/models/payment');
const Tenant = require('../shared/models/tenant');
const Property = require('../shared/models/property');
const AuditLog = require('../shared/models/auditLog');

/**
 * Create invoice and corresponding ledger entries (debit tenant wallet, credit rent income)
 */
async function createInvoice({ tenantId, propertyId, month, rentAmount, dueDate }) {
    const session = await Invoice.db.startSession();
    session.startTransaction();
    try {
        const invoice = await Invoice.create([{ tenantId, propertyId, month, rentAmount, lateFeeAmount: 0, totalAmount: rentAmount, dueDate, status: 'unpaid' }], { session });
        const inv = invoice[0];

        const narration = `Invoice ${inv._id} for ${month}`;
        await LedgerEntry.create([{ invoiceId: inv._id, debitAccount: 'Tenant Wallet', creditAccount: 'Rent Income', amount: rentAmount, narration }], { session });

        await AuditLog.create([{ action: 'CREATE', entity: 'Invoice', entityId: inv._id.toString(), newValue: inv.toObject() }], { session });

        await session.commitTransaction();
        session.endSession();
        return inv;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
}

/**
 * Record payment: creates payment record and ledger entries (debit Cash/Bank, credit Tenant Wallet)
 * Updates invoice status and total
 */
async function recordPayment({ tenantId, invoiceId, amountPaid, mode, reference, userId, ip }) {
    const session = await Invoice.db.startSession();
    session.startTransaction();
    try {
        const invoice = await Invoice.findById(invoiceId).session(session);
        if (!invoice) throw new Error('Invoice not found');

        const paymentArr = await Payment.create([{ tenantId, invoiceId, amountPaid, mode, reference }], { session });
        const payment = paymentArr[0];

        const acc = mode === 'cash' ? 'Cash' : 'Bank';
        const narration = `Payment ${payment._id} for Invoice ${invoiceId}`;
        await LedgerEntry.create([{ invoiceId, debitAccount: acc, creditAccount: 'Tenant Wallet', amount: amountPaid, narration }], { session });

        const payments = await Payment.aggregate([{ $match: { invoiceId: invoice._id } }, { $group: { _id: null, paid: { $sum: '$amountPaid' } } }]);
        const paid = (payments[0] && payments[0].paid) || 0;
        if (paid >= invoice.totalAmount) invoice.status = 'paid';
        else if (paid > 0) invoice.status = 'partial';
        await invoice.save({ session });

        await AuditLog.create([{ userId, action: 'CREATE', entity: 'Payment', entityId: payment._id.toString(), newValue: payment.toObject(), ip }, { userId, action: 'UPDATE', entity: 'Invoice', entityId: invoice._id.toString(), oldValue: {}, newValue: invoice.toObject(), ip }], { session });

        await session.commitTransaction();
        session.endSession();
        return { payment, invoice };
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
}

/**
 * Apply late fee to overdue invoices: increments lateFee and total, creates ledger entry
 */
async function applyLateFees({ feeAmount = 100 }) {
    const today = new Date();
    const overdue = await Invoice.find({
        dueDate: { $lt: today },
        $or: [
            { status: 'unpaid' },
            { status: 'partial' },
            { status: 'overdue' }
        ]
    });
    for (const inv of overdue) {
        const session = await Invoice.db.startSession();
        session.startTransaction();
        try {
            const prev = inv.toObject();
            inv.lateFeeAmount = (inv.lateFeeAmount || 0) + feeAmount;
            inv.totalAmount = (inv.totalAmount || 0) + feeAmount;
            inv.status = 'overdue';
            await inv.save({ session });

            const narration = `Late fee applied for invoice ${inv._id}`;
            await LedgerEntry.create([{ invoiceId: inv._id, debitAccount: 'Tenant Wallet', creditAccount: 'Late Fees Income', amount: feeAmount, narration }], { session });

            await AuditLog.create([{ action: 'UPDATE', entity: 'Invoice', entityId: inv._id.toString(), oldValue: prev, newValue: inv.toObject() }], { session });

            await session.commitTransaction();
            session.endSession();
        } catch (e) {
            await session.abortTransaction();
            session.endSession();
            console.error('Failed to apply late fee for invoice', inv._id, e);
        }
    }
    return overdue.length;
}

module.exports = { createInvoice, recordPayment, applyLateFees };
