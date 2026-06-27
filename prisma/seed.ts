/**
 * Demo seed — populates ~3 months of realistic product-feedback activity.
 *
 * Run on VPS:
 *   npx tsx prisma/seed.ts
 *
 * Safe to re-run: skips records that already exist (upsert on email / slug).
 * Does NOT delete existing data first.
 */

import { createHash } from "crypto";

import { PrismaClient, type PostStatus } from "@prisma/client";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a Date that is `daysAgo` days before now, with jitter up to ±jitterHours. */
function daysAgo(days: number, jitterHours = 4): Date {
  const ms = Date.now() - days * 86_400_000 + (Math.random() - 0.5) * jitterHours * 3_600_000;
  return new Date(ms);
}

/** Deterministic fake password hash (not for production auth — demo only). */
function fakeHash(email: string) {
  return "$2b$10$" + createHash("sha256").update(email).digest("hex").slice(0, 53);
}

function pick<T>(arr: T[]): T {
  const item = arr[Math.floor(Math.random() * arr.length)];
  if (item === undefined) throw new Error("pick called on empty array");
  return item;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j] as T;
    a[j] = tmp as T;
  }
  return a;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN_EMAIL = "admin@demo.opencan.dev";

const USERS = [
  { name: "Priya Mehta",       email: "priya@acmecorp.io" },
  { name: "Jordan Ellis",      email: "jordan@startupxyz.com" },
  { name: "Sung-min Park",     email: "sungmin@devtools.co" },
  { name: "Aaliya Okafor",     email: "aaliya@techlaunch.io" },
  { name: "Marco Ricci",       email: "marco@saasbuilders.eu" },
  { name: "Fatima Al-Rashid",  email: "fatima@growthco.io" },
  { name: "Luca Ferreira",     email: "luca@pixelstudio.dev" },
  { name: "Hannah Kovács",     email: "hannah@fintech-labs.com" },
  { name: "Ravi Sundaram",     email: "ravi@cloudhq.dev" },
  { name: "Yuki Tanaka",       email: "yuki@productdemo.jp" },
  { name: "Chloe Dubois",      email: "chloe@designhub.fr" },
  { name: "Alex Kim",          email: "alex@betauser.net" },
];

const BOARDS = [
  {
    slug: "feature-requests",
    name: "Feature Requests",
    description: "Suggest new features and improvements for the product.",
    isPublic: true,
    isListed: true,
  },
  {
    slug: "bug-reports",
    name: "Bug Reports",
    description: "Found something broken? Let us know here.",
    isPublic: true,
    isListed: true,
  },
  {
    slug: "integrations",
    name: "Integrations",
    description: "Requests for third-party integrations and API connectors.",
    isPublic: true,
    isListed: true,
  },
  {
    slug: "mobile-app",
    name: "Mobile App",
    description: "Feedback and ideas specific to our iOS and Android apps.",
    isPublic: true,
    isListed: true,
  },
];

const DEFAULT_BOARD_SETTINGS = {
  allowGuestPosts: false,
  allowGuestVotes: false,
  allowGuestComments: false,
  requirePostApproval: false,
};

