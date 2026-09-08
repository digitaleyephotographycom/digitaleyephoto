import fs from "fs";
import path from "path";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const envContent = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
function getEnv(key) {
  const match = envContent.match(new RegExp(`${key}\\s*=\\s*([^\\r\\n]+)`));
  return match ? match[1].trim() : "";
}

const client = new S3Client({
  endpoint: getEnv("B2_ENDPOINT"),
  region: getEnv("B2_REGION"),
  credentials: {
    accessKeyId: getEnv("B2_KEY_ID"),
    secretAccessKey: getEnv("B2_APPLICATION_KEY"),
  },
});

const bucket = getEnv("B2_BUCKET_NAME");

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

async function cleanPrefix(prefix) {
  try {
    const list = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
    for (const item of list.Contents || []) {
      if (item.Key) {
        console.log(`Deleting file: ${item.Key}`);
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: item.Key }));
      }
    }
  } catch (e) {
    console.warn("Could not clean prefix " + prefix, e.message);
  }
}

async function run() {
  console.log("Reading _meta/index.json from B2...");
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: "_meta/index.json" }));
  const text = await streamToString(res.Body);
  const index = JSON.parse(text);

  const idsToPurge = ["ga7554e176ad6", "ga2f145b1ba77"];
  console.log("Current galleries in index:", index.galleries.map(g => `${g.id} (${g.name})`));

  for (const id of idsToPurge) {
    console.log(`Cleaning up B2 files for ${id}...`);
    await cleanPrefix(`galleries/${id}/`);
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: `_meta/galleries/${id}.json` }));
    } catch {}
  }

  const beforeCount = index.galleries.length;
  index.galleries = index.galleries.filter(g => !idsToPurge.includes(g.id));
  const afterCount = index.galleries.length;
  console.log(`Galleries before: ${beforeCount}, after: ${afterCount}`);

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: "_meta/index.json",
    Body: JSON.stringify(index, null, 2),
    ContentType: "application/json",
  }));

  console.log("Successfully updated _meta/index.json!");
}

run().catch(console.error);
