# LeaseHub – Smart Property & Tenant Management Platform

## 1. Project Title

**LeaseHub – Smart Property & Tenant Management Platform**

A full-stack, production-oriented property management system providing separate tenant and admin experiences, built with Node.js, Express, MongoDB, and Stripe.

---

## 2. Problem Statement

Traditional lease and property management is fragmented and manual:
- Spreadsheets, paper contracts, and email threads lead to inconsistent data and human error.
- Tenant onboarding is slow, with no clear application status or centralized document flow.
- Rent tracking is manual, making it hard to see who is paid, overdue, or at risk.
- Payment reminders depend on people remembering to send emails or messages.
- There is little or no audit trail for critical actions such as approvals, cancellations, or refunds.

Existing rental apps often fall short because they:
- Rely on **manual tracking** of applications, deposits, and rents.
- Lack **automation** for recurring invoices, late fees, and notifications.
- Provide poor **tenant–admin transparency** on application status, invoices, and payments.
- Struggle with **payment delays** and limited payment options.
- Do not offer a reliable **audit trail** for compliance, support, and analytics.

LeaseHub is designed to address these gaps as a realistic SaaS-style backend and UI.

---

## 3. Solution Overview

LeaseHub provides an end-to-end workflow for managing properties, tenants, leases, and payments.

Key solution pillars:

- **Property discovery** – Tenants can browse available properties, view details, and understand availability before applying.
- **Lease application workflow** – Structured application process with status tracking (pending, approved, expired/cancelled).
- **Booking deposit system** – Securely capture booking deposits to reserve properties before full onboarding.
- **Automated monthly rent** – Monthly invoices are generated automatically via background jobs, reducing manual work.
- **Late fee handling** – Overdue invoices automatically accrue late fees based on business rules, with clear reporting.
- **Tenant notifications** – Email and in-app notifications keep tenants informed about invoices, payments, and maintenance.
- **Admin reporting** – Executive dashboards and reports help admins monitor occupancy, revenue, and risk in real time.

The result is a more reliable, auditable, and scalable rental management workflow suitable for real-world operations.

---

## 4. Key Features

### Tenant Features

- **Browse available properties** – View property catalog with availability and key details.
- **Apply for lease** – Submit structured applications through the tenant portal.
- **Pay booking deposit** – Reserve properties by paying booking deposits online.
- **Pay monthly rent via Stripe** – Securely pay recurring rent invoices using Stripe.
- **View invoices & payment history** – Transparent list of all invoices, payments, and outstanding balances.
- **Maintenance requests** – Submit and track maintenance tickets from the tenant portal.
- **Automated reminders** – Receive reminders for upcoming due dates, overdue rent, and important updates.

### Admin Features

- **Property management** – Create, update, and manage properties, units, and availability.
- **Application approvals** – Review and approve or reject tenant applications with proper status tracking.
- **Tenant assignment** – Link approved tenants to properties and activate leases.
- **Automated invoicing** – Generate monthly rent invoices and late fee entries via scheduled jobs.
- **Rent tracking** – Monitor who is current, overdue, and at risk, with an overdue rent view.
- **Late fee enforcement** – Apply and track late fees consistently across the portfolio.
- **Business reports dashboard** – Admin reports for occupancy, revenue, outstanding rent, deposits, and late fees.
- **Audit logs** – Capture critical admin actions for traceability and compliance.

---

## 5. Security Measures

LeaseHub is built with security best practices appropriate for a multi-tenant SaaS-style application.

- **Role-based access control**
  - Clear separation between **Admin** and **Tenant** roles.
  - Admin-only access to management and reporting endpoints.

- **JWT authentication**
  - JSON Web Tokens used to protect API routes and sessions.
  - Tokens signed with a strong secret and validated on each request.

- **Password hashing**
  - User passwords are never stored in plain text.
  - Strong hashing (e.g., bcrypt) is used before persistence.

