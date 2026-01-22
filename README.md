🚀 LeaseHub — Production-Ready Property Management SaaS

LeaseHub is a production-oriented, full-stack SaaS platform that automates the complete landlord–tenant lifecycle, including property listings, lease applications, booking deposits, recurring rent payments, late fees, cancellations, audit logs, and admin reporting.

This project is designed to demonstrate real-world software engineering, not just UI or CRUD operations.

🔗 Live AdminDemo: https://leasehub-admin.onrender.com
🔗 Live TenantDemo: https://leasehub-tenant.onrender.com

🔗 GitHub Repository: https://github.com/panakantinandu/Property-MS-main

🧠 Why LeaseHub?

Traditional property management relies on spreadsheets, manual reminders, and inconsistent payment tracking. This leads to:

Missed or late rent payments

Manual follow-ups by landlords

No audit trail for disputes

Poor transparency for tenants

LeaseHub solves these problems by enforcing structured workflows, automated billing, and secure payment handling — similar to real-world rental platforms.

✨ Key Capabilities
🏠 Lease & Property Management

Property listings with availability status

Tenant lease applications

Approval & reservation workflow

Automatic property release on expiry or cancellation

💳 Payments & Billing

Stripe Checkout integration

Booking deposit handling

Automated monthly rent invoices

Late fee enforcement

Webhook-verified payment updates

Ledger-based accounting model

⏱️ Automation

Cron-based invoice generation

Rent reminders before due date

Auto-cancellation on non-payment

Time-based application expiry

🔐 Security & Integrity

JWT-based authentication

Role-based access control (Admin / Tenant)

Password hashing with bcrypt

Secure environment variable handling

Full audit logs for sensitive actions

📊 Admin Insights

Property, tenant, and application reports

Outstanding dues & overdue tenants

Financial summaries (paid vs due)

🧪 Demo Credentials

Use the following credentials to explore the live demo:

Admin Login
Email: nan
Password: nan427

Tenant Login
Email: email@email.com
Password: email@098


⚠️ Payments use Stripe Test Mode — no real money is charged.

🛠️ Tech Stack
Frontend

Handlebars (HBS)

Bootstrap (responsive UI)

Backend

Node.js

Express.js

REST APIs

Database

MongoDB Atlas

Payments

Stripe Checkout

Stripe Webhooks

Security

JWT Authentication

RBAC

bcrypt

Deployment

Render (app hosting)

MongoDB Atlas (cloud DB)

🧱 System Design Highlights

LeaseHub is designed around real accounting and workflow principles:

Invoices represent what a tenant owes

Payments represent what a tenant paid

Ledger entries maintain financial traceability

Webhooks ensure payment integrity

Cron jobs enforce time-based business rules

This separation prevents data inconsistency and mirrors production financial systems.

📂 Project Structure
Property-MS-main/
├── app.js
├── controllers/
├── models/
├── routes/
├── middleware/
├── views/
├── public/
├── scripts/        # cron jobs & background tasks
├── README.md
├── LICENSE
├── CONTRIBUTING.md
└── .env.example

🚀 Local Setup
Prerequisites

Node.js (v16+)

MongoDB Atlas account

Stripe account

Installation
git clone https://github.com/panakantinandu/Property-MS-main.git
cd Property-MS-main
npm install
cp .env.example .env


Update .env with your own values:

MONGO_URI=
JWT_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
EMAIL_HOST=
EMAIL_PORT=
EMAIL_USER=
EMAIL_PASS=


Run the app:

npm start


App runs at: http://localhost:3000

👤 User Roles
Admin

Add & manage properties

Review applications

Track rent & dues

View reports & audit logs

Tenant

Browse available properties

Apply for lease

Pay deposit & monthly rent

View invoices & payment history

🔒 Security Considerations

No secrets committed to the repository

All sensitive keys managed via environment variables

Stripe handles card data (PCI compliant)

Audit logs provide accountability for admin actions

🧾 Commercial Usage & Licensing

This repository is source-available for learning and evaluation.

❌ Not Allowed Without Permission

Commercial use

Reselling or redistributing

Deploying for clients or organizations

✅ Allowed

Personal learning

Portfolio demonstration

Code review and study

If you want to:

Use LeaseHub commercially

Deploy it for clients

Build a SaaS on top of it

📧 Contact for a commercial license:
panakantinandu@gmail.com

See LICENSE for full terms.

🤝 Contributing

Contributions are welcome for:

Bug reports

Feature suggestions

Documentation improvements

Please read CONTRIBUTING.md
 before submitting changes.

🎯 Why This Project Matters (For Recruiters)

LeaseHub demonstrates:

Real SaaS thinking

Secure payment handling

Automation & background jobs

Clean separation of concerns

Production deployment experience

Business-driven system design

This is not a tutorial project — it is a realistic simulation of a production system.

📫 Contact

📧 Email: panakantinandu@gmail.com

🔗 LinkedIn: https://linkedin.com/in/nandu-panakanti-41839731a

🔗 Portfolio: https://nandu-portfolio-three.vercel.app

🔗 GitHub: https://github.com/panakantinandu
