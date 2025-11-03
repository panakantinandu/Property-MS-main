// jshint esversion:6
require("dotenv").config({ path: "../.env" });

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Tenant = require("../models/tenant"); // Adjust path if needed

mongoose.connect("mongodb://127.0.0.1:27017/admin", {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log("MongoDB connected");
  return hashPasswords();
}).catch(err => {
  console.error("MongoDB connection error:", err);
});

async function hashPasswords() {
  try {
    const tenants = await Tenant.find();
    let updated = 0, skipped = 0;

    for (const tenant of tenants) {
      const pwd = tenant.tenantpassword;
      if (pwd && !pwd.startsWith("$2b$")) {
        const hashed = await bcrypt.hash(pwd, 10);
        tenant.tenantpassword = hashed;
        await tenant.save();
        updated++;
      } else {
        skipped++;
      }
    }

    console.log(`Hashed ${updated} tenants`);
    console.log(` Skipped ${skipped} already hashed`);
    mongoose.disconnect();
  } catch (err) {
    console.error("Error hashing passwords:", err);
  }
}
