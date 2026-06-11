const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createAdmin() {
  const phone = '+919958860411';
  const password = 'noteplz@123';
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    // Find or create tenant
    let tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      console.log('Creating tenant...');
      tenant = await prisma.tenant.create({
        data: {
          name: 'Realty Pandit',
          settings: {},
          subscription_tier: 'ADVANCE_PRO'
        }
      });
    }

    // Check if agent exists
    const existing = await prisma.agent.findFirst({ where: { phone } });
    if (existing) {
      console.log('Agent already exists:', existing.name);
      await prisma.$disconnect();
      return;
    }

    // Create agent
    const agent = await prisma.agent.create({
      data: {
        tenant_id: tenant.id,
        phone: phone,
        name: 'Admin User',
        email: 'admin@realtypandit.com',
        role: 'super_boss',
        password_hash: hashedPassword
      }
    });

    console.log('✅ Admin created:', agent.name);
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

createAdmin();
