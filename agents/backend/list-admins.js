const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listAdmins() {
  try {
    const admins = await prisma.agent.findMany({
      where: {
        role: 'super_boss',
        status: 'active'
      },
      select: {
        name: true,
        phone: true,
        email: true,
        role: true
      },
      orderBy: { name: 'asc' }
    });

    console.log('\n=== ALL ADMIN ACCOUNTS (super_boss role) ===\n');

    admins.forEach((admin, index) => {
      console.log(`${index + 1}. ${admin.name}`);
      console.log(`   Phone: ${admin.phone} (login without +91: ${admin.phone.replace('+91', '')})`);
      console.log(`   Email: ${admin.email}`);
      console.log('');
    });

    console.log('=== TOTAL ADMINS:', admins.length, '===\n');
    console.log('📝 TRY THESE LOGIN CREDENTIALS:\n');
    console.log('Option 1 - Puneet Bhardwaj:');
    console.log('  Phone: 9958860411');
    console.log('  Password: noteplz@123\n');

    console.log('Option 2 - Savikant Sharma:');
    console.log('  Phone: 9999992400');
    console.log('  Password: (ask client for password)\n');

    console.log('Option 3 - Anoop:');
    console.log('  Phone: 9999995852');
    console.log('  Password: (ask client for password)\n');

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
  }
}

listAdmins();
