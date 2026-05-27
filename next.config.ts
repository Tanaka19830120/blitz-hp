import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Vercel Blob Storage
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
      // teams.one CDN
      { protocol: 'https', hostname: 'd2evtrak3oey66.cloudfront.net' },
      // Google user content (Google Photos direct share links)
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'lh4.googleusercontent.com' },
      { protocol: 'https', hostname: 'lh5.googleusercontent.com' },
      // Imgur
      { protocol: 'https', hostname: 'i.imgur.com' },
      // Twitter/X media
      { protocol: 'https', hostname: 'pbs.twimg.com' },
      // General CloudFront (for other CDNs)
      { protocol: 'https', hostname: '*.cloudfront.net' },
      // Unsplash
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
};

export default nextConfig;
