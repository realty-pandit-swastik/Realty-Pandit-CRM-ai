const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function testLogin() {
  try {
    const phone = '+919958860411';
    const password = 'noteplz@123';

    const agent = await prisma.agent.findFirst({
      where: { phone: phone }
    });

    if (!agent) {
      console.log('❌ Agent not found with phone:', phone);
      await prisma.$disconnect();
      return;
    }

    console.log('\n=== TESTING LOGIN ===');
    console.log('Agent:', agent.name);
    console.log('Phone:', agent.phone);
    console.log('Email:', agent.email);
    console.log('Role:', agent.role);

    if (!agent.password_hash) {
      console.log('❌ No password hash found!');
      await prisma.$disconnect();
      return;
    }

    const isValid = await bcrypt.compare(password, agent.password_hash);

    if (isValid) {
      console.log('✅ Password is CORRECT!');
      console.log('\n📝 USE THESE CREDENTIALS:');
      console.log('Phone:', phone.replace('+91', '')); // Without +91 prefix
      console.log('Or Phone:', phone); // With +91 prefix
      console.log('Password: noteplz@123');
    } else {
      console.log('❌ Password is INCORRECT');
      console.log('The stored password is different from "noteplz@123"');

      // Try to find what the password might be
      console.log('\n🔍 Checking other possible passwords...');
      const possiblePasswords = [
        'noteplz123',
        'Noteplz@123',
        'NOTEPLZ@123',
        'noteplz@1234',
        '123456',
        'admin123',
        'password'
      ];

      for (const testPwd of possiblePasswords) {
        const match = await bcrypt.compare(testPwd, agent.password_hash);
        if (match) {
          console.log('✅ Found password:', testPwd);
          break;
        }
      }
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
  }
}

testLogin();
