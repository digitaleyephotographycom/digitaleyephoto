import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";

// Automatically load .env.local if present
try {
  process.loadEnvFile(".env.local");
} catch (e) {
  // .env.local might not exist if env vars are set in environment directly
}

const region = process.env.B2_REGION;
const endpoint = process.env.B2_ENDPOINT;
const accessKeyId = process.env.B2_KEY_ID;
const secretAccessKey = process.env.B2_APPLICATION_KEY;
const bucket = process.env.B2_BUCKET_NAME;

if (!region || !endpoint || !accessKeyId || !secretAccessKey || !bucket) {
  console.error("Missing required Backblaze B2 environment variables in .env.local.");
  console.error({
    B2_REGION: !!region,
    B2_ENDPOINT: !!endpoint,
    B2_KEY_ID: !!accessKeyId,
    B2_APPLICATION_KEY: !!secretAccessKey,
    B2_BUCKET_NAME: !!bucket,
  });
  process.exit(1);
}

const client = new S3Client({
  region,
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

async function main() {
  console.log(`Setting CORS rules for Backblaze B2 bucket: "${bucket}"...`);

  const corsRules = [
    {
      AllowedOrigins: ["*"],
      AllowedMethods: ["GET", "HEAD", "PUT", "POST", "DELETE"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag"],
      MaxAgeSeconds: 3600,
    },
  ];

  try {
    await client.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: {
          CORSRules: corsRules,
        },
      })
    );
    console.log("Bucket CORS rules successfully updated!");

    const res = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
    console.log("\nCurrent active CORS rules on bucket:");
    console.log(JSON.stringify(res.CORSRules, null, 2));
  } catch (err) {
    console.error("Failed to update CORS rules:", err);
    process.exit(1);
  }
}

main();
