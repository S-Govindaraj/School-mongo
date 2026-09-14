const mongoose = require('mongoose');
const dns = require('dns');
const logger = require('./logger');

// Set DNS servers for SRV record resolution
if (process.env.MONGODB_DNS_SERVERS) {
  const dnsServers = process.env.MONGODB_DNS_SERVERS.split(',').map((s) => s.trim());
  dns.setServers(dnsServers);
} else {
  try {
    dns.setServers(['8.8.8.8', '8.8.4.4']);
  } catch (err) {
    // Ignore if custom DNS fails
  }
}

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      autoIndex: true,
      serverSelectionTimeoutMS: 5000,
    });
    logger.info(`MongoDB Connected successfully: ${conn.connection.host} (DB: ${conn.connection.name})`);
  } catch (error) {
    logger.error(`MongoDB Connection Error: ${error.message}`);
    // Do not hard exit immediately; retry in background
    setTimeout(connectDB, 5000);
  }
};

module.exports = connectDB;
