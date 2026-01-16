// jobs/generateMonthlyRentInvoices.js
// Run this script on the 1st of every month (via OS cron/task scheduler).
// It generates monthly_rent invoices for all occupied properties with tenants.

const mongoose = require('mongoose');
require('dotenv').config();

const { Tenant, Property, Invoice } = require('../shared/models');

async function main() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI is not defined');
    }

    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✓ Connected to MongoDB');

    const now = new Date();
    const isFirstOfMonth = now.getDate() === 1;
    if (!isFirstOfMonth) {
      console.log('Today is not the 1st of the month. No invoices generated.');
      await mongoose.connection.close();
      return;
    }

    const year = now.getFullYear();
    const monthIndex = now.getMonth(); // 0-based
    const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

    // Rent is due on the 5th of the current month
    const dueDate = new Date(year, monthIndex, 5, 0, 0, 0, 0);

    const properties = await Property.find({
      status: 'occupied',
      isDeleted: false,
      tenantId: { $ne: null },
    }).populate('tenantId').lean();

    if (!properties.length) {
      console.log('No occupied properties found. Nothing to do.');
      await mongoose.connection.close();
      return;
    }

    console.log(`Found ${properties.length} occupied property(s). Generating invoices for month ${monthKey}...`);

    let createdCount = 0;

    for (const prop of properties) {
      const tenantId = prop.tenantId && prop.tenantId._id;
      if (!tenantId) {
        console.log(`Skipping property ${prop._id} (${prop.propertyname}) - no tenantId attached.`);
        continue;
      }

      // Check if an invoice already exists for this tenant/property/month
      const existing = await Invoice.findOne({
        tenantId,
        propertyId: prop._id,
        month: monthKey,
        type: 'monthly_rent',
        isDeleted: false,
      }).lean();

      if (existing) {
        console.log(`Invoice already exists for tenant ${tenantId} / property ${prop._id} for ${monthKey}, skipping.`);
        continue;
      }

      const rentAmount = Number(prop.rent) || 0;
      if (!rentAmount || rentAmount <= 0) {
        console.log(`Skipping property ${prop._id} (${prop.propertyname}) - invalid rent amount.`);
        continue;
      }

      const totalAmount = rentAmount;

      const invoice = new Invoice({
        type: 'monthly_rent',
        tenantId,
        propertyId: prop._id,
        month: monthKey,
        rentAmount,
        maintenanceCharges: 0,
        waterCharges: 0,
        electricityCharges: 0,
        otherCharges: 0,
        totalAmount,
        dueDate,
        status: 'unpaid',
        paidAmount: 0,
        balance: totalAmount,
        lateFeesAccrued: 0,
        isDeleted: false,
      });

      await invoice.save();
      createdCount += 1;
      console.log(`✓ Created monthly_rent invoice ${invoice._id} for tenant ${tenantId} / property ${prop.propertyname} | Amount: $${totalAmount}`);
    }

    console.log(`\nDone. Created ${createdCount} monthly_rent invoice(s) for ${monthKey}.`);
    await mongoose.connection.close();
  } catch (err) {
    console.error('✗ Error in generateMonthlyRentInvoices:', err);
    process.exit(1);
  }
}

main();
