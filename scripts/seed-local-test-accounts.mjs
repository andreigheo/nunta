import { createRequire } from "node:module";

if (process.env.WEDDINGOS_ALLOW_LOCAL_TEST_ACCOUNTS !== "true") {
  throw new Error(
    "Set WEDDINGOS_ALLOW_LOCAL_TEST_ACCOUNTS=true to create local test accounts.",
  );
}

const databaseUrl = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_OWNER_URL is required.");
const parsedDatabaseUrl = new URL(databaseUrl);
if (!["127.0.0.1", "localhost"].includes(parsedDatabaseUrl.hostname)) {
  throw new Error(
    "Local test accounts may only be seeded into a loopback database.",
  );
}

const requireFromApi = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { Algorithm, hash } = requireFromApi("@node-rs/argon2");
const { PrismaClient } = requireFromApi("@weddingos/database");

const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const password = "WeddingOS2026!";
const passwordHash = await hash(password, {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
});

const workspaceId = "55550000-0000-4000-8000-000000000001";
const vendorOrganizationId = "55550000-0000-4000-8000-000000000002";
const platformAdminDefinition = [
  "55550000-0000-4000-8000-000000000301",
  "admin@weddingos.local",
  "Ada",
  "Platform Admin",
  "PLATFORM_SUPER_ADMIN",
];
const accountDefinitions = [
  [
    "55550000-0000-4000-8000-000000000101",
    "owner@weddingos.local",
    "Olivia",
    "Owner",
    "couple_owner",
  ],
  [
    "55550000-0000-4000-8000-000000000102",
    "partner@weddingos.local",
    "Paul",
    "Partner",
    "couple_partner",
  ],
  [
    "55550000-0000-4000-8000-000000000103",
    "planner@weddingos.local",
    "Petra",
    "Planner",
    "wedding_planner",
  ],
  [
    "55550000-0000-4000-8000-000000000104",
    "family@weddingos.local",
    "Felicia",
    "Family",
    "family_collaborator",
  ],
  [
    "55550000-0000-4000-8000-000000000105",
    "viewer@weddingos.local",
    "Victor",
    "Viewer",
    "viewer",
  ],
];
const vendorAccountDefinitions = [
  [
    "55550000-0000-4000-8000-000000000201",
    "vendor-owner@weddingos.local",
    "Vera",
    "Vendor Owner",
    "vendor_owner",
  ],
  [
    "55550000-0000-4000-8000-000000000202",
    "vendor-manager@weddingos.local",
    "Mara",
    "Vendor Manager",
    "vendor_manager",
  ],
  [
    "55550000-0000-4000-8000-000000000203",
    "vendor-sales@weddingos.local",
    "Sorin",
    "Vendor Sales",
    "vendor_sales",
  ],
  [
    "55550000-0000-4000-8000-000000000204",
    "vendor-operations@weddingos.local",
    "Oana",
    "Vendor Operations",
    "vendor_operations",
  ],
  [
    "55550000-0000-4000-8000-000000000205",
    "vendor-viewer@weddingos.local",
    "Vali",
    "Vendor Viewer",
    "vendor_viewer",
  ],
];

async function upsertUser([id, email, firstName, lastName]) {
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      emailVerifiedAt: new Date(),
      status: "ACTIVE",
      acceptedTermsVersion: "local-test-v1",
      acceptedTermsAt: new Date(),
    },
    create: {
      id,
      email,
      emailVerifiedAt: new Date(),
      status: "ACTIVE",
      acceptedTermsVersion: "local-test-v1",
      acceptedTermsAt: new Date(),
    },
  });
  await prisma.userProfile.upsert({
    where: { userId: user.id },
    update: { firstName, lastName },
    create: { userId: user.id, firstName, lastName },
  });
  await prisma.identity.upsert({
    where: { userId_provider: { userId: user.id, provider: "PASSWORD" } },
    update: { passwordHash },
    create: { userId: user.id, provider: "PASSWORD", passwordHash },
  });
  await prisma.userPreference.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });
  await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });
  return user;
}

