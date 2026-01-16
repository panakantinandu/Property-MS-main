// fix-existing-lease-state.js
// One-off script to bring existing tenants in line with the
// new lease behaviour:
//   - If a booking_deposit invoice is already PAID, ensure
//     the related application is reserved, the property is
//     reserved & assigned to the tenant, and the tenant is
//     linked to that property/application.
//   - Ensure a first monthly_rent invoice exists for that
//     tenant + property (if not already present).
//
// Usage:
//   NODE_ENV=production MONGO_URI="..." node fix-existing-lease-state.js

const mongoose = require('mongoose');
require('dotenv').config();

const { Tenant, Property, Application, Invoice } = require('./shared/models');

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
    console.log('✅ Connected to MongoDB');

    // Find all PAID booking_deposit invoices.
    const depositInvoices = await Invoice.find({
      type: 'booking_deposit',
      status: 'paid',
      isDeleted: false,
    }).lean();

    console.log(`Found ${depositInvoices.length} paid booking_deposit invoice(s).`);

    let updatedApplications = 0;
    let updatedProperties = 0;
    let updatedTenants = 0;
    let createdRentInvoices = 0;

    for (const inv of depositInvoices) {
      const tenantId = inv.tenantId;
      const propertyId = inv.propertyId;

      if (!tenantId || !propertyId) {
        console.log(`⚠️ Skipping booking_deposit invoice ${inv._id} - missing tenantId or propertyId.`);
        continue;
      }

      const tenant = await Tenant.findById(tenantId);
      const property = await Property.findById(propertyId).lean();

      if (!tenant || !property) {
        console.log(`⚠️ Skipping invoice ${inv._id} - tenant or property not found.`);
        continue;
      }

      // 1) Application: move approved -> reserved (if needed).
      const application = await Application.findOne({
        tenantId,
        propertyId,
        isDeleted: false,
        $or: [
          { status: 'approved' },
          { status: 'reserved' },
        ],
      }).sort({ createdAt: -1 });

      if (application && application.status === 'approved') {
        application.status = 'reserved';
        await application.save();
        updatedApplications += 1;
        console.log(`📄 Reserved application ${application._id} for tenant ${tenantId}`);
      }

      // 2) Property: ensure reserved + tenant linkage.
      const propertyUpdate = {};
      if (property.status !== 'reserved') {
        propertyUpdate.status = 'reserved';
      }
      if (!property.tenantId || String(property.tenantId) !== String(tenantId)) {
        propertyUpdate.tenantId = tenantId;
      }

      if (Object.keys(propertyUpdate).length > 0) {
        await Property.updateOne({ _id: propertyId }, { $set: propertyUpdate }, { runValidators: false });
        updatedProperties += 1;
        console.log(`🏠 Updated property ${propertyId} to reserved for tenant ${tenantId}`);
      }

      // 3) Tenant: ensure propertyId + applicationId.
      let tenantChanged = false;
      if (!tenant.propertyId || String(tenant.propertyId) !== String(propertyId)) {
        tenant.propertyId = propertyId;
        tenantChanged = true;
      }
      if (application && (!tenant.applicationId || String(tenant.applicationId) !== String(application._id))) {
        tenant.applicationId = application._id;
        tenantChanged = true;
      }

      if (tenantChanged) {
        await tenant.save();
        updatedTenants += 1;
        console.log(`👤 Linked tenant ${tenant._id} to property ${propertyId}${application ? ` & application ${application._id}` : ''}`);
      }

      // 4) First monthly_rent invoice for this tenant + property.
      const existingRentInvoice = await Invoice.findOne({
        tenantId,
        propertyId,
        type: { $in: ['monthly_rent', 'rent'] },
        isDeleted: false,
      }).lean();

      if (!existingRentInvoice) {
        const now = new Date();
        const due = new Date(now);
        const rentDay = 5;
        if (now.getDate() > rentDay) {
          // Move to next month
          due.setMonth(due.getMonth() + 1);
        }
        due.setDate(rentDay);

        const monthStr = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}`;
        const rentAmount = Number(property.rent) || 0;
        const maintenanceCharges = Number(property.maintenanceFee || 0);
        const totalAmount = rentAmount + maintenanceCharges;

        if (!rentAmount && !totalAmount) {
          console.log(`⚠️ Skipping rent invoice creation for tenant ${tenantId} - property ${propertyId} has no rent set.`);
        } else {
          const rentInvoice = new Invoice({
            type: 'monthly_rent',
            tenantId,
            propertyId,
            month: monthStr,
            rentAmount,
            maintenanceCharges,
            waterCharges: 0,
            electricityCharges: 0,
            otherCharges: 0,
            totalAmount,
            dueDate: due,
            status: 'unpaid',
            paidAmount: 0,
            balance: totalAmount,
            isDeleted: false,
          });

          await rentInvoice.save();
          createdRentInvoices += 1;
          console.log(`💳 Created first monthly_rent invoice ${rentInvoice._id} for tenant ${tenantId}`);
        }
      }
    }

    console.log('\n✅ Migration complete. Summary:');
    console.log(`   Applications reserved: ${updatedApplications}`);
    console.log(`   Properties updated:    ${updatedProperties}`);
    console.log(`   Tenants linked:       ${updatedTenants}`);
    console.log(`   Rent invoices created:${createdRentInvoices}`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ fix-existing-lease-state error:', err);
    process.exit(1);
  }
}

main();
