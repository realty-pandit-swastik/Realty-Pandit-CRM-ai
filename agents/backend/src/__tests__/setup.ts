import { vi } from 'vitest';

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
process.env.AGENT_JWT_SECRET = 'test-agent-jwt-secret-for-testing-only';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.PORT = '0'; // Random available port

// Mock Prisma
vi.mock('../db', () => ({
    default: {
        $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
        tenant: { findFirst: vi.fn(), count: vi.fn() },
        agent: { findUnique: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
        contact: { findUnique: vi.fn(), upsert: vi.fn(), count: vi.fn() },
        inventory: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), groupBy: vi.fn() },
        interaction: { create: vi.fn() },
        websiteLead: { create: vi.fn() },
        newsletterSubscriber: { upsert: vi.fn() },
        scheduledVisit: { create: vi.fn() },
        partnerAgent: { findUnique: vi.fn() },
        staffCall: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
        propertyCategory: { findMany: vi.fn(), findUnique: vi.fn() },
        propertySubCategory: { findMany: vi.fn(), findUnique: vi.fn() },
        propertyType: { findMany: vi.fn(), findUnique: vi.fn() },
    }
}));

// Mock auth middleware
const passthrough = (req: any, _res: any, next: any) => next();
vi.mock('../middleware/auth', () => ({
    authMiddleware: passthrough,
    requireRole: () => passthrough,
    authenticateAgent: passthrough,
    checkPermission: () => passthrough,
}));

// Mock audio_storage service
vi.mock('../services/audio_storage', () => ({
    default: {
        upload: vi.fn().mockResolvedValue({ url: 'https://example.com/audio.mp3', public_id: 'test' }),
        delete: vi.fn().mockResolvedValue(true),
    }
}));

// Mock logger to suppress output during tests
vi.mock('../utils/logger', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    }
}));
