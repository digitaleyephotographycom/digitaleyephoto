import fs from "fs";
import path from "path";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

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

async function run() {
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: "_meta/index.json" }));
  const text = await streamToString(res.Body);
  const index = JSON.parse(text);
  console.log("TOTAL GALLERIES IN INDEX:", index.galleries?.length);
  for (const g of index.galleries || []) {
    console.log(`\nID: ${g.id} | Name: "${g.name}" | Cust: "${g.customerName}" | Code: ${g.code} | Photos: ${g.photoCount} | Status: ${g.status}`);
    try {
      const gRes = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `_meta/galleries/${g.id}.json` }));
      const gText = await streamToString(gRes.Body);
      const data = JSON.parse(gText);
      console.log(`  -> Meta file exists! Photos array length: ${data.photos?.length}`);
    } catch (err) {
      console.log(`  -> Meta file FAILED: ${err.name} / ${err.$metadata?.httpStatusCode}`);
    }
  }
}

run().catch(console.error);
