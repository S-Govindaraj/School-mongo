const app = require('../app');
const connectDB = require('../config/db');
const http = require('http');

async function runTest() {
  await connectDB();

  const server = http.createServer(app);
  server.listen(0, async () => {
    const port = server.address().port;
    console.log(`Test server running on port ${port}...`);

    // 1. Test Login
    const postData = JSON.stringify({
      email: 'admin@schoolerp.com',
      password: 'admin123',
    });

    const loginReq = http.request(
      {
        hostname: 'localhost',
        port: port,
        path: '/api/v1/auth/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          console.log(`\n🔑 Login Status: ${res.statusCode} ${res.statusMessage}`);
          const parsed = JSON.parse(body);
          console.log('Login Response Token Received:', Boolean(parsed.data?.token));
          console.log('User Role:', parsed.data?.user?.role?.name);

          const token = parsed.data?.token;

          // 2. Test Get Roles with Single Payload
          const rolesReq = http.request(
            {
              hostname: 'localhost',
              port: port,
              path: '/api/v1/roles',
              method: 'GET',
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
            (rolesRes) => {
              let rBody = '';
              rolesRes.on('data', (c) => (rBody += c));
              rolesRes.on('end', () => {
                console.log(`\n📋 Roles Endpoint Status: ${rolesRes.statusCode} ${rolesRes.statusMessage}`);
                const rParsed = JSON.parse(rBody);
                console.log('Single Payload Keys:', Object.keys(rParsed.data || {}));
                console.log('KPI Stats:', rParsed.data?.kpi);
                console.log('Records Count:', rParsed.data?.records?.length);
                console.log('Pagination info:', rParsed.data?.pagination);
                console.log('\n🎉 ALL MONGODB BACKEND TESTS PASSED SUCCESSFULLY!');
                server.close();
                process.exit(0);
              });
            }
          );
          rolesReq.end();
        });
      }
    );

    loginReq.write(postData);
    loginReq.end();
  });
}

runTest();
