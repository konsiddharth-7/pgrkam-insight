import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

// ---------- Allowed values ----------
const EVENT_NAMES = [
  'session_start',
  'page_view',
  'register',
  'login',
  'logout',
  'profile_update',
  'job_search',
  'job_view',
  'job_save',
  'job_apply',
  'scheme_view',
  'service_view',
  'recommendation_impression',
  'recommendation_click',
];

const DEVICES = ['desktop', 'mobile', 'tablet'];

// ---------- Validation (Zod 4) ----------
// user_id is intentionally NOT here: it comes from the login token, never the body.
// Zod ignores unknown fields, so old clients that still send it will not break.
const eventSchema = z.object({
  event_id: z.uuid(),
  event_name: z.enum(EVENT_NAMES),
  session_id: z.string().min(1).max(100),
  event_time: z.iso.datetime({ offset: true }).optional(),
  anonymous_id: z.string().max(100).nullable().optional(),
  source: z.string().max(200).nullable().optional(),
  campaign: z.string().max(100).nullable().optional(),
  device: z.enum(DEVICES).nullable().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

// ---------- Source normalisation ----------
// "Google", "google.com", "https://www.google.com/search" -> "google"
const SOURCE_ALIASES = {
  fb: 'facebook',
  'm.facebook': 'facebook',
  t: 'twitter',
  x: 'twitter',
  ig: 'instagram',
  yt: 'youtube',
  wa: 'whatsapp',
};
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'nic', 'ac', 'edu']);

export function normaliseSource(raw) {
  if (!raw || typeof raw !== 'string') return 'direct';

  let s = raw.trim().toLowerCase();
  if (!s) return 'direct';

  s = s.replace(/^[a-z]+:\/\//, ''); // remove protocol
  s = s.split(/[/?#]/)[0]; // keep only the host part
  s = s.replace(/^www\./, '');

  if (s.includes('.')) {
    const labels = s.split('.');
    labels.pop(); // drop the TLD (com, in, org...)
    while (labels.length > 1 && SECOND_LEVEL.has(labels[labels.length - 1])) {
      labels.pop(); // drop co / com / gov in names like google.co.in
    }
    s = labels[labels.length - 1];
  }

  s = s.replace(/[^a-z0-9_-]/g, '');
  if (!s) return 'direct';
  return SOURCE_ALIASES[s] || s;
}

// ---------- Helper: save a rejected payload ----------
async function logRejected(payload, reason) {
  try {
    const safePayload =
      payload && typeof payload === 'object' ? payload : { raw: String(payload ?? '') };
    await prisma.rejected_events.create({
      data: { payload: safePayload, reason: reason.slice(0, 1000) },
    });
  } catch (err) {
    // Logging a rejection must never break the response
    console.error('Could not write to rejected_events:', err.message);
  }
}

// ---------- POST /api/events ----------
router.post('/', optionalAuth, async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);

  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({
      field: i.path.join('.') || '(body)',
      message: i.message,
    }));
    const reason = details.map((d) => `${d.field}: ${d.message}`).join('; ');
    await logRejected(req.body, reason);
    return res.status(400).json({ error: 'Invalid event', details });
  }

  const e = parsed.data;

  // A wrong clock in the browser must not create events in the future
  let eventTime = e.event_time ? new Date(e.event_time) : new Date();
  if (eventTime.getTime() > Date.now() + 5 * 60 * 1000) {
    eventTime = new Date();
  }

  try {
    const row = await prisma.user_events.create({
      data: {
        event_id: e.event_id,
        user_id: req.user?.id ?? null, // from the token, or null for anonymous visitors
        anonymous_id: e.anonymous_id ?? null,
        event_name: e.event_name,
        source: normaliseSource(e.source),
        campaign: e.campaign ?? null,
        device: e.device ?? null,
        session_id: e.session_id,
        event_time: eventTime,
        properties: e.properties ?? {},
      },
      select: { id: true },
    });

    // id is a BigInt, which JSON cannot send, so convert it to a string
    return res.status(201).json({ status: 'stored', id: row.id.toString() });
  } catch (err) {
    // P2002 = unique constraint failed (this event_id is already stored)
    if (err.code === 'P2002') {
      return res.status(200).json({ status: 'duplicate' });
    }
    throw err; // Express 5 sends this to the error handler in server.js
  }
});

export default router;
