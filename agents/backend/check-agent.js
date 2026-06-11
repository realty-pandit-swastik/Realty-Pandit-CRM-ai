const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    // Search for agent with phone containing 9958860411
    const agents = await prisma.agent.findMany({
      where: {
        OR: [
          { phone: { contains: '9958860411' } },
          { phone: '+919958860411' },
          { phone: '919958860411' },
          { phone: '9958860411' },
        ]
      },
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        role: true,
        created_at: true
      }
    });

    console.log('Found agents:', JSON.stringify(agents, null, 2));

    // Also list all agents to see what exists
    const allAgents = await prisma.agent.findMany({
      select: {
        phone: true,
        name: true,
        role: true
      },
      take: 10
    });

    console.log('\nAll agents (first 10):', JSON.stringify(allAgents, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
})();
