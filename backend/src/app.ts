import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import { readSession } from './auth/session';
import { config } from './config';
import { emailQueue } from './queue/emailQueue';
import { authRouter } from './routes/auth';
import { emailsRouter } from './routes/emails';
import { slackRouter } from './routes/slack';
import { logger } from './utils/logger';

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.frontendUrl, credentials: true }));
  app.use(express.json({ limit: '2mb' })); // ~5000 recipients fit comfortably
  app.use(cookieParser());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/auth', authRouter);
  app.use('/api/emails', emailsRouter);
  app.use('/api/slack', slackRouter);

  // Live BullMQ dashboard at /admin/queues (logged-in users only).
  const boardAdapter = new ExpressAdapter();
  boardAdapter.setBasePath('/admin/queues');
  createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: boardAdapter });
  app.use(
    '/admin/queues',
    (req: Request, res: Response, next: NextFunction) => {
      if (!readSession(req)) return res.redirect(`${config.frontendUrl}/?next=queues`);
      next();
    },
    boardAdapter.getRouter(),
  );

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', err.stack ?? err.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
