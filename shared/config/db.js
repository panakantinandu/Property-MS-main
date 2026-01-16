// shared/config/db.js
const mongoose = require('mongoose');
require('dotenv').config();

// Harden Mongoose against query selector injection (e.g. { "$gt": "" })
mongoose.set('sanitizeFilter', true);
// Keep query parsing strict/predictable
mongoose.set('strictQuery', true);

const connect = async () => {
    try {
        const mongoUri = process.env.MONGO_URI;
        
        if (!mongoUri) {
            throw new Error('MONGO_URI is not defined in environment variables');
        }

        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log('MongoDB Connected Successfully to:', mongoUri.split('@')[1]);
        return mongoose.connection;
    } catch (err) {
        console.error('MongoDB Connection Error:', err.message);
        process.exit(1);
    }
};

module.exports = { connect, mongoose };
