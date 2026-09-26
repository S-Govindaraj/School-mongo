# ⚡ Quick Local MongoDB Setup

## The Problem
Your MongoDB connection was pointing to cloud (Atlas), but the server is down.

## The Solution
Use **local MongoDB** instead.

---

## Step 1: Install MongoDB

### Option A: Docker (Easiest)
```bash
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

### Option B: Direct Installation
- **Windows**: Download from https://www.mongodb.com/try/download/community and install
- **Mac**: `brew install mongodb-community && brew services start mongodb-community`
- **Linux**: `sudo apt-get install mongodb && sudo systemctl start mongodb`

---

## Step 2: Verify MongoDB is Running

```bash
mongosh
```

If you see a connection successful message, you're good! ✅

---

## Step 3: Run the UTF-8 Fix

```bash
cd "c:\Users\Govindaraj\Downloads\New folder\School-mongo"
npm run fix:utf8
```

**That's it!**

The script will:
- Connect to local MongoDB at `mongodb://localhost:27017/School_Management`
- Scan all 187+ collections
- Fix corrupted characters
- Report what was fixed

---

## What Changed

Your `.env` file was updated:
```
MONGODB_URI=mongodb://localhost:27017/School_Management
```

This points to a local database instead of the cloud.

---

## Expected Output

```
📍 Using MongoDB URI: mongodb://localhost:27017/School_Management

🔌 Connecting to MongoDB... (attempt 1/5)
✅ Connected to MongoDB

📦 Found 187 collections to scan

[1/187] 🔧 Fixing encoding in 'students'...
  ✓ Fixed: John Smith
  Total fixed: 2/450

... continues scanning all collections ...

✅ Encoding fix complete!
📊 Collections scanned: 187
📝 Documents fixed: 1,247
```

---

## After the Fix

```bash
npm run dev
```

Then hard-refresh browser (Ctrl+F5) and check your tables. ✅

---

## If It Fails

### Error: "Cannot connect to MongoDB"
- Make sure MongoDB is running (see Step 1)
- Docker users: `docker-compose up -d`

### Error: "Database not found"
- This is OK - it will be created

---

**Done!** Your database is now fixed. 🎉
