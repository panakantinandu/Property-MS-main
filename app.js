// jshint esversion:6
const express = require("express");
const bodyParser = require("body-parser");
const path = require('path');
const exphbs = require('express-handlebars');
const mongoose = require('mongoose');
const session = require('express-session');
require('dotenv').config();

const app = express();

// --- Middleware (MUST COME FIRST before routes that use req.body)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));

app.use(session({
    secret: 'yourSecretKey',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// --- View Engine Setup
app.engine('hbs', exphbs.engine({
    extname: '.hbs',
    defaultLayout: 'layout',
    layoutsDir: path.join(__dirname, 'views/layouts'),
    helpers: {
        eq: function (a, b) {
            return a === b;
        }
    }
}));
console.log("Layout dir:", path.join(__dirname, 'views/layouts'));

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// --- MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
    useUnifiedTopology: true,
    useNewUrlParser: true
}).then(() => console.log("MongoDatabase Connected Successfully"))
  .catch(err => console.error("MongoDB connection error:", err));

// --- Routes
const indexRoute = require('./routes/index');
const adminRoutes = require('./routes/admin');
const tenantRoutes = require('./routes/tenant');

app.use('/', indexRoute);
app.use('/admin', adminRoutes);
app.use('/tenant', tenantRoutes);

// --- Default Landing Page (combined login)
app.get('/', (req, res) => {
    res.render('login'); // Combined Admin + Tenant login form
});

// --- Start Server
app.listen(3000, () => {
    console.log("Server started on port 3000.");
});
