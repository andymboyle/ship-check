// Unbounded findMany
const users = await prisma.user.findMany();

// findMany with pagination — should not be flagged
const paged = await prisma.user.findMany({ take: 20, skip: 0 });

// N+1 inside a loop
for (const org of orgs) {
  const users = await prisma.user.findMany({
    where: { orgId: org.id },
  });
}

// findMany without select (over-fetching)
const allOrgs = await prisma.organization.findMany({
  where: { active: true },
});

// findMany with select — should not be flagged
const orgIds = await prisma.organization.findMany({
  where: { active: true },
  select: { id: true },
});
