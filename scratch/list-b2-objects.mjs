import fs from "fs";
import path from "path";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

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

async function run() {
  const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 100 }));
  console.log("Total objects listed:", res.KeyCount);
  for (const obj of res.Contents || []) {
    console.log(` - ${obj.Key} (${obj.Size} bytes)`);
  }
}

run().catch(console.error);
