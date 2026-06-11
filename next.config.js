/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Embed the Vercel commit SHA into the client bundle at build time.
    // Falls back to 'dev' for local builds (UpdateModal skips polling when value is 'dev').
    NEXT_PUBLIC_BUILD_ID:
      (process.env.VERCEL_GIT_COMMIT_SHA && process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)) ||
      process.env.NEXT_PUBLIC_BUILD_ID ||
      "dev",
  },
};

module.exports = nextConfig;