- **Environment variable protection**
  - Secrets such as database URLs, JWT secrets, and Stripe keys are never hard-coded.
  - All sensitive configuration is loaded from environment variables.

- **Stripe secure payment flow**
  - Payments are processed via Stripe using server-side APIs and webhooks.
  - Card data never touches the LeaseHub servers; Stripe handles PCI-compliant processing.

- **No sensitive data stored in frontend**
  - Frontend templates receive only the data they need; secrets are not exposed.
  - JWTs and session identifiers are handled securely.

- **Audit logs for critical actions**
  - Critical events (e.g., approvals, cancellations, payment events) are logged for troubleshooting and compliance.

- **Protection against common risks**
  - **Unauthorized access** – Protected routes and role checks.
  - **Data tampering** – Validated requests and server-side checks for entity ownership.
  - **Payment fraud** – Server-side verification of Stripe events via webhook secrets and idempotent flows.

---

## 6. Tech Stack

- **Runtime:** Node.js (>=14)
- **Framework:** Express.js
- **Database:** MongoDB Atlas (cloud-hosted MongoDB)
- **Payments:** Stripe Payments (server-side integration + webhooks)
- **Templating:** Handlebars (HBS) for server-side rendered views
- **UI Framework:** Bootstrap 4 for responsive layouts
- **Authentication & Security:** JWT, bcrypt, helmet, express-rate-limit, express-mongo-sanitize, csurf
- **Real-time:** Socket.IO for notifications and live updates
- **Email:** Nodemailer for transactional emails

Repository layout (high level):
- **Root:** Shared configuration, background jobs, and scripts
- **`admin-app/`** – Admin console (Express + HBS)
- **`tenant-app/`** – Tenant portal (Express + HBS)
- **`shared/`** – Shared models, config, middleware, and services
- **`utils/`** – Cross-cutting utilities (JWT, ledger, PDFs, rent logic)
- **`jobs/`** – Cron-style jobs (monthly invoice generation, reminders, late fees)

---

## 7. Deployment

LeaseHub is designed to be deployed as a modern cloud-hosted Node.js application.

- **Source control:** GitHub (monorepo containing admin and tenant apps).
- **Application hosting:** Render (or similar Node.js hosting platform).
  - Admin and tenant apps can be deployed as separate services or a single process, depending on environment.
- **Database:** MongoDB Atlas for production-grade, managed MongoDB.
- **Process manager:** Platform process configuration (e.g., Render, Heroku-like `Procfile`).
- **Environment variables:** Managed through the deployment platform (Render dashboard, GitHub secrets, etc.).

Typical deployment flow:
1. Push changes to GitHub.
2. Render (or equivalent) pulls from the main branch and runs the install/start commands.
3. Environment variables are injected from the platform configuration.
4. Admin and tenant apps start and connect to MongoDB Atlas and Stripe.

---

## 8. Environment Variables

The following environment variables are required for a production-like setup (values are **not** committed to the repo):

- `MONGO_URI` – MongoDB connection string (MongoDB Atlas recommended).
- `JWT_SECRET` – Secret key used to sign and verify JWTs.
- `STRIPE_SECRET_KEY` – Secret API key for Stripe server-side calls.
- `STRIPE_WEBHOOK_SECRET` – Webhook signing secret for verifying Stripe events.
- `EMAIL_HOST` – SMTP host for transactional emails.
- `EMAIL_PORT` – SMTP port for transactional emails.
- `EMAIL_USER` – SMTP username.
- `EMAIL_PASS` – SMTP password.

Additional environment variables (depending on your setup) may include:

- `NODE_ENV` – `development` or `production`.
- `SESSION_SECRET` – Secret for Express sessions.
- `TENANT_URL` – Public URL of the tenant portal.
- `ADMIN_URL` – Public URL of the admin console.

---

## 9. How to Run Locally

### Prerequisites

