# 🔐 Tenant Profile Password Change - User Guide

## Overview

The tenant profile password change feature now includes:
- ✅ Real-time password validation
- ✅ Email-based OTP verification
- ✅ Real-time Socket.IO updates
- ✅ Strict password requirements
- ✅ User-friendly error messages

---

## Step-by-Step Guide

### Step 1: Access Profile Page
1. Log in to your tenant account
2. Click "Edit Profile" tab
3. Scroll to "Change Password (Optional)" section

### Step 2: Enter Current Password
1. Enter your **current password** in the first field
2. This verifies your identity before allowing password change

### Step 3: Enter New Password
1. Click in the "New Password" field
2. **Real-time requirements will appear** showing:
   - ✅ Length (8+ characters)
   - ✅ Uppercase letter (A-Z)
   - ✅ Lowercase letter (a-z)
   - ✅ Number (0-9)
   - ✅ Special character (!@#$%^&*)

3. Requirements will **turn green as you meet them**

### Step 4: Confirm Password
1. Enter the same password in "Confirm New Password"
2. You'll see "Passwords match" message when they match

### Step 5: Request OTP
1. Once all requirements are met, a **"Send Verification OTP to Email"** button appears
2. Click it to send OTP to your email address

### Step 6: Enter OTP
1. Check your email for the OTP code (6 digits)
2. Enter it in the **"Verification OTP"** field
3. Timer shows remaining time (10 minutes)

### Step 7: Submit
1. Click **"Update Profile"** to complete the change
2. Your password will be changed and you'll be redirected to profile

---

## Password Requirements

Your new password **MUST** have ALL of the following:

✅ **Length:** Minimum 8 characters  
✅ **Uppercase:** At least one A-Z  
✅ **Lowercase:** At least one a-z  
✅ **Number:** At least one 0-9  
✅ **Special Character:** At least one !@#$%^&*()_+-=[]{}|;:'",.<>?/~`  

### Examples:

❌ `password` - No uppercase, number, or special char  
❌ `Password123` - No special character  
❌ `Pass!` - Too short  
✅ `MyPassword123!` - All requirements met!  
✅ `Secure@Pass999` - All requirements met!  

---

## Email Verification Process

### What You'll Receive

When you click "Send OTP":

**Email Subject:** Password Change OTP - LeaseHub

**Email Contains:**
- Your 6-digit OTP code
- Validity time (10 minutes)
- Security notice
- What to do if you didn't request this

### Important:

⚠️ **Your OTP expires in 10 minutes**

⚠️ **Never share your OTP with anyone**

⚠️ **If you didn't request this, change your password immediately**

---

## Real-Time Validation Features

### Password Requirements Checker
As you type, the system shows:
- 🟢 Green ✅ - Requirement met
- 🔴 Red ❌ - Requirement not met

### Password Match Indicator
- Shows "Passwords match" in green when passwords are identical
- Shows error in red when passwords differ
- Updates as you type

### OTP Timer
- Shows countdown of remaining time (10 minutes)
- Automatically expires and clears field if time runs out
- You can request a new OTP if expired

---

## Error Messages & Solutions

### "Current password is incorrect"
- ❌ The password you entered doesn't match your current password
- ✅ Solution: Re-enter your current password carefully

### "Password must be 8+ characters with 1 uppercase, 1 lowercase, 1 number, and 1 special character"
- ❌ Your new password doesn't meet all requirements
- ✅ Solution: Check the requirements list - ensure all have green checkmarks

### "New passwords do not match"
- ❌ Your new password and confirmation don't match
- ✅ Solution: Re-enter the same password in both fields

### "Please enter the OTP sent to your email"
- ❌ You forgot to enter the OTP
- ✅ Solution: Check your email and enter the 6-digit code

### "Invalid OTP. Please try again."
- ❌ The OTP code is incorrect or has expired
- ✅ Solution: Check the code in your email, or request a new one

### "OTP has expired"
- ❌ More than 10 minutes have passed since OTP was sent
- ✅ Solution: Request a new OTP and enter the new code

---

## Real-Time Updates

The profile page now supports real-time updates:

🔄 **Real-time badge** shows your connection status (green = connected)

If your profile is updated from another location:
- You'll receive a notification
- Your session will remain active
- No interruption to your current session

---

## Security Notes

### Why Email Verification?
- ✅ Proves you have access to your registered email
- ✅ Prevents unauthorized password changes
- ✅ Matches industry-standard security practices
- ✅ Protects your account from hacking

### Your Password is:
- ✅ Hashed before storage (bcrypt)
- ✅ Never transmitted in plain text
- ✅ Only verified on server-side
- ✅ Subject to strict validation rules

### What We Track:
- 📋 Audit log of password changes
- 📋 Who changed it (email/ID)
- 📋 When it was changed
- 📋 All profile updates

---

## Troubleshooting

### OTP Email Not Received?
1. Check spam/junk folder
2. Wait up to 2 minutes (email systems may be slow)
3. Click "Send OTP" again to request a new one
4. Contact support if problem persists

### Can't See Requirements List?
1. Refresh your browser
2. Click in "New Password" field to activate
3. Start typing your new password

### "Send OTP" Button Not Appearing?
- You need to:
  - ✅ Enter your current password
  - ✅ Enter a new password that meets ALL requirements
  - ✅ Confirm the new password (matches exactly)

Once all three are done, button will appear!

### Form Won't Submit?
1. Ensure OTP is entered (6 digits)
2. Check that OTP hasn't expired
3. Verify passwords match
4. Try refreshing and starting over

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Send OTP | Tab to button, then Enter |
| Navigate fields | Tab key |
| Clear field | Ctrl+A, then Delete |

---

## Mobile Device Tips

✅ Works on all devices (phones, tablets, desktop)

✅ **Copy OTP:** On mobile, you can copy OTP from email and paste into form

✅ **Landscape mode:** May be easier to see requirements list

✅ **Patience:** Passwords take a moment to validate on mobile

---

## FAQ

**Q: How often can I change my password?**  
A: As often as you like! No restrictions.

**Q: What if I lose my email access?**  
A: Contact admin support - they can reset your password.

**Q: Can I skip the OTP?**  
A: No - OTP is required for security when changing passwords.

**Q: Does this log me out?**  
A: No - you'll stay logged in after changing password.

**Q: How long before OTP expires?**  
A: 10 minutes. After that, you need to request a new one.

**Q: Can someone else use my OTP?**  
A: No - it's only valid in your browser, for your account.

**Q: What if I enter wrong OTP?**  
A: You'll see an error. You can try again or request a new OTP.

---

## Still Need Help?

📧 Email: support@leasehub.local  
💬 Live Chat: Available in dashboard  
📞 Phone: Available during business hours  

---

**Last Updated:** January 22, 2026  
**Version:** 1.0.0
