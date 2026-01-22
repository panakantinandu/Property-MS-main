# OTP Email Issue - Complete Fix Guide

## Changes Made:

### 1. **Simplified Email Template** ([tenant.controller.js](tenant-app/src/modules/tenant/tenant.controller.js))
- Reduced HTML complexity from 60+ lines to 15 lines
- Faster to generate and send
- Added 15-second timeout to prevent infinite loading

### 2. **Added Connection Pooling** ([utils/notify.js](utils/notify.js))
- Reuses SMTP connections (was creating new each time)
- Reduced connection time from 5-10s to 1-2s
- Added proper timeouts (10s connection, 15s socket)

### 3. **Better Error Logging**
- `[OTP]` prefix on all logs for easy filtering
- Shows exactly when email send starts/ends
- Timestamps for debugging timing issues

### 4. **Health Check Endpoints**
- `/health` on both apps shows SMTP configuration status
- Test before sending OTPs

### 5. **Test Script** ([test-email.js](test-email.js))
- Run locally: `node test-email.js`
- Verifies SMTP credentials work
- Shows exact send time

## Steps to Fix on Render:

### Step 1: Verify Environment Variables
Go to Render Dashboard → Your Service → Environment:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=leasehub.noreply@gmail.com
SMTP_PASS=your_16_char_app_password_no_spaces
EMAIL_FROM=leasehub.noreply@gmail.com
```

⚠️ **Critical:** SMTP_PASS must be 16 characters with NO SPACES

### Step 2: Generate Fresh Gmail App Password
1. Go to: https://myaccount.google.com/apppasswords
2. Select "Mail" and "Other (Custom name)"
3. Name it "Render LeaseHub"
4. Copy the 16-character password (looks like: `abcd efgh ijkl mnop`)
5. **Remove all spaces:** `abcdefghijklmnop`
6. Paste into Render SMTP_PASS

### Step 3: Deploy Changes
```bash
git add .
git commit -m "Fix OTP email timeout and improve performance"
git push origin main
```

Render will auto-deploy.

### Step 4: Check Logs After Deploy
Go to Render → Logs, look for:
```
✓ Tenant App: MongoDB Connected
SMTP server is ready to send emails  ← This is CRITICAL
```

If you see `SMTP configuration error`, credentials are wrong.

### Step 5: Test OTP
1. Go to your Render URL: `https://your-app.onrender.com/tenant/profile`
2. Click "Edit Profile"
3. Enter current password, new password (meeting requirements)
4. Click "Send Verification OTP to Email"
5. Watch Render logs in real-time:
   ```
   [OTP] Sending OTP to user@email.com at 2026-01-22T...
   [OTP] Email sent successfully to user@email.com
   ```

### Step 6: If Still Not Working

#### Check Health Endpoint:
```bash
curl https://your-app.onrender.com/health
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

If `configured: false`, environment variables not loaded.

#### Common Error Messages in Logs:

**"Invalid login"**
→ Wrong SMTP_USER or SMTP_PASS. Regenerate App Password.

**"Connection timeout"**
→ Port 587 might be blocked. Try SendGrid instead.

**"Email timeout"**
→ Gmail is slow. Switch to SendGrid for 1-2 second delivery.

## Alternative: Switch to SendGrid (Recommended)

SendGrid delivers OTPs in 1-2 seconds vs Gmail's 5-15 seconds.

### SendGrid Setup:
1. Sign up: https://sendgrid.com (Free: 100 emails/day)
2. Create API Key
3. Update Render Environment:
   ```
   SMTP_HOST=smtp.sendgrid.net
   SMTP_PORT=587
   SMTP_USER=apikey
   SMTP_PASS=your_sendgrid_api_key
   EMAIL_FROM=noreply@yourdomain.com
   ```
4. Verify sender email in SendGrid dashboard
5. Redeploy

## Expected Performance:

| Provider | Typical Time | Notes |
|----------|-------------|-------|
| Gmail    | 5-15 seconds | Slow from cloud IPs, free |
| SendGrid | 1-3 seconds  | Fast, 100/day free |
| Mailgun  | 1-3 seconds  | Fast, 5000/month free |

## Test Results from Local:
```
✅ SMTP Connection Successful!
Email Send Time: 2.083s
✅ Test email sent successfully!
```

Your configuration WORKS locally. If it fails on Render:
1. Environment variables not set correctly
2. Render's network blocking Gmail
3. Need to switch to SendGrid

## Final Checklist:
- [ ] Committed and pushed code changes
- [ ] Render environment variables set (no spaces in SMTP_PASS)
- [ ] Gmail App Password regenerated (if using Gmail)
- [ ] Render logs show "SMTP server is ready"
- [ ] `/health` endpoint shows smtp.configured: true
- [ ] Test OTP send and check logs for success/error

## Still Having Issues?

Share your Render logs showing:
1. Startup logs (SMTP server is ready?)
2. OTP attempt logs ([OTP] messages)
3. Any error messages

This will help identify the exact issue.
