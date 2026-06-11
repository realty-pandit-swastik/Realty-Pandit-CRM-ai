const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

(async () => {
  try {
    const phone = '+919958860411'; // Normalized E.164 format
    const password = 'noteplz@123';
    const hashedPassword = await bcrypt.hash(password, 10);

    // First, ensure tenant exists
    let tenant = await prisma.tenant.findFirst();

    if (!tenant) {
      console.log('Creating default tenant...');
      tenant = await prisma.tenant.create({
        data: {
          business_name: 'Realty Pandit',
          owner_name: 'Admin',
          primary_phone: phone,
          email: 'admin@realtypandit.com',
        }
      });
      console.log('Tenant created:', tenant.id);
    }

    // Check if agent already exists
    const existing = await prisma.agent.findFirst({
      where: { phone }
    });

    if (existing) {
      console.log('Agent already exists. Updating password...');
      await prisma.agent.update({
        where: { phone },
        data: { password_hash: hashedPassword }
      });
      console.log('Password updated!');
    } else {
      console.log('Creating new agent...');
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
      console.log('Agent created successfully!');
      console.log({
        phone: agent.phone,
        name: agent.name,
        role: agent.role,
        email: agent.email
      });
    }

    console.log('\n✅ You can now login with:');
    console.log('   Phone:', '9958860411');
    console.log('   Password: noteplz@123');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
})();