// Each entry: { boardSlug, title, description, status, ageDays, pinned? }
const POSTS: Array<{
  boardSlug: string;
  title: string;
  description: string;
  status: PostStatus;
  ageDays: number;
  pinned?: boolean;
}> = [
  // Feature Requests
  {
    boardSlug: "feature-requests",
    title: "Dark mode support",
    description:
      "Please add a dark mode option. Working late at night with the current bright UI is rough on the eyes. Even a simple toggle in settings would go a long way.",
    status: "PLANNED",
    ageDays: 88,
    pinned: true,
  },
  {
    boardSlug: "feature-requests",
    title: "Bulk status updates for posts",
    description:
      "As an admin I often need to update the status of many posts at once after a release. Having to do each one individually takes forever. A multi-select + bulk action would save hours.",
    status: "UNDER_REVIEW",
    ageDays: 72,
  },
  {
    boardSlug: "feature-requests",
    title: "CSV export of all feedback",
    description:
      "We need to pull feedback into our data warehouse for quarterly reviews. A CSV export covering title, description, votes, status, and date would be really helpful.",
    status: "PLANNED",
    ageDays: 65,
  },
  {
    boardSlug: "feature-requests",
    title: "Custom post fields",
    description:
      "Ability to add structured fields to posts — e.g. affected plan, browser, or environment. This would make triaging much faster without relying on free text descriptions.",
    status: "OPEN",
    ageDays: 51,
  },
  {
    boardSlug: "feature-requests",
    title: "Email digest for new posts",
    description:
      "A weekly or daily digest emailed to admins summarising new posts and votes would be great. Right now I have to log in just to check if anything new came in.",
    status: "OPEN",
    ageDays: 44,
  },
  {
    boardSlug: "feature-requests",
    title: "Post merging / duplicate detection",
    description:
      "We frequently get duplicate feature requests. It would be great to merge them into a canonical one so votes accumulate and authors get notified of the merged post.",
    status: "UNDER_REVIEW",
    ageDays: 38,
  },
  {
    boardSlug: "feature-requests",
    title: "Upvote without creating an account",
    description:
      "A lot of our customers are reluctant to create an account just to upvote. Could we allow voting with just an email address (like HN job posts)?",
    status: "OPEN",
    ageDays: 29,
  },
  {
    boardSlug: "feature-requests",
    title: "Roadmap public view",
    description:
      "We'd love to share a public read-only roadmap view with customers that shows what's planned, in progress, and shipped — automatically synced from post statuses.",
    status: "IN_PROGRESS",
    ageDays: 20,
    pinned: true,
  },
  {
    boardSlug: "feature-requests",
    title: "Zapier / Make integration",
    description:
      "Connecting OpenCan to Zapier would let us push new posts straight into our Jira backlog and notify our Slack channel. Would save a lot of manual checking.",
    status: "OPEN",
    ageDays: 12,
  },
  {
    boardSlug: "feature-requests",
    title: "Post categories / labels",
    description:
      "Beyond boards, it would be useful to tag posts with labels like 'performance', 'UI', 'API' etc. so we can filter and prioritise by theme.",
    status: "OPEN",
    ageDays: 6,
  },

  // Bug Reports
  {
    boardSlug: "bug-reports",
    title: "Login redirect loop on Safari iOS",
    description:
      "After signing in with Google on Safari (iPhone 15, iOS 17.4), the page redirects back to /auth/signin in an infinite loop. Works fine on Chrome.",
    status: "SHIPPED",
    ageDays: 80,
  },
  {
    boardSlug: "bug-reports",
    title: "Vote count not updating in real-time",
    description:
      "When I upvote a post the count doesn't change until I refresh. Other users see the same stale count. Seems like the UI isn't revalidating after a mutation.",
    status: "SHIPPED",
    ageDays: 68,
  },
  {
    boardSlug: "bug-reports",
    title: "Long post titles overflow card layout",
    description:
      "Post titles longer than ~80 characters break the card layout on the board view — the text overflows the card boundary on smaller screens.",
    status: "SHIPPED",
    ageDays: 55,
  },
  {
    boardSlug: "bug-reports",
    title: "Search returning no results for accented characters",
    description:
      "Searching for 'café' returns nothing even though there is a post with that exact word. Unaccented 'cafe' works fine. Looks like a collation issue.",
    status: "IN_PROGRESS",
    ageDays: 41,
  },
  {
    boardSlug: "bug-reports",
    title: "Email notifications arriving in spam",
    description:
      "Status-change emails from the platform are landing in spam for several of our team members (Gmail). SPF and DKIM may not be configured correctly.",
    status: "CLOSED",
    ageDays: 33,
  },
  {
    boardSlug: "bug-reports",
    title: "Admin user list pagination broken at page 3",
    description:
      "Clicking 'Next' on page 2 of the admin user list correctly loads page 3, but clicking 'Next' again jumps back to page 1 instead of page 4.",
    status: "UNDER_REVIEW",
    ageDays: 22,
  },
  {
    boardSlug: "bug-reports",
    title: "Markdown rendering strips code blocks",
    description:
      "Triple-backtick code blocks in post descriptions are stripped on render. Only inline code (single backtick) works. Affects bug reports most as we paste stack traces.",
    status: "OPEN",
    ageDays: 14,
  },
  {
    boardSlug: "bug-reports",
    title: "Webhook test delivery shows 200 even on error",
    description:
      "The webhook test endpoint always returns a success message even when the target URL returns a 500. The UI says 'delivered' but the payload was never received.",
    status: "OPEN",
    ageDays: 5,
  },

  // Integrations
  {
    boardSlug: "integrations",
    title: "Linear integration — auto-create issues from posts",
    description:
      "When an admin changes a post status to 'Planned', automatically create a linked Linear issue. Syncing the status back from Linear would be a bonus.",
    status: "PLANNED",
    ageDays: 76,
    pinned: true,
  },
  {
    boardSlug: "integrations",
    title: "Slack notifications for new posts",
    description:
      "Post a message to a Slack channel whenever a new post is submitted or a status changes. We use Slack as our ops hub and this would keep the team updated without checking the dashboard.",
    status: "SHIPPED",
    ageDays: 62,
  },
  {
    boardSlug: "integrations",
    title: "GitHub Issues sync",
    description:
      "Bi-directional sync with GitHub Issues: create a GH issue when a post reaches 'Planned', close the post when the GH issue is closed.",
    status: "OPEN",
    ageDays: 48,
  },
  {
    boardSlug: "integrations",
    title: "Intercom widget embed",
    description:
      "We want to surface the feedback board inside the Intercom messenger so customers can submit ideas without leaving the support chat.",
    status: "OPEN",
    ageDays: 31,
  },
  {
    boardSlug: "integrations",
    title: "Google Analytics / Plausible tracking",
    description:
      "The ability to add a GA4 or Plausible snippet to the public boards so we can track which feedback pages get the most organic traffic.",
    status: "OPEN",
    ageDays: 18,
  },

  // Mobile
  {
    boardSlug: "mobile-app",
    title: "Push notifications when status changes",
    description:
      "I'd love a push notification on my phone when a post I voted on changes status. Currently I only get email which I often miss.",
    status: "PLANNED",
    ageDays: 83,
  },
  {
    boardSlug: "mobile-app",
    title: "Swipe gesture to upvote",
    description:
      "A swipe-right gesture to upvote a post would make the mobile experience much faster — similar to Product Hunt's mobile UX.",
    status: "OPEN",
    ageDays: 59,
  },
  {
    boardSlug: "mobile-app",
    title: "Offline mode — cache board contents",
    description:
      "When there's no connectivity the app just shows a blank screen. Even read-only access to cached board content would be much better.",
    status: "UNDER_REVIEW",
    ageDays: 43,
  },
  {
    boardSlug: "mobile-app",
    title: "App crashes on Android 12 when attaching image",
    description:
      "Tapping the image attachment button in a new post reliably crashes the app on Android 12 (tested on Pixel 6 and Samsung S22). Android 13 is fine.",
    status: "IN_PROGRESS",
    ageDays: 27,
  },
  {
    boardSlug: "mobile-app",
    title: "Home screen widget showing open post count",
    description:
      "A simple iOS/Android widget showing how many open feedback posts need attention would be useful for product managers checking their phone.",
    status: "OPEN",
    ageDays: 10,
  },
];

