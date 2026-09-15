const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class LocalStorageProvider {
  constructor(uploadDir) {
    this.uploadDir = uploadDir || path.join(__dirname, '../../../uploads');
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadFile({ buffer, fileName, mimeType, schoolId }) {
    const schoolDir = path.join(this.uploadDir, schoolId.toString());
    if (!fs.existsSync(schoolDir)) {
      fs.mkdirSync(schoolDir, { recursive: true });
    }

    const fileExt = path.extname(fileName) || '';
    const uniqueKey = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${fileExt}`;
    const filePath = path.join(schoolDir, uniqueKey);

    await fs.promises.writeFile(filePath, buffer);
    const checksum = crypto.createHash('md5').update(buffer).digest('hex');

    return {
      storageKey: path.join(schoolId.toString(), uniqueKey),
      storageProvider: 'LOCAL',
      size: buffer.length,
      checksum,
      filePath,
    };
  }

  async deleteFile(storageKey) {
    const fullPath = path.join(this.uploadDir, storageKey);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
      return true;
    }
    return false;
  }

  getFilePath(storageKey) {
    return path.join(this.uploadDir, storageKey);
  }
}

module.exports = new LocalStorageProvider();
