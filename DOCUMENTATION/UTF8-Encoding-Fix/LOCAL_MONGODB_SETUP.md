# Local MongoDB Setup & UTF-8 Fix

## What Changed

Your `.env` file has been updated to use **local MongoDB** instead of cloud:

**Before**:
```
MONGODB_URI=mongodb+srv://govindarajsundarg:...@localdevelopment.khwk8ft.mongodb.net/School_Management
```

**After**:
```
MONGODB_URI=mongodb://localhost:27017/School_Management
```

---

## How to Set Up Local MongoDB

### Option 1: Using Docker (Recommended)

If you have Docker installed:

```bash
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

Or with docker-compose:

**Create `docker-compose.yml` in project root:**

```yaml
version: '3.8'
services:
  mongodb:
    image: mongo:latest
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db
    environment:
      - MONGO_INITDB_DATABASE=School_Management

volumes:
  mongo-data:
```

Then run:
```bash
docker-compose up -d
```

### Option 2: Install MongoDB Locally

**Windows:**
1. Download from: https://www.mongodb.com/try/download/community
2. Run the installer
3. Choose "Install as a Service"
4. MongoDB will start automatically

**Mac:**
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Linux (Ubuntu):**
```bash
sudo apt-get install mongodb
sudo systemctl start mongodb
```

---

## Verify MongoDB is Running

### Check Status

**Windows (PowerShell):**
```powershell
Get-Process mongod
```

**Mac/Linux:**
```bash
ps aux | grep mongod
```

### Connect to MongoDB

```bash
mongosh
```

Or:
```bash
mongo
```

If you see a connection successful message, MongoDB is running! ✅

---

## Now Run the UTF-8 Fix

### Step 1: Make Sure MongoDB is Running

```bash
# Terminal 1: Start MongoDB (if not already running)
docker-compose up -d
# OR
mongod
# OR check MongoDB Service is running
```

### Step 2: Run the Fix Script

```bash
cd "c:\Users\Govindaraj\Downloads\New folder\School-mongo"
npm run fix:utf8
```

### Expected Output

```
========================================
  UTF-8 Encoding Cleanup Script
========================================

📍 Using MongoDB URI: mongodb://localhost:27017/School_Management

🔌 Connecting to MongoDB... (attempt 1/5)
✅ Connected to MongoDB

📦 Found 187 collections to scan

[1/187] 🔧 Fixing encoding in 'students'...
  ✓ Fixed: John Smith
  ✓ Fixed: Jane Doe
  Total fixed: 2/450

[2/187] 🔧 Fixing encoding in 'grades'...
  ✓ Fixed: First Standard
  Total fixed: 1/25

... continues ...

============================================================
✅ Encoding fix complete!
============================================================
📊 Collections scanned: 187
📝 Documents fixed: 1,247
============================================================
```

---

## Troubleshooting

### Error: "ECONNREFUSED"

**Solution**: MongoDB is not running

1. **With Docker:**
   ```bash
   docker-compose up -d
   ```

2. **Without Docker:**
   - Windows: Check Services (mongod should be running)
   - Mac: `brew services start mongodb-community`
   - Linux: `sudo systemctl start mongodb`

3. **Verify:**
   ```bash
   mongosh
   ```

### Error: "Cannot connect to localhost:27017"

**Solution**: MongoDB not installed or not started

1. Install MongoDB (see options above)
2. Make sure service is running
3. Check firewall isn't blocking port 27017

### Error: "Database not found"

**Solution**: This is OK - MongoDB will create it on first write

The script will create the database and collections as needed.

---

## After the Fix

### Step 1: Restart Backend

```bash
npm run dev
```

### Step 2: Refresh Frontend

- Hard refresh: **Ctrl+F5** (Windows) or **Cmd+Shift+R** (Mac)
- Clear browser cache

### Step 3: Verify

Check your tables for proper character display. All special characters should now display correctly!

---

## Using the Script with Any MongoDB

The updated script now:
- ✅ Tries the configured URI first
- ✅ Falls back to localhost if cloud fails
- ✅ Shows helpful error messages
- ✅ Provides troubleshooting tips

### To Use Cloud MongoDB Again

Just update `.env`:
```
MONGODB_URI=mongodb+srv://your-connection-string@cluster.mongodb.net/database
```

---

## Quick Checklist

- [ ] MongoDB installed and running
- [ ] `.env` file updated (✅ already done)
- [ ] Backend can connect to local MongoDB
- [ ] Run: `npm run fix:utf8`
- [ ] Fix completes successfully
- [ ] Restart backend: `npm run dev`
- [ ] Refresh browser and verify

---

## Need Help?

1. **Verify MongoDB is running:**
   ```bash
   mongosh
   ```

2. **Check `.env` file:**
   - Should have: `MONGODB_URI=mongodb://localhost:27017/School_Management`

3. **Try running the fix:**
   ```bash
   npm run fix:utf8
   ```

4. **Still not working?**
   - Reinstall MongoDB
   - Use Docker for easier setup
   - Check firewall isn't blocking port 27017

---

## Files Modified

- ✅ `.env` - Updated MONGODB_URI to local
- ✅ `src/scripts/fixUtf8Encoding.js` - Enhanced with retry logic and better error handling

---

**Status**: ✅ Ready to run the UTF-8 fix with local MongoDB
**Next Step**: `npm run fix:utf8`
