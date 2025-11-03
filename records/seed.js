const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MONGODB_URI = 'mongodb://localhost:27017/PropertyManagementPlatform';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

const Loan = require('../models/loan');
const Property = require('../models/property');
const Tenant = require('../models/tenant');
const Registration = require('../models/registration');
const Cancellation = require('../models/cancellation');
const Transaction = require('../models/transaction');
const Testimonial = require('../models/testimonial');

const filesToSeed = [
  { filename: 'loan.json', model: Loan },
  { filename: 'property.json', model: Property },
  { filename: 'tenant.json', model: Tenant },
  { filename: 'registration.json', model: Registration },
  { filename: 'cancellation.json', model: Cancellation },
  { filename: 'transaction.json', model: Transaction },
  { filename: 'testimonial.json', model: Testimonial }
];

async function seedFile(filename, Model) {
  const filePath = path.join(__dirname, filename);
  try {
    let data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    let idCounter = 6100;
    const cleanedData = data.map((doc) => {
      // Remove _id field with $oid
      delete doc._id;

      // Convert $date to JS Date
      for (const key in doc) {
        if (doc[key] && typeof doc[key] === 'object' && ('$date' in doc[key])) {
          doc[key] = new Date(doc[key]['$date']);
        }
      }

      // Auto-fill missing required fields for tenants
      if (Model.modelName === 'Tenant') {
        if (!doc.tenantid) doc.tenantid = ++idCounter;
        if (!doc.tenantpassword) doc.tenantpassword = `${doc.tenantid}`;
      }

      return doc;
    });

    await Model.insertMany(cleanedData);
    console.log(`✔ Seeded ${filename}`);
  } catch (err) {
    console.error(`✘ Error seeding ${filename}:`, err.message);
  }
}

async function seedAll() {
  console.log('Connected to MongoDB for seeding');
  for (const item of filesToSeed) {
    await seedFile(item.filename, item.model);
  }
  mongoose.connection.close();
  console.log('Seeding complete. MongoDB connection closed.');
}

seedAll();