try {
  const users = new Map();
  for (const definition of [
    ...accountDefinitions,
    ...vendorAccountDefinitions,
    platformAdminDefinition,
  ]) {
    users.set(definition[1], await upsertUser(definition));
  }
  const owner = users.get("owner@weddingos.local");
  await prisma.workspace.upsert({
    where: { id: workspaceId },
    update: {
      title: "Sarbato — Test roluri",
      createdById: owner.id,
      updatedById: owner.id,
      status: "ACTIVE",
    },
    create: {
      id: workspaceId,
      title: "Sarbato — Test roluri",
      timezone: "Europe/Chisinau",
      currency: "RON",
      createdById: owner.id,
      updatedById: owner.id,
      weddingProfile: {
        create: {
          partnerOneName: "Olivia",
          partnerTwoName: "Paul",
          weddingDate: new Date("2027-09-12T00:00:00.000Z"),
          location: "Chișinău",
          createdById: owner.id,
          updatedById: owner.id,
        },
      },
    },
  });
  await prisma.weddingProfile.upsert({
    where: { workspaceId },
    update: {
      partnerOneName: "Olivia",
      partnerTwoName: "Paul",
      weddingDate: new Date("2027-09-12T00:00:00.000Z"),
      location: "Chișinău",
      updatedById: owner.id,
    },
    create: {
      workspaceId,
      partnerOneName: "Olivia",
      partnerTwoName: "Paul",
      weddingDate: new Date("2027-09-12T00:00:00.000Z"),
      location: "Chișinău",
      createdById: owner.id,
      updatedById: owner.id,
    },
  });
  for (const definition of accountDefinitions) {
    const user = users.get(definition[1]);
    const role = await prisma.roleTemplate.findUniqueOrThrow({
      where: { key: definition[4] },
    });
    await prisma.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
      update: {
        roleTemplateId: role.id,
        status: "ACTIVE",
        removedAt: null,
        updatedById: owner.id,
      },
      create: {
        workspaceId,
        userId: user.id,
        roleTemplateId: role.id,
        status: "ACTIVE",
        createdById: owner.id,
        updatedById: owner.id,
      },
    });
    await prisma.userPreference.update({
      where: { userId: user.id },
      data: { lastActiveWorkspaceId: workspaceId },
    });
  }

  const vendorOwner = users.get("vendor-owner@weddingos.local");
  await prisma.vendorOrganization.upsert({
    where: { id: vendorOrganizationId },
    update: {
      legalName: "Atelier Sarbato Test SRL",
      displayName: "Atelier Sarbato Test",
      contactEmail: vendorOwner.email,
      status: "ACTIVE",
      updatedById: vendorOwner.id,
      deletedAt: null,
    },
    create: {
      id: vendorOrganizationId,
      legalName: "Atelier Sarbato Test SRL",
      displayName: "Atelier Sarbato Test",
      country: "Moldova",
      contactEmail: vendorOwner.email,
      status: "ACTIVE",
      createdById: vendorOwner.id,
      updatedById: vendorOwner.id,
    },
  });
  for (const definition of vendorAccountDefinitions) {
    const user = users.get(definition[1]);
    const role = await prisma.vendorRoleTemplate.findUniqueOrThrow({
      where: { key: definition[4] },
    });
    await prisma.vendorOrganizationMembership.upsert({
      where: {
        vendorOrganizationId_userId: {
          vendorOrganizationId,
          userId: user.id,
        },
      },
      update: {
        roleTemplateId: role.id,
        status: "ACTIVE",
        joinedAt: new Date(),
        removedAt: null,
        updatedById: vendorOwner.id,
      },
      create: {
        vendorOrganizationId,
        userId: user.id,
        roleTemplateId: role.id,
        status: "ACTIVE",
        joinedAt: new Date(),
        createdById: vendorOwner.id,
        updatedById: vendorOwner.id,
      },
    });
  }

  const platformAdmin = users.get(platformAdminDefinition[1]);
  const platformRole = await prisma.platformRole.findUniqueOrThrow({
    where: { key: platformAdminDefinition[4] },
  });
  await prisma.platformGrant.upsert({
    where: {
      userId_roleId_environment: {
        userId: platformAdmin.id,
        roleId: platformRole.id,
        environment: "development",
      },
    },
    update: {
      active: true,
      mfaVerifiedAt: new Date(),
      revokedAt: null,
      revokedById: null,
      reason: "Cont local controlat pentru testarea Slice 10.",
    },
    create: {
      userId: platformAdmin.id,
      roleId: platformRole.id,
      environment: "development",
      active: true,
      mfaVerifiedAt: new Date(),
      grantedById: platformAdmin.id,
      reason: "Cont local controlat pentru testarea Slice 10.",
    },
  });

  console.log(
    JSON.stringify(
      {
        workspaceId,
        vendorOrganizationId,
        password,
        accounts: [
          ...accountDefinitions,
          ...vendorAccountDefinitions,
          platformAdminDefinition,
        ].map(([, email, , , role]) => ({ email, role })),
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
