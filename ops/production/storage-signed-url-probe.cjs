const {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const [operation, endpoint, key] = process.argv.slice(2);
if (!["put", "get", "delete"].includes(operation) || !endpoint || !key) {
  throw new Error(
    "usage: storage-signed-url-probe.cjs <put|get|delete> <endpoint> <key>",
  );
}

const client = new S3Client({
  region: process.env.OBJECT_STORAGE_REGION,
  endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY,
    secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY,
  },
});

const bucket = process.env.OBJECT_STORAGE_BUCKET;

async function main() {
  if (operation === "delete") {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    process.stdout.write("deleted\n");
    return;
  }

  const command =
    operation === "put"
      ? new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: "text/plain",
        })
      : new GetObjectCommand({ Bucket: bucket, Key: key });
  process.stdout.write(`${await getSignedUrl(client, command, { expiresIn: 60 })}\n`);
}

void main();
