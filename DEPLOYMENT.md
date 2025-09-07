# Tourist Safety System - Deployment Guide

## 🚀 Render + Railway MongoDB Deployment

### Step 1: Get Railway MongoDB Connection String
1. Go to your Railway dashboard
2. Click "Connect" button (top-right)
3. Copy the connection string: `mongodb://<user>:<password>@containers-us-west-xx.railway.app:xxxxx`

### Step 2: Deploy to Render
1. Connect your GitHub repository to Render
2. Create a new Web Service
3. Use these settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Node Version**: 18.x

### Step 3: Environment Variables in Render
Add these environment variables in Render Dashboard → Settings → Environment Variables:

```
MONGO_URI=mongodb://<user>:<password>@containers-us-west-xx.railway.app:xxxxx
JWT_SECRET=your-super-secret-jwt-key-here
TWILIO_ACCOUNT_SID_OTP=your-twilio-account-sid-for-otp
TWILIO_AUTH_TOKEN_OTP=your-twilio-auth-token-for-otp
TWILIO_VERIFY_SERVICE_SID=your-twilio-verify-service-sid
TWILIO_ACCOUNT_SID_SOS=your-twilio-account-sid-for-sos
TWILIO_AUTH_TOKEN_SOS=your-twilio-auth-token-for-sos
PORT=10000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-admin-password
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
NODE_ENV=production
```

### Step 4: Code Changes Made
- ✅ Updated `server.js` to support both `MONGO_URI` and `MONGODB_URI`
- ✅ Added better connection logging with masked credentials
- ✅ Created `render.yaml` for automatic deployment configuration

### Step 5: Test Deployment
1. Push changes to GitHub
2. Render will auto-deploy
3. Check logs for "✅ MongoDB Connected"
4. Test your app at `https://yourapp.onrender.com`

### Features Available After Deployment
- User registration and authentication
- Phone verification with Twilio
- Interactive map with tourist spots and restricted areas
- SOS emergency alerts
- Document verification
- Admin dashboard

### Troubleshooting
- Check Render logs for connection errors
- Verify all environment variables are set
- Ensure Railway MongoDB allows external connections
- Test API endpoints: `/api/auth/register`, `/api/auth/login`
