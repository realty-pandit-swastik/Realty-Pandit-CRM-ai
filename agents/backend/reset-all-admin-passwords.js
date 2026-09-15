const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function resetAdminPasswords() {
  try {
    const newPassword = 'noteplz@123';
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Get all super_boss accounts
    const admins = await prisma.agent.findMany({
      where: { role: 'super_boss' }
    });

    console.log('\n=== RESETTING ALL ADMIN PASSWORDS ===\n');

    for (const admin of admins) {
      await prisma.agent.update({
        where: { id: admin.id },
        data: { password_hash: hashedPassword }
      });

      console.log(`✅ Updated password for: ${admin.name}`);
      console.log(`   Phone: ${admin.phone.replace('+91', '')}`);
      console.log(`   Email: ${admin.email}`);
      console.log('');
    }

    console.log('=== ALL ADMIN PASSWORDS RESET TO: noteplz@123 ===\n');
    console.log('📝 YOU CAN NOW LOGIN WITH ANY OF THESE:\n');

    admins.forEach((admin, index) => {
      console.log(`${index + 1}. ${admin.name}`);
      console.log(`   Phone: ${admin.phone.replace('+91', '')}`);
      console.log(`   Password: noteplz@123\n`);
    });

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
  }
}

resetAdminPasswords();