const COMMENTS: Array<{ postTitle: string; body: string; authorEmail: string; ageDays: number }> = [
  {
    postTitle: "Dark mode support",
    body: "Strongly agree — this is the most requested feature in our customer interviews too. Even a system-preference auto-detect would be enough.",
    authorEmail: "jordan@startupxyz.com",
    ageDays: 85,
  },
  {
    postTitle: "Dark mode support",
    body: "We're planning this for next quarter. Following ADR-009 for the UI component approach. Watch this space!",
    authorEmail: ADMIN_EMAIL,
    ageDays: 83,
  },
  {
    postTitle: "Dark mode support",
    body: "Thank you for the update! Will the dark mode preference be saved per-account or per-device?",
    authorEmail: "fatima@growthco.io",
    ageDays: 80,
  },
  {
    postTitle: "Bulk status updates for posts",
    body: "We run a monthly review where we update 20–30 posts at once. This would be a huge time saver.",
    authorEmail: "sungmin@devtools.co",
    ageDays: 70,
  },
  {
    postTitle: "Bulk status updates for posts",
    body: "Looking into the UX for this. Would a checkbox multi-select + floating action bar work, or would you prefer a spreadsheet-style inline edit?",
    authorEmail: ADMIN_EMAIL,
    ageDays: 68,
  },
  {
    postTitle: "Bulk status updates for posts",
    body: "Checkbox + floating bar sounds perfect — similar to Gmail's bulk actions. Much better than inline editing for this use case.",
    authorEmail: "aaliya@techlaunch.io",
    ageDays: 66,
  },
  {
    postTitle: "CSV export of all feedback",
    body: "We also need the voter list per post if possible — helps us reach out directly when something ships.",
    authorEmail: "ravi@cloudhq.dev",
    ageDays: 62,
  },
  {
    postTitle: "Login redirect loop on Safari iOS",
    body: "Same issue here on iPhone 14 Pro (iOS 17.2). Tried clearing cookies and it still loops.",
    authorEmail: "yuki@productdemo.jp",
    ageDays: 78,
  },
  {
    postTitle: "Login redirect loop on Safari iOS",
    body: "Fixed in yesterday's deploy — root cause was a missing SameSite=None; Secure on the session cookie. Please let us know if you still see it.",
    authorEmail: ADMIN_EMAIL,
    ageDays: 75,
  },
  {
    postTitle: "Login redirect loop on Safari iOS",
    body: "Confirmed fixed on my end. Thanks for the quick turnaround!",
    authorEmail: "yuki@productdemo.jp",
    ageDays: 74,
  },
  {
    postTitle: "Vote count not updating in real-time",
    body: "Reproducible for me too. The count goes up only after a full page reload, not just a soft nav.",
    authorEmail: "chloe@dubois.fr",
    ageDays: 66,
  },
  {
    postTitle: "Linear integration — auto-create issues from posts",
    body: "This is the integration we need the most. We use Linear for everything and manually copying posts is painful.",
    authorEmail: "priya@acmecorp.io",
    ageDays: 73,
  },
  {
    postTitle: "Linear integration — auto-create issues from posts",
    body: "We'd also want the Linear issue status to reflect back to OpenCan automatically when it moves to 'Done'.",
    authorEmail: "marco@saasbuilders.eu",
    ageDays: 70,
  },
  {
    postTitle: "Linear integration — auto-create issues from posts",
    body: "Bi-directional sync is on our radar but the initial release will be one-way (OpenCan → Linear). We'll iterate from there based on usage.",
    authorEmail: ADMIN_EMAIL,
    ageDays: 68,
  },
  {
    postTitle: "Slack notifications for new posts",
    body: "This shipped last month and it's been great. We have it posting to #product-feedback and the team actually reads new submissions now.",
    authorEmail: "hannah@fintech-labs.com",
    ageDays: 55,
  },
  {
    postTitle: "Post merging / duplicate detection",
    body: "We have at least 5 duplicate 'dark mode' requests alone. A 'mark as duplicate' that redirects votes would help a lot.",
    authorEmail: "alex@betauser.net",
    ageDays: 36,
  },
  {
    postTitle: "Post merging / duplicate detection",
    body: "Fuzzy title matching on submission to warn the poster of potential duplicates would also cut them down before they're created.",
    authorEmail: "luca@pixelstudio.dev",
    ageDays: 35,
  },
  {
    postTitle: "Roadmap public view",
    body: "This is already in progress — you can see a preview at /roadmap. Would love feedback on the layout before we make it GA.",
    authorEmail: ADMIN_EMAIL,
    ageDays: 18,
  },
  {
    postTitle: "Roadmap public view",
    body: "Tried the preview — it looks great! One ask: can we customise which statuses appear on the roadmap? We don't want to show 'Closed' items.",
    authorEmail: "priya@acmecorp.io",
    ageDays: 16,
  },
  {
    postTitle: "App crashes on Android 12 when attaching image",
    body: "Can you share a crash log or adb logcat output? That would help us narrow it down quickly.",
    authorEmail: ADMIN_EMAIL,
    ageDays: 25,
  },
  {
    postTitle: "App crashes on Android 12 when attaching image",
    body: "Sent the logcat output to support@opencan.dev. Looks like a NullPointerException in the file picker intent handling.",
    authorEmail: "sungmin@devtools.co",
    ageDays: 24,
  },
  {
    postTitle: "Search returning no results for accented characters",
    body: "Confirmed — same issue with German umlauts (ü, ö, ä). Seems like the trigram index isn't normalising Unicode before matching.",
    authorEmail: "hannah@fintech-labs.com",
    ageDays: 39,
  },
  {
    postTitle: "Markdown rendering strips code blocks",
    body: "Also affects GFM tables — they render as raw pipe characters instead of a formatted table.",
    authorEmail: "ravi@cloudhq.dev",
    ageDays: 12,
  },
];

