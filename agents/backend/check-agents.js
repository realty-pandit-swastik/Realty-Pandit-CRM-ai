const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAgents() {
  try {
    const agents = await prisma.agent.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        password_hash: true
      }
    });

    console.log('\n=== ALL AGENTS IN DATABASE ===');
    agents.forEach(agent => {
      console.log('\nAgent:', agent.name);
      console.log('Phone:', agent.phone);
      console.log('Email:', agent.email);
      console.log('Role:', agent.role);
      console.log('Status:', agent.status);
      console.log('Has Password:', agent.password_hash ? 'YES (length: ' + agent.password_hash.length + ')' : 'NO');
    });

    console.log('\n=== TOTAL AGENTS:', agents.length, '===\n');
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
  }
}

checkAgents();
