This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

### AWS S3 Setup

Used for storing original PDF/text source files (referenced by the Source Viewer).

1. **Create a bucket** — S3 → Create bucket → note the bucket name and region. Keep **Block all public access** enabled (default) — files are served via signed URLs, not direct public access.

2. **Create a scoped IAM user** — don't use root account keys.
   - IAM → Users → Create user (name it e.g. `notebooklm-app-s3`, no console access needed)
   - Attach a custom policy (not `AmazonS3FullAccess`), scoped to just this bucket:
```json
     {
       "Version": "2012-10-17",
       "Statement": [
         {
           "Effect": "Allow",
           "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
           "Resource": "arn:aws:s3:::your-bucket-name/*"
         },
         {
           "Effect": "Allow",
           "Action": "s3:ListBucket",
           "Resource": "arn:aws:s3:::your-bucket-name"
         }
       ]
     }
```

3. **Generate access keys** — IAM → Users → your user → Security credentials → Create access key → select **"Application running outside AWS"**. Copy the Secret Access Key immediately; it's shown only once.

4. **Add to `.env.local`**:
```dotenv
   S3_BUCKET=your-bucket-name
   S3_ACCESS_KEY_ID=AKIA...
   S3_ACCESS_KEY_SECRET=...
   S3_REGION=us-east-1
```