- Node.js >= 14
- npm >= 6
- A MongoDB instance (local or MongoDB Atlas)
- A Stripe account and test keys

### Steps

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-username/leasehub.git
   cd leasehub
   ```

2. **Install dependencies (root + apps)**

   From the project root:

   ```bash
   npm run setup
   ```

   This installs dependencies in:
   - Root (shared packages, jobs, utilities)
   - `tenant-app/`
   - `admin-app/`

3. **Create and configure your `.env` file**

   In the project root, create a `.env` file (you can use `.env.example` as a reference if present) and set at least:

   ```bash
   MONGO_URI=your-mongodb-connection-string
   JWT_SECRET=some-strong-secret
   STRIPE_SECRET_KEY=your-stripe-secret-key
   STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret
   EMAIL_HOST=your-smtp-host
   EMAIL_PORT=your-smtp-port
   EMAIL_USER=your-smtp-user
   EMAIL_PASS=your-smtp-password
   NODE_ENV=development
   ```

4. **Run the apps in development mode**

   From the project root:

   ```bash
   npm run dev:all
   ```

   This will run both:
   - Tenant app (`tenant-app/app.js`)
   - Admin app (`admin-app/app.js`)

5. **Access the applications**

   Default ports may differ depending on configuration, but typically:
   - Tenant portal: `http://localhost:3000` (or configured tenant port)
   - Admin console: `http://localhost:3001` (or configured admin port)

   Check each app's `app.js` or configuration to confirm ports.

6. **Production-style start**

   To simulate a production-style run from the root:

   ```bash
   npm start
   ```

   Ensure `NODE_ENV=production` and all required environment variables are set.

---

## 10. Real-World Use Case

### For Landlords / Property Managers

- Centralize all properties, tenants, applications, and financials in one system.
- Automate monthly rent invoices and late fee calculations instead of relying on spreadsheets.
- Gain clear visibility into occupancy, delinquency, and revenue trends through the admin dashboard.
- Reduce disputes through a transparent history of invoices, payments, and audit logs.
- Improve operations with structured maintenance workflows and tenant communications.

### For Tenants

- Discover available properties and apply without visiting an office.
- Pay booking deposits and monthly rent online using secure Stripe payments.
- See a clear, time-stamped history of invoices, payments, and outstanding balances.
- Receive automated reminders for due dates and important updates.
- Submit maintenance requests and track their resolution without phone calls or emails.

### Why This Is Better Than Traditional Systems

- Replaces manual, error-prone processes with automated, traceable workflows.
- Provides a unified view for admins and a self-service portal for tenants.
- Scales from small portfolios to larger multi-property operations.
- Designed with security, auditability, and real SaaS deployment patterns in mind.

---

## 11. Future Enhancements

Planned and potential extensions to LeaseHub include:

- **Mobile app** – Native or cross-platform mobile apps for tenants and admins.
- **Advanced analytics** – Portfolio analytics, churn prediction, and cohort-based reporting.
- **AI rent prediction** – Use historical data and market trends to suggest optimal rent pricing.
- **Multi-owner support** – Support multiple property owners with isolated reporting and permissions.
- **Third-party integrations** – Integrations with accounting tools, CRM systems, and marketing platforms.

---

## Repository & Structure Notes

This repository has been structured to look and behave like a real startup backend/monorepo:

- Clear separation between **tenant** and **admin** applications.
- Shared models, config, middleware, and services in the `shared/` directory.
- Background jobs for invoices, reminders, and late fees in `jobs/`.
- Utilities in `utils/` (JWT helpers, ledger service, PDF generator, rent logic, logging, notifications).
- Optional deep-dive documentation in files such as `TESTING-GUIDE.md` (manual QA flows) and `SECURITY-NOTES.md` (hardening details).

No extraneous runtime files or dead test/spec files are required for deployment, keeping the repository clean and recruiter-friendly while preserving all core functionality.