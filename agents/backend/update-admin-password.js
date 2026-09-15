const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function updatePassword() {
  const phone = '+919958860411';
  const password = 'noteplz@123';
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const agent = await prisma.agent.findFirst({ where: { phone } });

    if (!agent) {
      console.log('❌ Agent not found');
      await prisma.$disconnect();
      return;
    }

    await prisma.agent.update({
      where: { id: agent.id },
      data: { password_hash: hashedPassword }
    });

    console.log('✅ Password updated for:', agent.name);
    console.log('Phone:', phone);
    console.log('New password: noteplz@123');

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

updatePassword();
