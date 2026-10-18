// Refuse to run against any host/database other than our disposable local container.
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/mobile_test') {
    throw new Error('Mobile integration tests require disposable 127.0.0.1:55432/mobile_test.');
}
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'mobile-integration-only-not-a-deployment-secret';
process.env.AGENT_JWT_SECRET = 'mobile-portal-integration-only-not-a-deployment-secret';
process.env.REDIS_HOST = '127.0.0.1';
process.env.REDIS_PORT = '56379';
