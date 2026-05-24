/**
 * Phase 32 / J.3 — internal-secret enforcement.
 *
 * Asserts that:
 *  1. `internalAuth` returns 403 when X-Internal-Secret header is absent or wrong.
 *  2. `internalAuth` calls next() when the header matches process.env.INTERNAL_SECRET.
 *  3. The middleware is mounted at the `/internal` parent in src/index.ts so every
 *     internal sub-router inherits enforcement.
 *
 * No Mongo / no live network — pure middleware test.
 */
import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { internalAuth } from '../../src/middleware/internalAuth';

const SECRET = 'test-secret-abc123';

function buildReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function buildRes(): { res: Response; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

describe('internalAuth middleware', () => {
  const prevSecret = process.env.INTERNAL_SECRET;

  beforeAll(() => { process.env.INTERNAL_SECRET = SECRET; });
  afterAll(()  => { process.env.INTERNAL_SECRET = prevSecret; });

  it('403 when X-Internal-Secret header is missing', () => {
    const next = jest.fn();
    const { res, status } = buildRes();
    internalAuth(buildReq({}), res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('403 when X-Internal-Secret header is wrong', () => {
    const next = jest.fn();
    const { res, status } = buildRes();
    internalAuth(buildReq({ 'x-internal-secret': 'WRONG' }), res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes when X-Internal-Secret matches process.env.INTERNAL_SECRET', () => {
    const next = jest.fn();
    const { res, status } = buildRes();
    internalAuth(buildReq({ 'x-internal-secret': SECRET }), res, next);
    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('500 when INTERNAL_SECRET is not configured on the server', () => {
    delete process.env.INTERNAL_SECRET;
    const next = jest.fn();
    const { res, status } = buildRes();
    internalAuth(buildReq({ 'x-internal-secret': 'anything' }), res, next);
    expect(status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
    process.env.INTERNAL_SECRET = SECRET;
  });
});

describe('internal router mount', () => {
  it("src/index.ts mounts internalAuth on the '/internal' parent before any sub-router", () => {
    const source = fs.readFileSync(path.join(__dirname, '../../src/index.ts'), 'utf8');

    const guardIdx = source.indexOf("app.use('/internal', internalAuth)");
    expect(guardIdx).toBeGreaterThanOrEqual(0);

    // Every other `/internal/...` mount must come AFTER the guard line.
    const internalMountRe = /app\.use\('\/internal\/[^']+'/g;
    let match: RegExpExecArray | null;
    while ((match = internalMountRe.exec(source)) !== null) {
      expect(match.index).toBeGreaterThan(guardIdx);
    }
  });
});
