const express = require('express');
const z = require('zod');
const db = require('../db');
const config = require('../config');
const { asyncHandler, AppError } = require('../middleware/errors');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  message: z.string().trim().min(5).max(5000)
});

// Best-effort: if the visitor is logged in, remember their user id on the message.
function userIdFromCookie(req) {
  try {
    const token = req.cookies && req.cookies[config.cookie.name];
    if (!token) return null;
    const payload = verifyToken(token);
    return payload.sub || null;
  } catch {
    return null;
  }
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('Invalid contact message', 400, parsed.error.flatten());
    }
    const { name, email, message } = parsed.data;
    const [id] = await db('contact_messages').insert({
      name,
      email,
      message,
      user_id: userIdFromCookie(req),
      status: 'new'
    });
    res.status(201).json({ ok: true, id });
  })
);

module.exports = router;