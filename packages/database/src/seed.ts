import { PrismaClient } from "@prisma/client";
import { defaultRoleTemplates } from "@weddingos/contracts";

const databaseUrl = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_OWNER_URL or DATABASE_URL is required for seeding.",
  );
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

async function main() {
  try {
    for (const template of defaultRoleTemplates) {
      await prisma.roleTemplate.upsert({
        where: { key: template.key },
        update: {
          name: template.name,
          description: template.description,
          capabilities: [...template.capabilities],
        },
        create: {
          key: template.key,
          name: template.name,
          description: template.description,
          capabilities: [...template.capabilities],
          system: true,
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
