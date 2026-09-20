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
      autoIndex: process.env.NODE_ENV !== 'production', // disable autoIndex in prod — build indexes offline
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 20,          // allow up to 20 concurrent connections (default is 5)
      minPoolSize: 5,           // keep 5 warm connections alive
      socketTimeoutMS: 45000,   // close sockets that are idle >45s
      connectTimeoutMS: 10000,  // fail fast on initial connect
      heartbeatFrequencyMS: 10000,
    });
    logger.info(`MongoDB Connected successfully: ${conn.connection.host} (DB: ${conn.connection.name})`);
  } catch (error) {
    logger.error(`MongoDB Connection Error: ${error.message}`);
    setTimeout(connectDB, 5000);
  }
};

module.exports = connectDB;
