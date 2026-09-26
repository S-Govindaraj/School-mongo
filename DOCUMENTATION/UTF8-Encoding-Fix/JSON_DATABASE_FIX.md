# JSON Database File UTF-8 Fix

## What Changed

The script now works with **direct JSON database files** instead of requiring MongoDB connection.

No database connection code needed!

---

## How It Works

The script will:
1. Read JSON database files from your database directory
2. Fix corrupted UTF-8 characters in each file
3. Write the fixed data back to the files

---

## Setup

### Step 1: Locate Your Database Files

Your database files should be `.json` files. They can be in one of these locations:

**Default location:**
```
School-mongo/data/*.json
```

**Custom location:**
Set the `DB_DIR` environment variable in your `.env`:

```
DB_DIR=/path/to/your/database/files
```

### Step 2: Run the Fix

```bash
cd "c:\Users\Govindaraj\Downloads\New folder\School-mongo"
npm run fix:utf8
```

---

## Expected Output

```
========================================
  UTF-8 Encoding Cleanup Script
  (Direct Database File Processing)
========================================

📁 Database directory: c:\Users\Govindaraj\Downloads\New folder\School-mongo\data

📦 Found 15 database file(s)

[1/15] ==================================================
🔧 Processing: students.json
  ✓ Fixed 2/450 records

[2/15] ==================================================
🔧 Processing: grades.json
  ✓ Fixed 1/25 records

... continues for all files ...

============================================================
✅ Encoding fix complete!
============================================================
📊 Database files processed: 15
📝 Total records fixed: 1,247
============================================================
```

---

## Supported File Format

The script works with **JSON array files**:

```json
[
  {
    "name": "First Standard â€" Section A",
    "code": "GRD1A",
    "category": "Primary"
  },
  {
    "name": "Secondâ€™ Grade",
    "code": "GRD2",
    "category": "Primary"
  }
]
```

Each file should be an array of objects.

---

## What Gets Fixed

| Before | After |
|--------|-------|
| `â€–` | `–` (en-dash) |
| `â€"` | `—` (em-dash) |
| `â€œ` | `"` (quotes) |
| `â€™` | `'` (apostrophe) |
| `Ã©` | `é` (accented letters) |
| **+ 15 more patterns** | |

All corrupted UTF-8 characters are fixed.

---

## File Structure

The script looks for JSON files in:

```
Project Root
└── data/                    ← Database files directory
    ├── students.json
    ├── grades.json
    ├── sections.json
    ├── subjects.json
    ├── staff.json
    └── ... other .json files
```

---

## Troubleshooting

### Error: "No JSON database files found"

**Solution**: Check your database files location

1. **Verify files exist:**
   ```bash
   ls data/
   # Or on Windows:
   dir data
   ```

2. **Set custom directory in `.env`:**
   ```
   DB_DIR=c:\path\to\your\database\files
   ```

3. **Or move files to:**
   ```
   School-mongo/data/
   ```

### Error: "Not valid JSON"

**Solution**: Check file format

- File must be valid JSON
- Should be an array: `[{...}, {...}]`
- Not an object: `{...}`

### Some files skipped?

This is normal. The script skips:
- Files that aren't valid JSON
- Files that aren't arrays
- Empty files

---

## After the Fix

The fixed JSON files are automatically saved back.

You can then:
1. Import the files into MongoDB
2. Use them directly in your application
3. Back them up for safety

---

## Features

✅ **No database connection needed**
✅ **Works with JSON files directly**
✅ **Preserves file structure**
✅ **Fixes all corrupted characters**
✅ **Safe and non-destructive**
✅ **Shows progress**
✅ **Easy to run**

---

## Quick Start

1. **Verify database files exist in:**
   ```
   School-mongo/data/
   ```

2. **Run the fix:**
   ```bash
   npm run fix:utf8
   ```

3. **Check output** for fixed records

4. **Done!** Files are updated ✅

---

## Command Reference

```bash
# Run the UTF-8 fix
npm run fix:utf8

# With custom database directory
DB_DIR=/path/to/files npm run fix:utf8
```

---

**That's it!** No MongoDB needed. ✅
