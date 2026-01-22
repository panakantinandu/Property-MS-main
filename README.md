# 🚀 LeaseHub — Production-Ready Property Management SaaS

**LeaseHub** is a **production-oriented, full-stack SaaS platform** that automates the complete landlord–tenant lifecycle — from property discovery and lease applications to secure payments, invoicing, cancellations, audit logs, and admin reporting.

This project is intentionally designed to reflect **real-world business logic, financial workflows, and scalability considerations**, not just CRUD functionality.

🔗 **Admin Portal (Live):** https://leasehub-admin.onrender.com  
🔗 **Tenant Portal (Live):** https://leasehub-tenant.onrender.com  
🔗 **GitHub Repository:** https://github.com/panakantinandu/Property-MS-main  

---

## 🧠 Why LeaseHub?

Traditional property management relies on spreadsheets, manual follow-ups, and fragmented tools, which leads to:

- Missed or delayed rent payments  
- Manual reminders and follow-ups by landlords  
- No reliable audit trail for disputes  
- Poor transparency for tenants  

**LeaseHub solves these problems** by enforcing system-driven workflows, automated billing, secure payments, and time-based rules — similar to modern SaaS platforms.

---

## ✨ Core Capabilities

### 🏠 Lease & Property Management
- Property listings with real-time availability status
- Tenant lease applications with expiry windows
- Admin approval and reservation workflow
- Automatic property release on cancellation or non-payment
- Lease state transitions (Applied → Approved → Reserved → Active → Cancelled)

### 💳 Payments & Billing
- Stripe Checkout integration (test mode)
- Booking deposit enforcement after approval
- Automated monthly rent invoice generation
- Late fee calculation after grace period
- Webhook-verified payment confirmation
- Ledger-based accounting model (Invoices ≠ Payments)

### ⏱️ Automation & Enforcement
- Cron-based monthly invoice creation
- Rent reminders before due date
- Auto-cancellation of applications on payment timeout
- Late fee accrual for overdue rent
- Time-based application expiry handling

### 🔐 Security & Reliability
- JWT-based authentication
- Role-based access control (Admin / Tenant)
- Password hashing using bcrypt
- Secure environment variable handling
- Audit logs for sensitive actions
- Stripe-hosted checkout (PCI compliant)

### 📧 Email & Notifications
- Password reset via **Resend.com** (SMTP-free, production-safe)
- OTP-based password recovery
- Automated system notifications for:
  - Application approval
  - Payment reminders
  - Cancellation warnings
  - Lease status changes

### 📊 Admin Insights
- Tenant, property, and application dashboards
- Outstanding dues and overdue tenants
- Financial summaries (Paid vs Due)
- Operational visibility for decision-making

---

## 🧪 Demo Credentials

Use the following credentials to explore the live demo:

### Admin
Email: nan
Password: nan427

### Tenant
Email: email@email.com
Password: Email@098


> ⚠️ **Payments run in Stripe Test Mode** — no real money is charged.

---

## 🛠️ Tech Stack

### Frontend
- Handlebars (HBS)
- Bootstrap

### Backend
- Node.js
- Express.js
- REST APIs

### Database
- MongoDB Atlas

### Payments
- Stripe Checkout
- Stripe Webhooks

### Email & Notifications
- Resend.com (HTTP-based email delivery)

### Security
- JWT Authentication
- Role-Based Access Control (RBAC)
- bcrypt password hashing

### Deployment
- Render (Admin & Tenant as separate services)
- MongoDB Atlas

---

## 🧱 System Design Highlights

LeaseHub follows **real financial and SaaS design principles**:

- **Invoices** represent amounts owed  
- **Payments** represent completed transactions  
- **Ledger entries** ensure accounting traceability  
- **Stripe webhooks** guarantee payment integrity  
- **Background jobs** enforce time-based rules  

This architecture mirrors real production billing systems and avoids data inconsistency.

---

## 📂 Project Structure

Property-MS-main/
├── app.js
├── controllers/
├── models/
├── routes/
├── middleware/
├── views/
├── public/
├── scripts/ # cron jobs & background tasks
├── README.md
├── LICENSE
├── CONTRIBUTING.md
└── .env.example


---

## 🚀 Local Setup

### Prerequisites
- Node.js (v16+)
- MongoDB Atlas account
- Stripe account
- Resend.com account (free tier supported)

### Installation

```bash
git clone https://github.com/panakantinandu/Property-MS-main.git
cd Property-MS-main
npm install
cp .env.example .env
Environment Variables
env
MONGO_URI=
JWT_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
EMAIL_FROM=LeaseHub <onboarding@resend.dev>
Run Locally
npm start
Server starts at:
http://localhost:3000
👤 User Roles
Admin
Add and manage properties

Review and approve lease applications

Track rent, dues, and payments

View reports and audit logs

Tenant
Browse available properties

Apply for leases

Pay booking deposits and monthly rent

View invoices and payment history

Reset password securely via email

🔒 Security Considerations
No secrets are committed to the repository

All credentials managed via environment variables

Stripe handles all card data (PCI compliant)

Resend avoids SMTP port issues on cloud hosting

Audit logs ensure accountability and traceability

🧾 Commercial Usage & Licensing
This project is source-available for learning and evaluation.

❌ Not Allowed Without Permission
Commercial use

Reselling or redistributing the code

Deploying for clients or organizations

✅ Allowed
Personal learning

Portfolio demonstration

Code review and study

📧 For commercial licensing:
panakantinandu@gmail.com

See LICENSE for full terms.

🤝 Contributing
Contributions are welcome for:

Bug reports

Feature suggestions

Documentation improvements

Please read CONTRIBUTING.md before submitting changes.

🎯 Why This Project Matters (For Recruiters)
LeaseHub demonstrates:

Real SaaS product thinking

Secure payment handling with Stripe

Background job automation

Clean separation of concerns

Cloud deployment experience

Business-driven system design

This is not a tutorial project — it is a realistic simulation of a production system.

📫 Contact
📧 Email: panakantinandu@gmail.com
🔗 LinkedIn: https://linkedin.com/in/nandu-panakanti-41839731a
🔗 Portfolio: https://nandu-portfolio-three.vercel.app
🔗 GitHub: https://github.com/panakantinandu

🏁 Final Note
LeaseHub is intentionally designed to reflect real-world constraints, workflows, and edge cases.
It serves as both a learning resource and proof of production-level engineering capability.