const CHANGELOG: Array<{
  slug: string;
  title: string;
  body: string;
  publishedDaysAgo: number;
  linkedPostTitles: string[];
}> = [
  {
    slug: "safari-login-fix",
    title: "Fixed: Safari iOS login redirect loop",
    body: `## What changed\n\nWe patched a session cookie misconfiguration that caused an infinite redirect loop when signing in via Google on Safari (iOS 17+).\n\n**Root cause:** The session cookie was missing \`SameSite=None; Secure\`, which Safari enforces strictly in cross-site contexts.\n\n## Who is affected\n\nAny user who tried to log in on Safari for iPhone or iPad in the last few weeks.\n\n## Action required\n\nNone — the fix is live. Clear your browser cookies if you see the issue persist.`,
    publishedDaysAgo: 75,
    linkedPostTitles: ["Login redirect loop on Safari iOS"],
  },
  {
    slug: "vote-count-realtime",
    title: "Improved: Vote counts now update instantly",
    body: `## What changed\n\nVote counts on the board view now update immediately after upvoting — no page refresh needed.\n\n**Previously:** The UI waited for a full navigation to revalidate the count.\n\n**Now:** We optimistically update the count on the client and revalidate in the background via Next.js cache tags.\n\nThanks to everyone who reported and confirmed this!`,
    publishedDaysAgo: 60,
    linkedPostTitles: ["Vote count not updating in real-time"],
  },
  {
    slug: "slack-integration-launch",
    title: "New: Slack integration is live",
    body: `## Send feedback activity to Slack\n\nYou can now connect OpenCan to a Slack channel and receive notifications when:\n\n- A new post is submitted\n- A post's status changes\n- A new comment is added\n\nTo set it up, go to **Settings → Integrations → Slack** and paste your webhook URL.\n\n> The integration uses our standard webhook infrastructure, so the same reliability guarantees apply.`,
    publishedDaysAgo: 52,
    linkedPostTitles: ["Slack notifications for new posts"],
  },
  {
    slug: "roadmap-page-beta",
    title: "Beta: Public roadmap page",
    body: `## Your public roadmap is here\n\nWe've shipped a public \`/roadmap\` page that auto-populates from your post statuses:\n\n| Column | Posts included |\n|--------|---------------|\n| Planned | status = PLANNED |\n| In Progress | status = IN_PROGRESS |\n| Shipped | status = SHIPPED (last 90 days) |\n\n**To enable it**, go to Settings → Roadmap and toggle "Show public roadmap".\n\nThis is a beta — we're still iterating on the layout. Drop feedback in the Roadmap board!`,
    publishedDaysAgo: 18,
    linkedPostTitles: ["Roadmap public view"],
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("🌱 Starting demo seed…");

  // 1. Upsert admin user
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      name: "OpenCan Admin",
      role: "ADMIN",
      emailVerified: new Date(),
      passwordHash: fakeHash(ADMIN_EMAIL),
      createdAt: daysAgo(100, 0),
    },
  });
  console.log(`  ✓ admin user: ${admin.email}`);

  // 2. Upsert member users
  const userMap = new Map<string, string>(); // email → id
  userMap.set(ADMIN_EMAIL, admin.id);

  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        role: "MEMBER",
        emailVerified: new Date(),
        passwordHash: fakeHash(u.email),
        createdAt: daysAgo(90 + Math.floor(Math.random() * 10), 12),
      },
    });
    userMap.set(u.email, user.id);
  }
  console.log(`  ✓ ${USERS.length} member users`);

  // 3. Upsert boards (owned by admin)
  const boardMap = new Map<string, string>(); // slug → id
  for (let i = 0; i < BOARDS.length; i++) {
    const b = BOARDS[i];
    if (!b) continue;
    const board = await prisma.board.upsert({
      where: { slug: b.slug },
      update: {},
      create: {
        slug: b.slug,
        name: b.name,
        description: b.description,
        isPublic: b.isPublic,
        isListed: b.isListed,
        settingsJson: DEFAULT_BOARD_SETTINGS,
        position: i,
        ownerId: admin.id,
        createdAt: daysAgo(95, 0),
      },
    });
    boardMap.set(b.slug, board.id);
  }
  console.log(`  ✓ ${BOARDS.length} boards`);

  // 4. Create posts
  const postMap = new Map<string, string>(); // title → id
  const memberEmails = USERS.map((u) => u.email);

  // Track per-board post numbers (start from max existing)
  const postNumberCounters = new Map<string, number>();
  for (const [slug, boardId] of boardMap) {
    const max = await prisma.post.aggregate({
      where: { boardId },
      _max: { postNumber: true },
    });
    postNumberCounters.set(slug, max._max.postNumber ?? 0);
  }

  for (const p of POSTS) {
    const boardId = boardMap.get(p.boardSlug);
    if (!boardId) continue;

    // Check if post with this title already exists on this board
    const existing = await prisma.post.findFirst({
      where: { boardId, title: p.title },
      select: { id: true },
    });
    if (existing) {
      postMap.set(p.title, existing.id);
      continue;
    }

    const counter = (postNumberCounters.get(p.boardSlug) ?? 0) + 1;
    postNumberCounters.set(p.boardSlug, counter);

    const authorEmail = pick(memberEmails);
    const createdAt = daysAgo(p.ageDays);
    const post = await prisma.post.create({
      data: {
        postNumber: counter,
        boardId,
        authorId: userMap.get(authorEmail) ?? admin.id,
        title: p.title,
        description: p.description,
        status: p.status,
        isPinned: p.pinned ?? false,
        pinnedAt: p.pinned ? createdAt : null,
        createdAt,
        updatedAt: daysAgo(Math.max(p.ageDays - 5, 0)),
      },
    });
    postMap.set(p.title, post.id);
  }
  console.log(`  ✓ ${POSTS.length} posts`);

  // 5. Create votes (spread across users, weighted by post age so older posts have more)
  let voteCount = 0;
  for (const p of POSTS) {
    const postId = postMap.get(p.title);
    if (!postId) continue;

    // Weight: older / higher-status posts get more votes
    const statusWeight: Record<PostStatus, number> = {
      SHIPPED: 1.0, IN_PROGRESS: 0.9, PLANNED: 0.8,
      UNDER_REVIEW: 0.7, OPEN: 0.5, PENDING: 0.2, CLOSED: 0.3,
    };
    const targetVotes = Math.round(
      (statusWeight[p.status] * (p.ageDays / 90) * memberEmails.length * 0.75) + 1
    );

    const shuffled = shuffle(memberEmails).slice(0, Math.min(targetVotes, memberEmails.length));
    for (const email of shuffled) {
      const userId = userMap.get(email);
      if (!userId) continue;
      await prisma.vote.upsert({
        where: { postId_userId: { postId, userId } },
        update: {},
        create: {
          postId,
          userId,
          createdAt: daysAgo(p.ageDays - Math.floor(Math.random() * Math.min(p.ageDays, 20))),
        },
      });
      voteCount++;
    }

    // Sync voteCount denorm
    const actual = await prisma.vote.count({ where: { postId } });
    await prisma.post.update({ where: { id: postId }, data: { voteCount: actual } });
  }
  console.log(`  ✓ ${voteCount} votes`);

  // 6. Create comments
  let commentCount = 0;
  for (const c of COMMENTS) {
    const postId = postMap.get(c.postTitle);
    if (!postId) continue;

    const authorId = userMap.get(c.authorEmail);
    if (!authorId) continue;

    const existing = await prisma.comment.findFirst({
      where: { postId, authorId, body: c.body },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.comment.create({
      data: {
        postId,
        authorId,
        body: c.body,
        createdAt: daysAgo(c.ageDays),
        updatedAt: daysAgo(c.ageDays),
      },
    });
    commentCount++;
  }

  // Sync commentCount denorm
  for (const postId of postMap.values()) {
    const count = await prisma.comment.count({ where: { postId } });
    await prisma.post.update({ where: { id: postId }, data: { commentCount: count } });
  }
  console.log(`  ✓ ${commentCount} comments`);

  // 7. Create changelog entries
  let changelogCount = 0;
  for (const entry of CHANGELOG) {
    const existing = await prisma.changelogEntry.findUnique({
      where: { slug: entry.slug },
      select: { id: true },
    });
    if (existing) continue;

    const publishedAt = daysAgo(entry.publishedDaysAgo, 2);
    const linkedPostIds = entry.linkedPostTitles
      .map((t) => postMap.get(t))
      .filter((id): id is string => !!id);

    await prisma.changelogEntry.create({
      data: {
        slug: entry.slug,
        title: entry.title,
        body: entry.body,
        authorId: admin.id,
        publishedAt,
        createdAt: publishedAt,
        updatedAt: publishedAt,
        linkedPosts: {
          create: linkedPostIds.map((postId) => ({ postId })),
        },
      },
    });
    changelogCount++;
  }
  console.log(`  ✓ ${changelogCount} changelog entries`);

  console.log("\n✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
