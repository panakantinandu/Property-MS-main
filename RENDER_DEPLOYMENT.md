# Render Deployment Guide

## 🚨 TROUBLESHOOTING OTP EMAIL ISSUES

### Quick Diagnostics:

1. **Check Health Endpoint:**
   ```
   https://your-app.onrender.com/health
   ```
   Should show:
   ```json
   {
     "status": "ok",
     "smtp": {
       "configured": true,
       "host": "smtp.gmail.com"
     }
   }
   ```

2. **Check Render Logs** (Most Important):
   - Go to your Render dashboard
   - Click on your service
   - Click "Logs" tab
   - Look for:
     - `[OTP] Sending OTP to...` - Request received
     - `[OTP] Email sent successfully` - Success!
     - `[OTP] Failed to send email` - Check error message
     - `SMTP server is ready` - On startup (good sign)
     - `SMTP configuration error` - Bad credentials

### Common Issues & Solutions:

#### Issue 1: "Loading forever but no email"
**Cause:** SMTP connection timeout or wrong credentials

**Solution:**
1. Check Render environment variables are set correctly
2. Gmail App Password must be 16 characters (no spaces)
3. Verify on Render dashboard: Settings → Environment → Check SMTP_PASS
4. Try regenerating Gmail App Password

#### Issue 2: "SMTP configuration error" in logs
**Cause:** Wrong Gmail credentials

**Solution:**
1. Enable 2FA on your Gmail account
2. Generate new App Password: https://myaccount.google.com/apppasswords
3. Update SMTP_PASS in Render with the NEW 16-character password (NO SPACES)
4. Redeploy

#### Issue 3: Email takes 15+ seconds
**Cause:** Gmail's SMTP is slow from cloud IPs

**Solution:** Switch to SendGrid (much faster)

## Email Performance Optimization

### Issues Fixed:
1. **Connection Pooling** - Now reuses SMTP connections instead of creating new ones
2. **Timeout Settings** - Added 20-second timeout to prevent indefinite hangs
3. **Connection Limits** - Configured proper rate limits and connection management

### Render Environment Variables (Required):

```env
# MongoDB
MONGO_URI=your_mongodb_connection_string

# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
EMAIL_FROM=your_email@gmail.com

# App URLs (Update with your Render URLs)
TENANT_URL=https://your-tenant-app.onrender.com
ADMIN_URL=https://your-admin-app.onrender.com
BASE_URL=https://your-admin-app.onrender.com

# Session
SESSION_SECRET=your_strong_random_secret

# Node Environment
NODE_ENV=production
```

### Alternative Email Solutions for Faster Delivery:

If Gmail SMTP is still slow, consider these alternatives:

#### 1. **SendGrid** (Recommended - Free 100 emails/day)
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your_sendgrid_api_key
```

#### 2. **Mailgun** (Free 5,000 emails/month)
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@your-domain.mailgun.org
SMTP_PASS=your_mailgun_password
```

#### 3. **AWS SES** (Very fast, $0.10 per 1000 emails)
```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=your_ses_access_key
SMTP_PASS=your_ses_secret_key
```

### Troubleshooting Slow OTPs:

1. **Check Render Logs:**
   - Look for "SMTP server is ready" message on startup
   - Check for timeout errors in logs
   - Verify email send duration

2. **Gmail Specific Issues:**
   - Gmail might rate-limit if sending too many emails
   - Ensure "Less secure app access" is enabled (or use App Password)
   - Gmail can be slow from cloud providers' IPs

3. **Network Issues:**
   - Render's outbound connections might be slower to Gmail
   - Consider using SendGrid or Mailgun (designed for transactional emails)

4. **Cold Start (Free Tier):**
   - Free Render instances sleep after inactivity
   - First request after sleep takes 30-60 seconds to wake up
   - Upgrade to paid tier for always-on instances

### Testing Email Speed:

Add this to your tenant controller to log timing:
```javascript
console.time('OTP Email Send');
await notifyService.sendMail({...});
console.timeEnd('OTP Email Send');
```

### Recommended: Switch to SendGrid

1. Sign up at https://sendgrid.com
2. Create an API key
3. Update Render environment variables:
   ```
   SMTP_HOST=smtp.sendgrid.net
   SMTP_PORT=587
   SMTP_USER=apikey
   SMTP_PASS=your_sendgrid_api_key
   ```
4. SendGrid typically delivers in 1-3 seconds vs Gmail's 5-15 seconds

### Performance Comparison:
- **Gmail SMTP**: 5-15 seconds (can be slower from cloud)
- **SendGrid**: 1-3 seconds
- **Mailgun**: 1-3 seconds
- **AWS SES**: 1-2 seconds
